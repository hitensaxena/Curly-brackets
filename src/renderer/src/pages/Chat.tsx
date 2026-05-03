import { useEffect, useRef, useState, useMemo } from 'react'
import { Plus, Send, MessageSquare, Trash2, Bot, FileText, ChevronRight, GitBranch, Pin, X, Search } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Markdown } from '../components/Markdown'
import { ResizeHandle, usePersistedWidth } from '../components/ResizeHandle'
import { useAgentStore } from '../stores/agentStore'

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']

interface Conversation {
  id: string
  title: string
  projectId: string | null
  defaultModel: string
  defaultAgentId: string | null
  claudeSessionId: string | null
  pinnedSourceIds: string | null
  createdAt: number
  updatedAt: number
  lastMessageAt: number | null
}

interface Message {
  id: string
  conversationId: string
  role: string
  agentId: string | null
  content: string
  sources: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  createdAt: number
}

interface SourceRef {
  sourceId?: string | null
  sourceName?: string | null
  sourceType?: string | null
  kind: string
  path: string
  title: string | null
  headerChain: string[]
  score: number
}

interface Project { id: string; name: string; repoPath: string | null }

export function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [sidebarWidth, setSidebarWidth] = usePersistedWidth('chat:sidebarWidth', 224, 180, 480)
  const { agents, fetchAgents } = useAgentStore()

  const refreshConversations = async () => {
    const list = await window.api.chat.list() as Conversation[]
    setConversations(list)
  }

  useEffect(() => {
    refreshConversations()
    window.api.projects.list().then((p) => setProjects(p as Project[]))
    if (agents.length === 0) fetchAgents()
  }, [])

  // Live updates from main process
  useEffect(() => {
    const offCreated = window.api.on('chat:conversation:created', () => refreshConversations())
    const offDeleted = window.api.on('chat:conversation:deleted', () => refreshConversations())
    const offUpdated = window.api.on('chat:conversation:updated', () => refreshConversations())
    return () => { offCreated(); offDeleted(); offUpdated() }
  }, [])

  // Switch to forked conversation when ConversationView dispatches the event
  useEffect(() => {
    const handleForkOpen = async (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail
      await refreshConversations()
      setActiveId(detail.id)
    }
    window.addEventListener('chat:fork:open', handleForkOpen)
    return () => window.removeEventListener('chat:fork:open', handleForkOpen)
  }, [])

  const handleNew = async () => {
    const settings = await window.api.settings.all()
    const wf = await window.api.chat.create({
      defaultModel: settings.defaultClaudeModel ?? 'claude-sonnet-4-6'
    })
    setActiveId(wf.id)
    await refreshConversations()
  }

  const handleDelete = async (id: string) => {
    await window.api.chat.delete(id)
    if (activeId === id) setActiveId(null)
  }

  // Auto-pick the most recent conversation on first render
  useEffect(() => {
    if (!activeId && conversations.length > 0) setActiveId(conversations[0].id)
  }, [conversations, activeId])

  return (
    <div className="flex flex-1 h-full min-w-0">
      {/* Conversation list */}
      <div
        className="flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d14]"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chats</span>
          <button
            onClick={handleNew}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            title="New chat"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0 && (
            <div className="px-3 py-6 text-center">
              <MessageSquare size={20} className="text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-600 mb-3">No chats yet</p>
              <Button size="sm" onClick={handleNew}>
                <Plus size={11} /> New chat
              </Button>
            </div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer ${
                activeId === c.id
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              onClick={() => setActiveId(c.id)}
            >
              <MessageSquare size={11} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{c.title}</p>
                {c.lastMessageAt && (
                  <p className="text-[10px] text-slate-600">{relativeTime(c.lastMessageAt)}</p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-opacity cursor-pointer"
                title="Delete"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <ResizeHandle width={sidebarWidth} onResize={setSidebarWidth} min={180} max={480} />

      {/* Active conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeId ? (
          <ConversationView
            key={activeId}
            conversationId={activeId}
            projects={projects}
            agents={agents.map((a) => ({ id: a.id, name: a.name, provider: a.provider }))}
            onTitleChange={refreshConversations}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <MessageSquare size={36} className="text-slate-700 mx-auto mb-4" />
              <p className="text-base text-slate-300 mb-1">Start a conversation</p>
              <p className="text-xs text-slate-500 mb-5">
                Pick a project, choose a model, and ask anything. The chat uses your bound project as the working directory.
              </p>
              <Button onClick={handleNew}>
                <Plus size={14} /> New chat
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationView({
  conversationId,
  projects,
  agents,
  onTitleChange
}: {
  conversationId: string
  projects: Project[]
  agents: Array<{ id: string; name: string; provider: string }>
  onTitleChange: () => void
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingAgentId, setStreamingAgentId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const refresh = async () => {
    const data = await window.api.chat.get(conversationId)
    if (!data) return
    setConversation(data.conversation as Conversation)
    setMessages(data.messages as Message[])
  }

  useEffect(() => { refresh() }, [conversationId])

  // Subscribe to chat events for THIS conversation
  useEffect(() => {
    const offAdded = window.api.on('chat:message:added', (event: unknown) => {
      const e = event as { conversationId: string; message: Message }
      if (e.conversationId !== conversationId) return
      setMessages((curr) => {
        if (curr.find((m) => m.id === e.message.id)) return curr
        return [...curr, e.message]
      })
      // Final message arrived — clear the in-flight streaming state
      if (e.message.role === 'assistant' || e.message.role === 'system') {
        setStreaming(false)
        setStreamingMessageId(null)
        setStreamingContent('')
        setStreamingAgentId(null)
        onTitleChange()
      }
    })
    const offStreaming = window.api.on('chat:message:streaming', (event: unknown) => {
      const e = event as { conversationId: string; messageId: string; agentId?: string | null }
      if (e.conversationId !== conversationId) return
      setStreaming(true)
      setStreamingMessageId(e.messageId)
      setStreamingContent('')
      setStreamingAgentId(e.agentId ?? null)
    })
    const offDelta = window.api.on('chat:message:delta', (event: unknown) => {
      const e = event as { conversationId: string; messageId: string; content: string }
      if (e.conversationId !== conversationId) return
      // Use the cumulative `content` field from the broadcaster so we render the
      // full text without having to track deltas ourselves.
      setStreamingContent(e.content)
    })
    const offCleared = window.api.on('chat:conversation:cleared', (event: unknown) => {
      const e = event as { conversationId: string }
      if (e.conversationId === conversationId) setMessages([])
    })
    const offConvUpdated = window.api.on('chat:conversation:updated', (event: unknown) => {
      const e = event as { id: string } & Partial<Conversation>
      if (e.id === conversationId) setConversation((curr) => (curr ? { ...curr, ...e } as Conversation : curr))
    })
    return () => { offAdded(); offStreaming(); offDelta(); offCleared(); offConvUpdated() }
  }, [conversationId])

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, streaming])

  // Focus composer on mount + after streaming finishes
  useEffect(() => {
    if (!streaming) inputRef.current?.focus()
  }, [streaming, conversationId])

  const totalCost = useMemo(() => messages.reduce((sum, m) => sum + (m.costUsd ?? 0), 0), [messages])
  const totalTokens = useMemo(() =>
    messages.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0),
  [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setStreaming(true)
    try {
      await window.api.chat.send(conversationId, text)
    } catch (err) {
      console.error('chat.send failed', err)
      setStreaming(false)
    }
  }

  // Triggered by interactive genui components in any past message.
  // We send the action's text as a brand-new user message in this conversation.
  const handleGenUIAction = async (action: { sendMessage?: string; invokeAgent?: string }) => {
    if (streaming) return
    const text = action.sendMessage?.trim()
    if (!text) return
    setStreaming(true)
    try {
      await window.api.chat.send(conversationId, text)
    } catch (err) {
      console.error('chat.send (genui action) failed', err)
      setStreaming(false)
    }
  }

  // Wikilink click: search indexed sources for the target name; pin the best match.
  const handleWikilink = async (target: string) => {
    if (!conversation) return
    try {
      const results = await window.api.knowledge.chunks.search(target, {
        projectId: conversation.projectId,
        limit: 1
      })
      if (results.length === 0) {
        alert(`No indexed source matched "${target}".\n\nIndex an Obsidian vault or folder containing this note first.`)
        return
      }
      const pinned: string[] = (() => {
        try { return JSON.parse(conversation.pinnedSourceIds ?? '[]') as string[] }
        catch { return [] }
      })()
      const id = results[0].id
      if (pinned.includes(id)) return // already pinned
      await window.api.chat.update(conversation.id, { pinnedSourceIds: [...pinned, id] })
      refresh()
    } catch (err) {
      console.error('wikilink click failed', err)
    }
  }

  // Fork the conversation up to and including this message. Opens the new conv.
  const handleFork = async (messageId: string) => {
    try {
      const res = await window.api.chat.fork(conversationId, messageId)
      // Notify the parent to refresh + switch active conversation
      window.dispatchEvent(new CustomEvent('chat:fork:open', { detail: { id: res.id } }))
    } catch (err) {
      console.error('fork failed', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const updateProject = async (projectId: string | null) => {
    if (!conversation) return
    await window.api.chat.update(conversation.id, { projectId })
    setConversation({ ...conversation, projectId })
  }
  const updateModel = async (defaultModel: string) => {
    if (!conversation) return
    await window.api.chat.update(conversation.id, { defaultModel })
    setConversation({ ...conversation, defaultModel })
  }
  const updateAgent = async (defaultAgentId: string | null) => {
    if (!conversation) return
    await window.api.chat.update(conversation.id, { defaultAgentId })
    setConversation({ ...conversation, defaultAgentId })
  }

  if (!conversation) return null

  const projectName = conversation.projectId
    ? projects.find((p) => p.id === conversation.projectId)?.name
    : null

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <p className="text-sm font-medium text-slate-200 truncate flex-1">{conversation.title}</p>
        <select
          value={conversation.projectId ?? ''}
          onChange={(e) => updateProject(e.target.value || null)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
          title="Working project (cwd)"
        >
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>📁 {p.name}</option>)}
        </select>
        <select
          value={conversation.defaultModel}
          onChange={(e) => updateModel(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
          title="Model"
        >
          {CLAUDE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={conversation.defaultAgentId ?? ''}
          onChange={(e) => updateAgent(e.target.value || null)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
          title="Default agent (Phase 2 — currently unused)"
        >
          <option value="">Auto (no agent)</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <SourcesChip projectId={conversation.projectId} />
        <PinsButton conversation={conversation} onChanged={refresh} />
        <span className="text-[10px] text-slate-500 font-mono ml-2">
          ${totalCost.toFixed(4)} · {totalTokens.toLocaleString()} tok
        </span>
      </div>

      {/* Project breadcrumb if bound */}
      {projectName && (
        <div className="px-4 py-1.5 border-b border-white/5 flex-shrink-0 bg-white/2">
          <p className="text-[10px] text-slate-500">
            Working in <span className="text-indigo-300 font-mono">{projectName}</span>
          </p>
        </div>
      )}

      {/* Message thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-600 text-xs py-12 space-y-2">
            <p>Type below to start. Shift+Enter for newline.</p>
            <p>
              Try <code className="text-indigo-400">/help</code> for commands · prefix with{' '}
              <code className="text-amber-400">@AgentName</code> to invoke a specific agent.
            </p>
          </div>
        )}
        {messages.map((m) => <MessageBubble key={m.id} message={m} agents={agents} onAction={handleGenUIAction} onFork={handleFork} onWikilink={handleWikilink} />)}
        {streaming && (
          streamingContent
            ? <StreamingBubble content={streamingContent} agents={agents} agentId={streamingAgentId} onAction={handleGenUIAction} onWikilink={handleWikilink} />
            : <ThinkingBubble agents={agents} agentId={streamingAgentId} />
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 p-3 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? 'Waiting for reply...' : 'Ask anything (Enter to send, Shift+Enter for newline)'}
            disabled={streaming}
            rows={input.split('\n').length || 1}
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/50 resize-none placeholder:text-slate-600 disabled:opacity-60 max-h-40"
          />
          <Button onClick={handleSend} disabled={streaming || !input.trim()}>
            <Send size={12} /> Send
          </Button>
        </div>
      </div>
    </>
  )
}

function MessageBubble({ message, agents, onAction, onFork, onWikilink }: {
  message: Message
  agents: Array<{ id: string; name: string; provider: string }>
  onAction?: (a: { sendMessage?: string; invokeAgent?: string }) => void
  onFork?: (messageId: string) => void
  onWikilink?: (target: string) => void
}) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-1">
        <div className="max-w-[80%] rounded-md px-3 py-1.5 text-[11px] text-slate-400 bg-white/3 border border-white/5">
          <Markdown>{message.content}</Markdown>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'
  const agentName = message.agentId ? agents.find((a) => a.id === message.agentId)?.name : null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 relative ${
          isUser
            ? 'bg-indigo-500/10 border border-indigo-500/20 text-slate-200'
            : 'bg-white/3 border border-white/5 text-slate-200'
        }`}
      >
        {onFork && (
          <button
            onClick={() => onFork(message.id)}
            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#13131a] border border-white/10 rounded-md p-1 hover:border-indigo-500/40 hover:text-indigo-300 text-slate-500 cursor-pointer"
            title="Fork conversation from here"
          >
            <GitBranch size={11} />
          </button>
        )}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <Bot size={11} className={agentName ? 'text-amber-400' : 'text-indigo-400'} />
            <span className={`text-[10px] uppercase tracking-wider ${agentName ? 'text-amber-300' : 'text-slate-500'}`}>
              {agentName ?? 'Assistant'}
            </span>
            {message.costUsd > 0 && (
              <CostPill
                cost={message.costUsd}
                inputTokens={message.inputTokens}
                outputTokens={message.outputTokens}
              />
            )}
          </div>
        )}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <Markdown onAction={onAction} onWikilink={onWikilink}>{message.content}</Markdown>
            <SourcesPanel sourcesJson={message.sources} />
          </>
        )}
      </div>
    </div>
  )
}

function CostPill({ cost, inputTokens, outputTokens }: { cost: number; inputTokens: number; outputTokens: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ml-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-slate-600 hover:text-slate-300 cursor-pointer"
        title="Token + cost detail"
      >
        ${cost.toFixed(4)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 rounded-md border border-white/10 bg-[#0d0d14] shadow-xl p-2 w-44">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Cost breakdown</p>
            <div className="space-y-0.5 text-[11px] text-slate-300">
              <div className="flex justify-between"><span>Input</span><span className="font-mono">{inputTokens.toLocaleString()} tok</span></div>
              <div className="flex justify-between"><span>Output</span><span className="font-mono">{outputTokens.toLocaleString()} tok</span></div>
              <div className="flex justify-between border-t border-white/5 pt-0.5 mt-0.5"><span>Total</span><span className="font-mono">${cost.toFixed(6)}</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SourcesPanel({ sourcesJson }: { sourcesJson: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!sourcesJson) return null
  let sources: SourceRef[] = []
  try { sources = JSON.parse(sourcesJson) as SourceRef[] } catch { return null }
  if (sources.length === 0) return null

  // Group by source name (fall back to "Unknown source" for legacy chunks pre-multi-source)
  const groups = new Map<string, { name: string; type: string; items: Array<{ ref: SourceRef; idx: number }> }>()
  sources.forEach((s, i) => {
    const key = s.sourceId ?? s.sourceName ?? '__legacy__'
    const name = s.sourceName ?? 'Unknown source'
    const type = s.sourceType ?? s.kind ?? 'folder'
    if (!groups.has(key)) groups.set(key, { name, type, items: [] })
    groups.get(key)!.items.push({ ref: s, idx: i })
  })

  return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
      >
        <ChevronRight size={9} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <FileText size={9} />
        <span className="uppercase tracking-wider">
          {sources.length} source{sources.length === 1 ? '' : 's'} from {groups.size} {groups.size === 1 ? 'collection' : 'collections'}
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-2">
          {Array.from(groups.entries()).map(([key, group]) => (
            <div key={key} className="rounded bg-white/3 border border-white/5 px-2 py-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">{SOURCE_TYPE_ICONS[group.type] ?? '📦'}</span>
                <span className="text-[11px] font-medium text-slate-300 truncate">{group.name}</span>
                <span className="text-[10px] text-slate-600">· {group.items.length}</span>
              </div>
              <ul className="space-y-0.5 ml-5">
                {group.items.map(({ ref, idx }) => (
                  <li key={idx} className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-600 font-mono">[{idx + 1}]</span>{' '}
                    <span className="font-mono text-indigo-300">{ref.path}</span>
                    {ref.headerChain.length > 0 && (
                      <span className="text-slate-500"> › {ref.headerChain.join(' › ')}</span>
                    )}
                    <span className="text-slate-600 ml-1.5">({Math.round(ref.score * 100)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingBubble({ agents, agentId }: {
  agents: Array<{ id: string; name: string; provider: string }>
  agentId: string | null
}) {
  const agentName = agentId ? agents.find((a) => a.id === agentId)?.name : null
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-white/3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Bot size={11} className={`${agentName ? 'text-amber-400' : 'text-indigo-400'} animate-pulse`} />
          <span className={`text-[10px] uppercase tracking-wider ${agentName ? 'text-amber-300' : 'text-slate-500'}`}>
            {agentName ?? 'Assistant'}
          </span>
        </div>
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '120ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '240ms' }} />
        </div>
      </div>
    </div>
  )
}

function StreamingBubble({ content, agents, agentId, onAction, onWikilink }: {
  content: string
  agents: Array<{ id: string; name: string; provider: string }>
  agentId: string | null
  onAction?: (a: { sendMessage?: string; invokeAgent?: string }) => void
  onWikilink?: (target: string) => void
}) {
  const agentName = agentId ? agents.find((a) => a.id === agentId)?.name : null
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-white/3 border border-white/5 text-slate-200">
        <div className="flex items-center gap-1.5 mb-1">
          <Bot size={11} className={agentName ? 'text-amber-400' : 'text-indigo-400'} />
          <span className={`text-[10px] uppercase tracking-wider ${agentName ? 'text-amber-300' : 'text-slate-500'}`}>
            {agentName ?? 'Assistant'}
          </span>
          <span className="text-[10px] text-slate-600 ml-auto animate-pulse">streaming…</span>
        </div>
        <Markdown onAction={onAction} onWikilink={onWikilink}>{content}</Markdown>
      </div>
    </div>
  )
}

const SOURCE_TYPE_ICONS: Record<string, string> = {
  obsidian: '📓',
  folder: '📁',
  pdf: '📄',
  pdfFolder: '📚',
  url: '🌐',
  codebase: '💻'
}

function SourcesChip({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false)
  const [globalSources, setGlobalSources] = useState<Array<{ id: string; name: string; type: string; enabled: boolean; totalChunks: number }>>([])
  const [projectSources, setProjectSources] = useState<typeof globalSources>([])

  const refresh = async () => {
    if (!window.api.knowledge?.sources) return
    const [g, p] = await Promise.all([
      window.api.knowledge.sources.list({ scope: 'global' }),
      projectId ? window.api.knowledge.sources.list({ scope: 'project', projectId }) : Promise.resolve([])
    ])
    setGlobalSources(g.filter((s) => s.enabled))
    setProjectSources(p.filter((s) => s.enabled))
  }

  useEffect(() => { refresh() }, [projectId])
  useEffect(() => {
    const off = window.api.on('knowledge:sources:updated', () => refresh())
    return () => off()
  }, [projectId])

  const total = globalSources.length + projectSources.length
  if (total === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 cursor-pointer"
        title="Knowledge sources active for this conversation"
      >
        📚 {total} source{total === 1 ? '' : 's'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border border-white/10 bg-[#0d0d14] shadow-xl p-2">
            {projectSources.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 px-2 mb-1">Project sources</p>
                {projectSources.map((s) => (
                  <SourceRow key={s.id} source={s} />
                ))}
              </div>
            )}
            {globalSources.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 px-2 mb-1">Global sources</p>
                {globalSources.map((s) => (
                  <SourceRow key={s.id} source={s} />
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-600 px-2 pt-2 mt-2 border-t border-white/5">
              Disable a source from {projectId ? 'Settings or Projects → Knowledge' : 'Settings → Knowledge'}.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function SourceRow({ source }: { source: { name: string; type: string; totalChunks: number } }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/3">
      <span className="text-xs">{SOURCE_TYPE_ICONS[source.type] ?? '📦'}</span>
      <span className="text-xs text-slate-200 flex-1 truncate">{source.name}</span>
      <span className="text-[10px] text-slate-600">{source.totalChunks} chunks</span>
    </div>
  )
}

interface ChunkRef {
  id: string
  sourceId: string | null
  sourceName: string | null
  sourceType: string | null
  path: string
  title: string | null
  headerChain: string[]
}

function PinsButton({ conversation, onChanged }: { conversation: Conversation; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const pinnedIds: string[] = useMemo(() => {
    try { return JSON.parse(conversation.pinnedSourceIds ?? '[]') as string[] }
    catch { return [] }
  }, [conversation.pinnedSourceIds])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] cursor-pointer ${
          pinnedIds.length > 0
            ? 'text-amber-200 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25'
            : 'text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10'
        }`}
        title={pinnedIds.length > 0 ? `${pinnedIds.length} pinned` : 'Pin notes/files to this conversation'}
      >
        <Pin size={10} />
        {pinnedIds.length > 0 && <span>{pinnedIds.length}</span>}
      </button>
      {open && (
        <PinsModal
          conversation={conversation}
          pinnedIds={pinnedIds}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  )
}

function PinsModal({
  conversation, pinnedIds, onClose, onChanged
}: {
  conversation: Conversation
  pinnedIds: string[]
  onClose: () => void
  onChanged: () => void
}) {
  const [pinned, setPinned] = useState<ChunkRef[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChunkRef[]>([])
  const [searching, setSearching] = useState(false)

  // Resolve pinned chunk metadata
  useEffect(() => {
    if (pinnedIds.length === 0) { setPinned([]); return }
    window.api.knowledge.chunks.byIds(pinnedIds).then((chunks) => {
      // Strip content for the chip view (we only need metadata here)
      setPinned(chunks.map(({ content, ...rest }) => { void content; return rest }))
    }).catch((err) => console.error('chunks.byIds failed', err))
  }, [pinnedIds])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await window.api.knowledge.chunks.search(query.trim(), { projectId: conversation.projectId, limit: 20 })
        setResults(r)
      } catch (err) {
        console.error('chunks.search failed', err)
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, conversation.projectId])

  const updatePins = async (next: string[]) => {
    await window.api.chat.update(conversation.id, { pinnedSourceIds: next })
    onChanged()
  }

  const togglePin = (id: string) => {
    const next = pinnedIds.includes(id) ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id]
    updatePins(next)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#0d0d14] border border-white/10 rounded-lg p-5 w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-200">📌 Pinned context for this conversation</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white cursor-pointer"><X size={14} /></button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Pinned chunks are injected into every turn — use this for notes / files you want the model to always have in context.
        </p>

        {/* Currently pinned */}
        {pinned.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Currently pinned ({pinned.length})</p>
            <ul className="space-y-1">
              {pinned.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                  <span className="text-xs">{SOURCE_TYPE_ICONS[c.sourceType ?? ''] ?? '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-200 truncate">{c.title ?? c.path}</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate">
                      {c.sourceName && <span className="text-amber-300">{c.sourceName} › </span>}
                      {c.path}
                    </p>
                  </div>
                  <button onClick={() => togglePin(c.id)} className="text-amber-400 hover:text-amber-200 cursor-pointer" title="Unpin">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Search */}
        <div className="border-t border-white/5 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Add a pin</p>
          <div className="relative mb-2">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by note name or path…"
              className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
            />
          </div>
          <ul className="overflow-y-auto flex-1 space-y-0.5" style={{ minHeight: 0 }}>
            {searching && <li className="text-[11px] text-slate-500 px-2 py-1">Searching…</li>}
            {!searching && query && results.length === 0 && (
              <li className="text-[11px] text-slate-500 px-2 py-1">No matches. Try indexing more sources first.</li>
            )}
            {results.map((r) => {
              const isPinned = pinnedIds.includes(r.id)
              return (
                <li key={r.id}>
                  <button
                    onClick={() => togglePin(r.id)}
                    className={`w-full flex items-start gap-2 px-2 py-1.5 rounded text-left cursor-pointer ${
                      isPinned ? 'bg-amber-500/10 border border-amber-500/30' : 'border border-transparent hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs mt-0.5">{SOURCE_TYPE_ICONS[r.sourceType ?? ''] ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-200 truncate">{r.title ?? r.path}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">
                        {r.sourceName && <span className="text-amber-300/80">{r.sourceName} › </span>}
                        {r.path}
                      </p>
                    </div>
                    {isPinned && <Pin size={10} className="text-amber-400 mt-1 flex-shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}
