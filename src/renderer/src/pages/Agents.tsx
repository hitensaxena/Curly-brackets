import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Play, Square, Trash2, Bot } from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAgentStore } from '../stores/agentStore'
import { Agent, AgentRole, AgentTool, Provider } from '@shared/types'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

const ROLE_LABELS: Record<AgentRole, string> = {
  orchestrator: 'Orchestrator', coder: 'Coder', reviewer: 'Reviewer',
  researcher: 'Researcher', writer: 'Writer', tester: 'Tester',
  analyst: 'Analyst', custom: 'Custom'
}

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']
const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash']

const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  orchestrator: 'You are an AI orchestrator. You analyze complex tasks, break them into subtasks, and delegate to specialist agents. Think step by step and always verify results before completing.',
  coder: 'You are a senior software engineer. You write clean, efficient, well-tested code. You always verify your changes work before marking tasks complete.',
  reviewer: 'You are a critical code reviewer. You check for bugs, security issues, performance problems, and code style. You provide specific, actionable feedback.',
  researcher: 'You are a research specialist. You find relevant information, synthesize it clearly, and always cite sources.',
  writer: 'You are a technical writer. You create clear, concise documentation adapted to the target audience.',
  tester: 'You are a QA engineer. You write comprehensive tests, identify edge cases, and ensure code quality.',
  analyst: 'You are a data analyst. You analyze data, identify patterns, and present findings clearly.',
  custom: ''
}

function useXterm(sessionId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(sessionId)
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)

  // Keep ref in sync so the resize handler always sees the current sessionId
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: {
        background: '#0a0a0f',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: '#6366f144',
        black: '#0a0a0f', brightBlack: '#334155',
        white: '#e2e8f0', brightWhite: '#f8fafc',
        cyan: '#22d3ee', brightCyan: '#67e8f9',
        green: '#22c55e', brightGreen: '#4ade80',
        yellow: '#f59e0b', brightYellow: '#fbbf24',
        blue: '#6366f1', brightBlue: '#818cf8',
        magenta: '#a855f7', brightMagenta: '#c084fc',
        red: '#ef4444', brightRed: '#f87171'
      },
      fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    // Notify PTY whenever xterm resizes so cols/rows stay in sync
    const resizeDispose = term.onResize(({ cols, rows }) => {
      const sid = sessionIdRef.current
      if (sid) window.api.agents.resizeSession(sid, cols, rows)
    })

    // Pipe every keystroke (incl. arrow keys, Tab, Ctrl+C, modifiers, paste, etc.)
    // straight into the PTY. This is what makes the terminal behave like a real terminal
    // and lets the user navigate Claude/Gemini TUIs natively.
    const dataDispose = term.onData((data) => {
      const sid = sessionIdRef.current
      if (sid) window.api.agents.sendInput(sid, data)
    })

    // Track whether user has scrolled away from the bottom; show jump button if so
    const scrollDispose = term.onScroll(() => {
      const buf = term.buffer.active
      const atBottom = buf.viewportY >= buf.baseY - 1
      setShowJumpToBottom(!atBottom)
    })

    const doFit = () => {
      fit.fit()
    }

    // Deferred fit so the container has been painted with real dimensions
    const t1 = setTimeout(doFit, 50)
    const t2 = setTimeout(doFit, 200)

    termRef.current = term
    fitRef.current = fit

    // Re-fit whenever the container is resized
    const ro = new ResizeObserver(doFit)
    ro.observe(containerRef.current)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      ro.disconnect()
      resizeDispose.dispose()
      dataDispose.dispose()
      scrollDispose.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom()
    setShowJumpToBottom(false)
  }, [])

  // Listener + buffer replay — register first, then replay so no output is missed
  useEffect(() => {
    if (!sessionId) return

    const unsub = window.api.on('agent:output', (event: unknown) => {
      const e = event as { sessionId: string; data: string }
      if (e.sessionId === sessionId && termRef.current) {
        termRef.current.write(e.data)
      }
    })

    // Replay any output that was emitted before this listener registered
    window.api.agents.getBuffer(sessionId).then((buffered: string) => {
      if (buffered && termRef.current) {
        termRef.current.clear()
        termRef.current.write(buffered)
        termRef.current.focus()
      }
    })

    // Focus immediately so the user can start typing right away
    termRef.current?.focus()

    return unsub
  }, [sessionId])

  const fit = useCallback(() => {
    setTimeout(() => fitRef.current?.fit(), 50)
  }, [])

  return { containerRef, fit, showJumpToBottom, scrollToBottom }
}

