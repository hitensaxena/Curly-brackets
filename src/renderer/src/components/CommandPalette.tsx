import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, GitBranch, Folder, MessageSquare, Settings as SettingsIcon,
  Activity, Home as HomeIcon, Play, Plus, Search, ArrowRight
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAgentStore } from '../stores/agentStore'
import { useWorkflowStore } from '../stores/workflowStore'

type CommandKind = 'navigate' | 'agent' | 'workflow' | 'project' | 'conversation' | 'action'
type Page = 'home' | 'chat' | 'agents' | 'workflows' | 'projects' | 'command-center' | 'settings'

interface Command {
  id: string
  kind: CommandKind
  title: string
  subtitle?: string
  icon: React.ReactNode
  action: () => void | Promise<void>
  /** Lower number = higher rank for ties; recent first. */
  weight?: number
}

const PAGE_COMMANDS: Array<{ id: string; title: string; icon: React.ReactNode; page: Page; subtitle: string }> = [
  { id: 'nav-home', title: 'Home', icon: <HomeIcon size={13} />, page: 'home', subtitle: 'Dashboard with KPIs' },
  { id: 'nav-chat', title: 'Chat', icon: <MessageSquare size={13} />, page: 'chat', subtitle: 'Multi-agent conversations' },
  { id: 'nav-agents', title: 'Agents', icon: <Bot size={13} />, page: 'agents', subtitle: 'Manage your agents' },
  { id: 'nav-workflows', title: 'Workflows', icon: <GitBranch size={13} />, page: 'workflows', subtitle: 'Build + run pipelines' },
  { id: 'nav-projects', title: 'Projects', icon: <Folder size={13} />, page: 'projects', subtitle: 'Repo bindings + per-project knowledge' },
  { id: 'nav-command-center', title: 'Command Center', icon: <Activity size={13} />, page: 'command-center', subtitle: 'Live sessions + analytics' },
  { id: 'nav-settings', title: 'Settings', icon: <SettingsIcon size={13} />, page: 'settings', subtitle: 'API keys, knowledge, budgets' }
]

