import { Bot, Workflow, Plus, ArrowRight, Cpu } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { useAppStore } from '../stores/appStore'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { TokenUsageChart } from '../components/TokenUsageChart'

export function Home() {
  const agents = useAgentStore((s) => s.agents)
  const { navigate, todaySummary, notifications } = useAppStore()

  const runningAgents = agents.filter((a) => a.status === 'running')
  const approvalRequired = notifications.filter((n) => n.type === 'approval_required' && !n.read)

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">
          Curly Brackets
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Your personal multi-agent AI workstation</p>
      </div>

      {/* Approval alert */}
      {approvalRequired.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm text-amber-300 font-medium">
              {approvalRequired.length} workflow{approvalRequired.length > 1 ? 's' : ''} awaiting approval
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('workflows')}>
            Review <ArrowRight size={12} />
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Active Agents"
          value={runningAgents.length}
          sub={`of ${agents.length} total`}
          icon={<Bot size={18} className="text-indigo-400" />}
          onClick={() => navigate('agents')}
        />
        <StatCard
          label="Today's Cost"
          value={`$${(todaySummary?.totalCostUsd ?? 0).toFixed(4)}`}
          sub="token spend"
          icon={<Cpu size={18} className="text-green-400" />}
          onClick={() => navigate('command-center')}
        />
        <StatCard
          label="Tokens Used"
          value={formatTokens((todaySummary?.totalInputTokens ?? 0) + (todaySummary?.totalOutputTokens ?? 0))}
          sub="today"
          icon={<Workflow size={18} className="text-blue-400" />}
          onClick={() => navigate('command-center')}
        />
      </div>

      <TokenUsageChart />

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('agents')}>
            <Plus size={14} /> New Agent
          </Button>
          <Button variant="outline" onClick={() => navigate('workflows')}>
            <Plus size={14} /> New Workflow
          </Button>
          <Button variant="outline" onClick={() => navigate('projects')}>
            <Plus size={14} /> New Project
          </Button>
        </div>
      </div>

      {/* Running Agents */}
      {runningAgents.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Running Agents</h2>
          <div className="space-y-2">
            {runningAgents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => navigate('agents')}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/5 hover:border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{agent.name}</p>
                  <p className="text-xs text-slate-500">{agent.model}</p>
                </div>
                <Badge variant={agent.provider === 'claude' ? 'claude' : 'gemini'}>
                  {agent.provider}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
            <Bot size={28} className="text-indigo-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-300 mb-1">No agents yet</h3>
          <p className="text-sm text-slate-500 mb-4 max-w-xs">
            Create your first AI agent to start working with Claude or Gemini
          </p>
          <Button onClick={() => navigate('agents')}>
            <Plus size={14} /> Create Agent
          </Button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, icon, onClick }: {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-lg bg-white/3 border border-white/5 hover:border-white/10 hover:bg-white/5 transition-colors cursor-pointer w-full"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </button>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