export function Agents() {
  const { agents, fetchAgents, createAgent, startSession, killSession, deleteAgent } = useAgentStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [activeTab, setActiveTab] = useState<'terminal' | 'messages' | 'memory' | 'files' | 'config'>('terminal')
  const [projectMap, setProjectMap] = useState<Map<string, { id: string; name: string; repoPath: string | null }>>(new Map())

  useEffect(() => {
    window.api.projects.list().then((list) => {
      const m = new Map<string, { id: string; name: string; repoPath: string | null }>()
      for (const p of list as Array<{ id: string; name: string; repoPath: string | null }>) m.set(p.id, p)
      setProjectMap(m)
    })
  }, [showCreate])

  // Open the create modal when ⌘⇧A is pressed anywhere
  useEffect(() => {
    const open = () => setShowCreate(true)
    window.addEventListener('shortcut:new-agent', open)
    return () => window.removeEventListener('shortcut:new-agent', open)
  }, [])

  const selectedAgent = agents.find((a) => a.id === selectedId) || agents[0] || null
  const selectedProject = selectedAgent?.projectId ? projectMap.get(selectedAgent.projectId) : null

  const activeSessionId = selectedAgent?.activeSessionId || null
  const { containerRef: termRef, fit: fitTerm, showJumpToBottom, scrollToBottom } = useXterm(activeSessionId)

  useEffect(() => { fetchAgents() }, [])

  const handleStart = async () => {
    if (!selectedAgent) return
    await startSession(selectedAgent.id)
    fitTerm()
  }

  const handleKill = async () => {
    if (!selectedAgent) return
    await killSession(selectedAgent.id)
  }

  return (
    <div className="flex flex-1 h-full min-w-0">
      {/* Agent List */}
      <div className="w-48 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d14]">
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agents</span>
          <button
            onClick={() => setShowCreate(true)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                selectedAgent?.id === agent.id
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                agent.status === 'running' ? 'bg-green-400 animate-pulse' :
                agent.status === 'error' ? 'bg-red-400' : 'bg-slate-600'
              }`} />
              <span className="text-xs truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Agent Detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedAgent ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Bot size={16} className="text-indigo-400 flex-shrink-0" />
                <span className="font-medium text-slate-200 truncate">{selectedAgent.name}</span>
                <Badge variant={selectedAgent.provider === 'claude' ? 'claude' : 'gemini'}>
                  {selectedAgent.provider}
                </Badge>
                <Badge variant="muted">{selectedAgent.model}</Badge>
                <Badge variant={
                  selectedAgent.status === 'running' ? 'success' :
                  selectedAgent.status === 'error' ? 'error' : 'muted'
                }>
                  {selectedAgent.status}
                </Badge>
                {selectedProject && (
                  <Badge variant="default" title={selectedProject.repoPath ?? undefined}>
                    📁 {selectedProject.name}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedAgent.status === 'idle' || selectedAgent.status === 'error' ? (
                  <Button size="sm" variant="success" onClick={handleStart}>
                    <Play size={12} /> Run
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={handleKill}>
                    <Square size={12} /> Kill
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditingAgent(selectedAgent)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteAgent(selectedAgent.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/5 flex-shrink-0">
              {(['terminal', 'messages', 'memory', 'files', 'config'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-medium capitalize transition-colors cursor-pointer border-b-2 ${
                    activeTab === tab
                      ? 'border-indigo-500 text-indigo-300'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Terminal — full keyboard goes straight to PTY */}
            {activeTab === 'terminal' && (
              <div
                className="flex-1 min-h-0 relative"
                onClick={() => { /* delegate focus to xterm */ }}
              >
                <div
                  ref={termRef}
                  className="absolute inset-0 p-2"
                  onMouseDown={(e) => {
                    // Always re-focus xterm on any click in the terminal area,
                    // including the padding around the canvas
                    if (e.currentTarget === e.target) {
                      const canvas = e.currentTarget.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
                      canvas?.focus()
                    }
                  }}
                />
                {!activeSessionId && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-xs text-slate-600">Click <span className="text-slate-400">Run</span> to start a session</p>
                  </div>
                )}
                {showJumpToBottom && (
                  <button
                    onClick={scrollToBottom}
                    className="absolute bottom-3 right-3 px-2.5 py-1.5 rounded-full bg-indigo-500/90 hover:bg-indigo-500 text-white text-xs font-medium shadow-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    ↓ Jump to latest
                  </button>
                )}
              </div>
            )}

            {/* Messages tab — incoming + outgoing for this agent */}
            {activeTab === 'messages' && (
              <AgentMessagesTab agentId={selectedAgent.id} agents={agents} />
            )}

            {/* Memory tab — view + edit agent's CLAUDE.md / GEMINI.md */}
            {activeTab === 'memory' && (
              <AgentMemoryTab key={selectedAgent.id} agentId={selectedAgent.id} />
            )}

            {/* Files tab — workspace + bound project */}
            {activeTab === 'files' && (
              <AgentFilesTab key={selectedAgent.id} agentId={selectedAgent.id} />
            )}

            {/* Config tab */}
            {activeTab === 'config' && (
              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-4 max-w-xl">
                  <ConfigRow label="Role" value={ROLE_LABELS[selectedAgent.role]} />
                  <ConfigRow label="Provider" value={selectedAgent.provider} />
                  <ConfigRow label="Model" value={selectedAgent.model} />
                  <ConfigRow label="Project" value={selectedProject ? `${selectedProject.name}${selectedProject.repoPath ? ` (${selectedProject.repoPath})` : ''}` : 'None — sandboxed in agent workspace'} />
                  <ConfigRow label="Tools" value={selectedAgent.toolsEnabled.join(', ') || 'none'} />
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">System Prompt</label>
                    <div className="text-xs text-slate-300 bg-white/3 border border-white/5 rounded p-3 whitespace-pre-wrap">
                      {selectedAgent.systemPrompt || '(none)'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Bot size={32} className="text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select an agent or create one</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Create Agent
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreate && <CreateAgentModal onClose={() => setShowCreate(false)} onCreate={createAgent} />}
      {editingAgent && (
        <CreateAgentModal
          editing={editingAgent}
          onClose={async () => { setEditingAgent(null); await fetchAgents() }}
          onCreate={createAgent}
        />
      )}
    </div>
  )
}

interface AgentMsg {
  id: string
  fromAgentId: string | null
  toAgentId: string | null
  content: string
  timestamp: number
  read: number
}

function AgentMessagesTab({ agentId, agents }: { agentId: string; agents: Agent[] }) {
  const [messages, setMessages] = useState<AgentMsg[]>([])
  const [composeTo, setComposeTo] = useState<string>('')
  const [composeContent, setComposeContent] = useState('')
  const [sending, setSending] = useState(false)

  const refresh = async () => {
    // Fetch both incoming and outgoing for this agent
    const [incoming, outgoing] = await Promise.all([
      window.api.messages.list({ toAgentId: agentId, limit: 100 }) as Promise<AgentMsg[]>,
      window.api.messages.list({ fromAgentId: agentId, limit: 100 }) as Promise<AgentMsg[]>
    ])
    const merged = [...incoming, ...outgoing]
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      .sort((a, b) => b.timestamp - a.timestamp)
    setMessages(merged)
  }

  useEffect(() => {
    refresh()
    const unsub = window.api.on('message:new', () => refresh())
    return unsub
  }, [agentId])

  useEffect(() => {
    if (!composeTo && agents.length > 0) {
      const first = agents.find((a) => a.id !== agentId) ?? agents[0]
      setComposeTo(first.id)
    }
  }, [agents, agentId])

  const nameOf = (id: string | null) => agents.find((a) => a.id === id)?.name ?? (id === null ? 'User' : '(deleted)')

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!composeContent.trim() || !composeTo) return
    setSending(true)
    await window.api.messages.send({
      fromAgentId: agentId,
      toAgentId: composeTo,
      content: composeContent.trim()
    })
    setComposeContent('')
    setSending(false)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <form onSubmit={handleSend} className="p-3 border-b border-white/5 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Send to</span>
          <select
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500/50 cursor-pointer"
          >
            {agents.filter((a) => a.id !== agentId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            value={composeContent}
            onChange={(e) => setComposeContent(e.target.value)}
            placeholder="Message body..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
          />
          <Button type="submit" size="sm" disabled={sending || !composeContent.trim() || !composeTo}>
            Send
          </Button>
        </div>
      </form>
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {messages.length === 0 && (
          <p className="text-xs text-slate-600 p-6 text-center">No messages for this agent yet.</p>
        )}
        {messages.map((m) => {
          const isIncoming = m.toAgentId === agentId
          return (
            <div key={m.id} className={`px-4 py-2.5 ${isIncoming && !m.read ? 'bg-indigo-500/5' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {isIncoming ? 'from' : 'to'}
                </span>
                <span className="text-xs text-slate-300">
                  {isIncoming ? nameOf(m.fromAgentId) : nameOf(m.toAgentId)}
                </span>
                {isIncoming && !m.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
                <span className="ml-auto text-[10px] text-slate-600">{new Date(m.timestamp).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-200 whitespace-pre-wrap">{m.content}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgentMemoryTab({ agentId }: { agentId: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [path, setPath] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.agents.readMemory(agentId).then((m) => {
      if (cancelled) return
      if (m) {
        setContent(m.content)
        setOriginalContent(m.content)
        setPath(m.path)
      } else {
        setContent('')
        setOriginalContent('')
        setPath('(no memory file)')
      }
    })
    return () => { cancelled = true }
  }, [agentId])

  const dirty = content !== null && content !== originalContent

  const handleSave = async () => {
    if (content == null) return
    setSaving(true)
    await window.api.agents.writeMemory(agentId, content)
    setOriginalContent(content)
    setSavedAt(Date.now())
    setSaving(false)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 flex-shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Memory file</p>
        <p className="text-[11px] text-slate-400 font-mono truncate">{path}</p>
        <div className="ml-auto flex items-center gap-2">
          {savedAt && !dirty && <span className="text-[10px] text-green-400">saved</span>}
          {dirty && <span className="text-[10px] text-amber-400">unsaved changes</span>}
          <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-3">
        <textarea
          value={content ?? ''}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          placeholder={content == null ? 'Loading...' : 'Memory file is empty. Write notes here that the agent will see at the start of every session.'}
          className="w-full h-full bg-white/3 border border-white/5 rounded p-3 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500/50 resize-none leading-relaxed"
        />
      </div>
      <p className="text-[10px] text-slate-600 px-3 pb-2 leading-relaxed">
        This file is auto-loaded by Claude/Gemini at session start (via <code className="text-indigo-400">--add-dir</code> /
        <code className="text-indigo-400 ml-1">--include-directories</code>). Session summaries are auto-appended at the end.
      </p>
    </div>
  )
}

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size?: number
  mtime?: number
}

