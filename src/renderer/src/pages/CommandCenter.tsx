import { useEffect, useMemo, useState } from 'react'
import { Bot, DollarSign, Zap, CheckCircle, AlertCircle, Clock, Send, MessageSquare } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAgentStore } from '../stores/agentStore'
import { useAppStore } from '../stores/appStore'
import { useWorkflowStore } from '../stores/workflowStore'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import type { WorkflowRun } from '@shared/types'

interface AgentMessage {
  id: string
  fromAgentId: string | null
  toAgentId: string | null
  workflowRunId: string | null
  contentType: string
  content: string
  priority: string
  timestamp: number
  read: number
}

export function CommandCenter() {
  const agents = useAgentStore((s) => s.agents)
  const { todaySummary, notifications, cliHealth } = useAppStore()

  const runningAgents = agents.filter((a) => a.status === 'running')

  const costToday = todaySummary?.totalCostUsd ?? 0
  const tokensToday = (todaySummary?.totalInputTokens ?? 0) + (todaySummary?.totalOutputTokens ?? 0)

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Command Center</h1>
        <p className="text-xs text-slate-500 mt-0.5">Real-time overview of all agents and activity</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KPICard label="Running" value={runningAgents.length} icon={<Bot size={16} className="text-green-400" />} color="green" />
        <KPICard label="Total Agents" value={agents.length} icon={<Bot size={16} className="text-indigo-400" />} color="indigo" />
        <KPICard label="Today's Cost" value={`$${costToday.toFixed(4)}`} icon={<DollarSign size={16} className="text-amber-400" />} color="amber" />
        <KPICard label="Tokens Today" value={formatTokens(tokensToday)} icon={<Zap size={16} className="text-blue-400" />} color="blue" />
      </div>

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Workflow Runs & Usage</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <WorkflowRunsPanel />
        <UsageChartPanel />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Active Sessions */}
        <div className="rounded-lg border border-white/5 bg-white/2">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-medium text-slate-300">Agent Sessions</h2>
          </div>
          <div className="divide-y divide-white/5">
            {agents.length === 0 && (
              <p className="text-xs text-slate-500 p-4">No agents created yet.</p>
            )}
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  agent.status === 'running' ? 'bg-green-400 animate-pulse' :
                  agent.status === 'error' ? 'bg-red-400' : 'bg-slate-600'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{agent.name}</p>
                  <p className="text-xs text-slate-600">{agent.model}</p>
                </div>
                <Badge variant={agent.provider === 'claude' ? 'claude' : 'gemini'} className="text-[10px]">
                  {agent.provider}
                </Badge>
                <Badge variant={
                  agent.status === 'running' ? 'success' :
                  agent.status === 'error' ? 'error' : 'muted'
                } className="text-[10px]">
                  {agent.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* CLI Health */}
        <div className="rounded-lg border border-white/5 bg-white/2">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-medium text-slate-300">CLI Health</h2>
          </div>
          <div className="p-4 space-y-3">
            <CLIHealthRow
              name="Claude Code CLI"
              available={cliHealth?.claude.available ?? false}
              version={cliHealth?.claude.version}
              path={cliHealth?.claude.path}
            />
            <CLIHealthRow
              name="Gemini CLI"
              available={cliHealth?.gemini.available ?? false}
              version={cliHealth?.gemini.version}
              path={cliHealth?.gemini.path}
            />
          </div>

          {/* Usage breakdown */}
          {todaySummary && (
            <div className="px-4 pb-4 border-t border-white/5 pt-3">
              <h3 className="text-xs text-slate-500 mb-2">Today by Provider</h3>
              <div className="space-y-2">
                {(['claude', 'gemini'] as const).map((p) => {
                  const data = todaySummary.byProvider[p]
                  const pct = tokensToday > 0 ? (data.tokens / tokensToday) * 100 : 0
                  return (
                    <div key={p}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={p === 'claude' ? 'text-amber-400' : 'text-blue-400'}>{p}</span>
                        <span className="text-slate-500">${data.costUsd.toFixed(4)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full ${p === 'claude' ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inter-agent messaging */}
      <MessagingPanel />

      {/* Activity Feed */}
      <div className="rounded-lg border border-white/5 bg-white/2 mt-4">
        <div className="px-4 py-3 border-b border-white/5">
          <h2 className="text-sm font-medium text-slate-300">Activity Feed</h2>
        </div>
        <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="text-xs text-slate-500 p-4">No activity yet. Start an agent to see events here.</p>
          )}
          {notifications.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 px-4 py-2.5 ${!n.read ? 'bg-white/2' : ''}`}>
              <div className="mt-0.5 flex-shrink-0">
                {n.type === 'success' && <CheckCircle size={13} className="text-green-400" />}
                {n.type === 'error' && <AlertCircle size={13} className="text-red-400" />}
                {n.type === 'warning' && <AlertCircle size={13} className="text-amber-400" />}
                {n.type === 'info' && <Clock size={13} className="text-slate-400" />}
                {n.type === 'approval_required' && <Clock size={13} className="text-amber-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300">{n.title}</p>
                {n.body && <p className="text-xs text-slate-500 truncate">{n.body}</p>}
              </div>
              <span className="text-xs text-slate-600 flex-shrink-0">
                {new Date(n.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WorkflowRunsPanel() {
  const workflows = useWorkflowStore((s) => s.workflows)
  const fetchWorkflows = useWorkflowStore((s) => s.fetchWorkflows)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (workflows.length === 0) fetchWorkflows()
  }, [workflows.length, fetchWorkflows])

  useEffect(() => {
    const load = async () => {
      const list = await window.api.workflows.runs.list()
      list.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      setRuns(list)
    }
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [])

  const hasRunning = runs.some((r) => r.status === 'running')
  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [hasRunning])

  const workflowName = (id: string) => workflows.find((w) => w.id === id)?.name ?? '(unknown)'

  const formatElapsed = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    if (m >= 60) {
      const h = Math.floor(m / 60)
      return `${h}h ${m % 60}m`
    }
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const elapsedFor = (run: WorkflowRun) => {
    if (!run.startedAt) return '—'
    const end = run.completedAt ?? (run.status === 'running' ? now : run.startedAt)
    return formatElapsed(end - run.startedAt)
  }

  const statusDot = (status: WorkflowRun['status']) => {
    if (status === 'running') return 'bg-green-400 animate-pulse'
    if (status === 'paused') return 'bg-amber-400 animate-pulse'
    if (status === 'completed') return 'bg-green-400'
    if (status === 'failed') return 'bg-red-400'
    return 'bg-slate-600'
  }

  const statusVariant = (status: WorkflowRun['status']) => {
    if (status === 'running') return 'success' as const
    if (status === 'paused') return 'warning' as const
    if (status === 'completed') return 'success' as const
    if (status === 'failed') return 'error' as const
    return 'muted' as const
  }

  return (
    <div className="rounded-lg border border-white/5 bg-white/2 flex-1">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <h2 className="text-sm font-medium text-slate-300">Workflow Runs</h2>
        <span className="ml-auto text-xs text-slate-500">{runs.length} run{runs.length === 1 ? '' : 's'}</span>
      </div>
      <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
        {runs.length === 0 && (
          <p className="text-xs text-slate-500 p-4">No runs yet</p>
        )}
        {runs.map((run) => (
          <div key={run.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(run.status)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{workflowName(run.workflowId)}</p>
              <p className="text-xs text-slate-600 font-mono">{elapsedFor(run)}</p>
            </div>
            <Badge variant={statusVariant(run.status)} className="text-[10px]">{run.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageChartPanel() {
  const [data, setData] = useState<{ date: string; claude: number; gemini: number; claudeCost: number; geminiCost: number }[]>([])

  useEffect(() => {
    window.api.usage.history(7).then(setData)
  }, [])

  const totals = useMemo(() => {
    let tokens = 0
    let cost = 0
    for (const d of data) {
      tokens += d.claude + d.gemini
      cost += d.claudeCost + d.geminiCost
    }
    return { tokens, cost }
  }, [data])

  return (
    <div className="rounded-lg border border-white/5 bg-white/2 flex-1">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <h2 className="text-sm font-medium text-slate-300">Token Usage · 7 days</h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ background: '#d97706' }} />
            Claude
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }} />
            Gemini
          </span>
        </div>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#cbd5e1' }}
            />
            <Bar dataKey="claude" stackId="a" fill="#d97706" radius={[0, 0, 0, 0]} />
            <Bar dataKey="gemini" stackId="a" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-6 px-1 pt-3 border-t border-white/5 mt-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">7-day tokens</p>
            <p className="text-sm font-semibold text-white font-mono">{formatTokens(totals.tokens)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">7-day cost</p>
            <p className="text-sm font-semibold text-white font-mono">${totals.cost.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessagingPanel() {
  const agents = useAgentStore((s) => s.agents)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const refresh = async () => {
    const list = await window.api.messages.list({ limit: 50 }) as AgentMessage[]
    setMessages(list)
  }

  useEffect(() => {
    refresh()
    const unsub = window.api.on('message:new', () => refresh())
    return unsub
  }, [])

  useEffect(() => {
    if (!fromId && agents.length) setFromId(agents[0].id)
    if (!toId && agents.length > 1) setToId(agents[1].id)
  }, [agents])

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? '(deleted)'

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || !toId) return
    setSending(true)
    await window.api.messages.send({
      fromAgentId: fromId || null,
      toAgentId: toId,
      content: content.trim()
    })
    setContent('')
    setSending(false)
  }

  return (
    <div className="rounded-lg border border-white/5 bg-white/2 mt-4">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <MessageSquare size={14} className="text-indigo-400" />
        <h2 className="text-sm font-medium text-slate-300">Agent Messages</h2>
        <span className="ml-auto text-xs text-slate-500">{messages.length} message{messages.length === 1 ? '' : 's'}</span>
      </div>

      <form onSubmit={handleSend} className="p-3 border-b border-white/5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            <option value="">From: User</option>
            {agents.map((a) => <option key={a.id} value={a.id}>From: {a.name}</option>)}
          </select>
          <select
            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
          >
            <option value="">Select recipient...</option>
            {agents.map((a) => <option key={a.id} value={a.id}>To: {a.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
            placeholder="Message content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={sending || !content.trim() || !toId}>
            <Send size={11} /> Send
          </Button>
        </div>
      </form>

      <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500 p-4 text-center">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`px-4 py-2.5 ${!m.read ? 'bg-indigo-500/5' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-slate-400">{agentName(m.fromAgentId) || 'User'}</span>
              <span className="text-xs text-slate-600">→</span>
              <span className="text-xs text-indigo-300">{agentName(m.toAgentId)}</span>
              {!m.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
              <span className="ml-auto text-[10px] text-slate-600">{new Date(m.timestamp).toLocaleTimeString()}</span>
            </div>
            <p className="text-xs text-slate-300 whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function KPICard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/2 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}

function CLIHealthRow({ name, available, version, path }: {
  name: string; available: boolean; version?: string; path?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${available ? 'bg-green-400' : 'bg-red-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-300">{name}</p>
        <p className="text-xs text-slate-600 truncate">{path}</p>
      </div>
      {version && <span className="text-xs text-slate-500">{version}</span>}
      <Badge variant={available ? 'success' : 'error'} className="text-[10px]">
        {available ? 'OK' : 'Not found'}
      </Badge>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