/**
 * Fuzzy match: every char of `query` (case-insensitive) must appear in `target`
 * in order. Returns -1 on miss, otherwise a small integer score (lower = better).
 */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let firstMatch = -1
  let lastMatch = -1
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (firstMatch === -1) firstMatch = i
      lastMatch = i
      qi++
    }
  }
  if (qi !== q.length) return -1
  // Prefer matches that start near the front and span a small range
  return firstMatch + (lastMatch - firstMatch) * 0.5
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { navigate } = useAppStore()
  const { agents } = useAgentStore()
  const { workflows, runWorkflow } = useWorkflowStore()
  const [projects, setProjects] = useState<Array<{ id: string; name: string; repoPath: string | null }>>([])
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; lastMessageAt: number | null }>>([])

  // Open / close shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Refresh data when opened
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
    Promise.all([
      window.api.projects.list(),
      window.api.chat.list()
    ]).then(([p, c]) => {
      setProjects(p as typeof projects)
      setConversations(c as typeof conversations)
    }).catch(() => { /* ignore */ })
  }, [open])

  const goAndClose = (page: Page) => { navigate(page); setOpen(false) }

  const allCommands: Command[] = useMemo(() => {
    const cmds: Command[] = []
    // Pages
    for (const p of PAGE_COMMANDS) {
      cmds.push({
        id: p.id, kind: 'navigate', title: p.title, subtitle: p.subtitle, icon: p.icon,
        action: () => goAndClose(p.page)
      })
    }
    // Quick actions
    cmds.push({
      id: 'action-new-chat', kind: 'action', title: 'New chat', subtitle: 'Start a fresh conversation',
      icon: <Plus size={13} />,
      action: async () => {
        const settings = await window.api.settings.all()
        await window.api.chat.create({ defaultModel: settings.defaultClaudeModel ?? 'claude-sonnet-4-6' })
        goAndClose('chat')
      }
    })
    cmds.push({
      id: 'action-new-agent', kind: 'action', title: 'Create agent', icon: <Plus size={13} />,
      action: () => goAndClose('agents')
    })
    cmds.push({
      id: 'action-new-workflow', kind: 'action', title: 'Create workflow', icon: <Plus size={13} />,
      action: () => goAndClose('workflows')
    })
    // Agents
    for (const a of agents) {
      cmds.push({
        id: `agent-${a.id}`, kind: 'agent', title: a.name,
        subtitle: `${a.provider} · ${a.model}${a.status === 'paused' ? ' · paused' : ''}`,
        icon: <Bot size={13} className={a.status === 'paused' ? 'text-amber-400' : 'text-indigo-400'} />,
        action: () => goAndClose('agents')
      })
    }
    // Workflows
    for (const w of workflows) {
      cmds.push({
        id: `workflow-${w.id}`, kind: 'workflow', title: w.name,
        subtitle: w.description || 'Open workflow',
        icon: <GitBranch size={13} className="text-violet-400" />,
        action: () => goAndClose('workflows')
      })
      cmds.push({
        id: `workflow-run-${w.id}`, kind: 'workflow', title: `Run: ${w.name}`,
        subtitle: 'Trigger this workflow now',
        icon: <Play size={13} className="text-green-400" />,
        action: async () => {
          await runWorkflow(w.id)
          setOpen(false)
        }
      })
    }
    // Projects
    for (const p of projects) {
      cmds.push({
        id: `project-${p.id}`, kind: 'project', title: p.name,
        subtitle: p.repoPath ?? 'No repo path',
        icon: <Folder size={13} className="text-cyan-400" />,
        action: () => goAndClose('projects')
      })
    }
    // Recent conversations (top 10)
    const recents = [...conversations]
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
      .slice(0, 10)
    for (const c of recents) {
      cmds.push({
        id: `conv-${c.id}`, kind: 'conversation', title: c.title,
        subtitle: c.lastMessageAt ? `${new Date(c.lastMessageAt).toLocaleString()}` : 'New',
        icon: <MessageSquare size={13} className="text-slate-400" />,
        action: () => goAndClose('chat')
      })
    }
    return cmds
  }, [agents, workflows, projects, conversations])

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands.slice(0, 50)
    return allCommands
      .map((c) => ({ c, score: fuzzyScore(query, `${c.title} ${c.subtitle ?? ''}`) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
      .slice(0, 50)
  }, [query, allCommands])

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0) }, [filtered])

  // Scroll active row into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-cmd-idx="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[activeIndex]
      if (cmd) void cmd.action()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-black/60" onClick={() => setOpen(false)}>
      <div
        className="bg-[#0d0d14] border border-white/10 rounded-lg shadow-2xl w-[640px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
          <Search size={14} className="text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to anything — agents, workflows, projects, chats…"
            className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
          <span className="text-[10px] text-slate-600 font-mono">{filtered.length}</span>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-500 px-3 py-6 text-center">No matches.</p>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              data-cmd-idx={i}
              onClick={() => c.action()}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer ${
                i === activeIndex ? 'bg-indigo-500/15 text-slate-100' : 'text-slate-300 hover:bg-white/3'
              }`}
            >
              <span className="flex-shrink-0">{c.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{c.title}</p>
                {c.subtitle && <p className="text-[10px] text-slate-500 truncate">{c.subtitle}</p>}
              </div>
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">{c.kind}</span>
              <ArrowRight size={10} className="text-slate-600 flex-shrink-0" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-white/5 text-[10px] text-slate-600">
          <span><kbd className="font-mono px-1 py-0.5 bg-white/5 rounded">↑ ↓</kbd> navigate</span>
          <span><kbd className="font-mono px-1 py-0.5 bg-white/5 rounded">↵</kbd> open</span>
          <span><kbd className="font-mono px-1 py-0.5 bg-white/5 rounded">Esc</kbd> close</span>
          <span className="ml-auto"><kbd className="font-mono px-1 py-0.5 bg-white/5 rounded">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}