interface FileRoot {
  label: string
  path: string
}

function AgentFilesTab({ agentId }: { agentId: string }) {
  const [roots, setRoots] = useState<FileRoot[]>([])
  const [activeRoot, setActiveRoot] = useState<string | null>(null)
  const [tree, setTree] = useState<Record<string, FileEntry[]>>({}) // dir relative path → entries
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [openFile, setOpenFile] = useState<{ relPath: string; content: string; size: number; truncated: boolean } | null>(null)
  const [editedContent, setEditedContent] = useState<string | null>(null)
  const [savingFile, setSavingFile] = useState(false)

  useEffect(() => {
    window.api.agents.roots(agentId).then((rs) => {
      setRoots(rs)
      if (rs.length > 0) setActiveRoot(rs[0].path)
    })
  }, [agentId])

  useEffect(() => {
    if (!activeRoot) return
    setTree({})
    setExpanded(new Set(['']))
    setOpenFile(null)
    setEditedContent(null)
    window.api.agents.listFiles(agentId, activeRoot).then((entries) => {
      setTree({ '': entries })
    })
  }, [activeRoot, agentId])

  const toggleDir = async (relPath: string) => {
    const next = new Set(expanded)
    if (next.has(relPath)) {
      next.delete(relPath)
      setExpanded(next)
      return
    }
    next.add(relPath)
    setExpanded(next)
    if (!tree[relPath] && activeRoot) {
      const entries = await window.api.agents.listFiles(agentId, activeRoot, relPath)
      setTree((t) => ({ ...t, [relPath]: entries }))
    }
  }

  const openFileAt = async (relPath: string) => {
    if (!activeRoot) return
    const file = await window.api.agents.readFile(agentId, activeRoot, relPath)
    setOpenFile({ relPath, ...file })
    setEditedContent(file.content)
  }

  const saveOpenFile = async () => {
    if (!activeRoot || !openFile || editedContent == null) return
    setSavingFile(true)
    await window.api.agents.writeFile(agentId, activeRoot, openFile.relPath, editedContent)
    setOpenFile({ ...openFile, content: editedContent })
    setSavingFile(false)
  }

  const fileDirty = openFile != null && editedContent != null && editedContent !== openFile.content

  const renderEntries = (parentRel: string, depth = 0): React.ReactElement[] => {
    const entries = tree[parentRel]
    if (!entries) return []
    return entries.flatMap((e) => {
      const isOpen = expanded.has(e.path)
      const isActiveFile = openFile?.relPath === e.path
      const row = (
        <button
          key={e.path}
          onClick={() => (e.isDir ? toggleDir(e.path) : openFileAt(e.path))}
          className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-white/5 cursor-pointer ${
            isActiveFile ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-300'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-slate-500 w-3 inline-block">
            {e.isDir ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span className={e.isDir ? 'text-amber-300' : 'text-slate-400'}>
            {e.isDir ? '📁' : '📄'}
          </span>
          <span className="truncate flex-1">{e.name}</span>
          {!e.isDir && e.size != null && (
            <span className="text-[10px] text-slate-600">{formatBytes(e.size)}</span>
          )}
        </button>
      )
      return e.isDir && isOpen ? [row, ...renderEntries(e.path, depth + 1)] : [row]
    })
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-64 border-r border-white/5 bg-[#0d0d14] flex flex-col">
        <div className="px-2 py-2 border-b border-white/5 flex flex-col gap-1">
          {roots.map((r) => (
            <button
              key={r.path}
              onClick={() => setActiveRoot(r.path)}
              className={`px-2 py-1 rounded text-[11px] text-left cursor-pointer ${
                activeRoot === r.path ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:bg-white/5'
              }`}
              title={r.path}
            >
              <span className="truncate">{r.label}</span>
            </button>
          ))}
          {roots.length === 0 && (
            <p className="text-xs text-slate-600 p-2">No roots</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {renderEntries('')}
          {tree[''] && tree[''].length === 0 && (
            <p className="text-xs text-slate-600 p-3 text-center">Empty</p>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {!openFile ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-slate-600">Select a file to view</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 flex-shrink-0">
              <p className="text-[11px] text-slate-300 font-mono truncate flex-1">{openFile.relPath}</p>
              <span className="text-[10px] text-slate-600">{formatBytes(openFile.size)}</span>
              {openFile.truncated && <span className="text-[10px] text-amber-400">truncated</span>}
              {fileDirty && <span className="text-[10px] text-amber-400">unsaved</span>}
              <Button size="sm" variant="ghost" onClick={saveOpenFile} disabled={savingFile || !fileDirty || openFile.truncated}>
                {savingFile ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <textarea
              value={editedContent ?? ''}
              onChange={(e) => setEditedContent(e.target.value)}
              spellCheck={false}
              readOnly={openFile.truncated}
              className="flex-1 min-h-0 bg-[#0a0a0f] text-xs font-mono text-slate-200 outline-none p-3 resize-none leading-relaxed"
            />
          </>
        )}
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)}K`
  return `${(n / 1_048_576).toFixed(1)}M`
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-0.5">{label}</label>
      <div className="text-sm text-slate-300">{value}</div>
    </div>
  )
}

function CreateAgentModal({ onClose, onCreate, editing }: {
  onClose: () => void
  onCreate: (config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'activeSessionId' | 'memoryPath'>) => Promise<Agent>
  editing?: Agent | null
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [role, setRole] = useState<AgentRole>(editing?.role ?? 'coder')
  const [provider, setProvider] = useState<Provider>(editing?.provider ?? 'claude')
  const [defaults, setDefaults] = useState<{ claude: string; gemini: string }>({
    claude: 'claude-sonnet-4-6', gemini: 'gemini-2.5-pro'
  })
  const [model, setModel] = useState(editing?.model ?? 'claude-sonnet-4-6')

  useEffect(() => {
    if (editing) return
    window.api.settings.all().then((s) => {
      const claude = s.defaultClaudeModel ?? 'claude-sonnet-4-6'
      const gemini = s.defaultGeminiModel ?? 'gemini-2.5-pro'
      setDefaults({ claude, gemini })
      setModel(provider === 'claude' ? claude : gemini)
    })
  }, [])
  const [systemPrompt, setSystemPrompt] = useState(editing?.systemPrompt ?? SYSTEM_PROMPTS.coder)
  const [tools, setTools] = useState<AgentTool[]>(editing?.toolsEnabled ?? ['bash', 'file_read', 'file_write'])
  const [projectId, setProjectId] = useState<string | null>(editing?.projectId ?? null)
  const [dailyBudget, setDailyBudget] = useState<string>(
    editing?.dailyBudgetUsd != null ? String(editing.dailyBudgetUsd) : ''
  )
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string; repoPath: string | null }>>([])
  const [loading, setLoading] = useState(false)
  const isEditing = !!editing

  useEffect(() => {
    window.api.projects.list().then((p) => setProjectList(p as Array<{ id: string; name: string; repoPath: string | null }>))
  }, [])

  const handleRoleChange = (r: AgentRole) => {
    setRole(r)
    setSystemPrompt(SYSTEM_PROMPTS[r] || '')
  }

  const handleProviderChange = (p: Provider) => {
    setProvider(p)
    setModel(p === 'claude' ? defaults.claude : defaults.gemini)
  }

  const toggleTool = (tool: AgentTool) => {
    setTools((prev) => prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const dailyBudgetUsd = dailyBudget.trim() === '' ? null : Math.max(0, parseFloat(dailyBudget))
    if (isEditing && editing) {
      await window.api.agents.update(editing.id, {
        name, role, provider, model, systemPrompt, toolsEnabled: tools, projectId, dailyBudgetUsd
      })
    } else {
      await onCreate({ name, description: '', role, provider, model, systemPrompt, toolsEnabled: tools, projectId, dailyBudgetUsd })
    }
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13131a] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">{isEditing ? 'Edit Agent' : 'Create Agent'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-lg leading-none cursor-pointer">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Name *">
            <input className={INPUT} placeholder="Senior Coder" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field label="Role">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ROLE_LABELS) as AgentRole[]).map((r) => (
                <button
                  key={r} type="button"
                  onClick={() => handleRoleChange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                    role === r ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-white/10 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <div className="flex gap-2">
                {(['claude', 'gemini'] as Provider[]).map((p) => (
                  <button
                    key={p} type="button"
                    onClick={() => handleProviderChange(p)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer capitalize ${
                      provider === p ? (p === 'claude' ? 'bg-amber-600/20 border-amber-600/50 text-amber-400' : 'bg-blue-500/20 border-blue-500/50 text-blue-300') : 'border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Model">
              <select className={INPUT} value={model} onChange={(e) => setModel(e.target.value)}>
                {(provider === 'claude' ? CLAUDE_MODELS : GEMINI_MODELS).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Project (optional)">
            <select
              className={INPUT}
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
            >
              <option value="">No project — sandbox in agent workspace</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.repoPath ? ` — ${p.repoPath}` : ' (no path)'}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-600 mt-1">
              Agent runs with the project's repo as cwd, so it can read/edit those files.
            </p>
          </Field>

          <Field label="Daily budget cap (USD, optional)">
            <input
              type="number"
              step="0.01"
              min="0"
              className={INPUT}
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              placeholder="e.g. 5.00 — leave blank for no cap"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              When today's spend reaches this, the agent auto-pauses until you unpause it or the day rolls over.
            </p>
          </Field>

          <Field label="System Prompt">
            <textarea
              className={`${INPUT} resize-none`} rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe this agent's role and behavior..."
            />
          </Field>

          <Field label="Tools">
            <div className="flex flex-wrap gap-1.5">
              {(['bash', 'file_read', 'file_write', 'web_search', 'web_fetch'] as AgentTool[]).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => toggleTool(t)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors cursor-pointer ${
                    tools.includes(t) ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-white/10 text-slate-500 hover:border-white/20'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save changes' : 'Create Agent')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

const INPUT = 'w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/50 placeholder:text-slate-600'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
