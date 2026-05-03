import { Bot, DollarSign, Bell, Wifi, WifiOff } from 'lucide-react'
import { useAgentStore } from '../../stores/agentStore'
import { useAppStore } from '../../stores/appStore'

export function StatusBar() {
  const agents = useAgentStore((s) => s.agents)
  const { cliHealth, todaySummary, unreadCount, markAllRead, navigate } = useAppStore()

  const runningCount = agents.filter((a) => a.status === 'running').length
  const costToday = todaySummary?.totalCostUsd ?? 0

  const claudeOk = cliHealth?.claude.available
  const geminiOk = cliHealth?.gemini.available

  return (
    <div className="h-9 flex items-center gap-1 px-3 border-b border-white/5 bg-[#0d0d14] text-xs text-slate-400 flex-shrink-0 drag-region">
      {/* Spacer for traffic lights */}
      <div className="w-16 flex-shrink-0" />

      {/* CLI Health */}
      <div className="flex items-center gap-3">
        <span className={`flex items-center gap-1 ${claudeOk ? 'text-amber-400' : 'text-slate-600'}`}>
          {claudeOk ? <Wifi size={11} /> : <WifiOff size={11} />} Claude
        </span>
        <span className={`flex items-center gap-1 ${geminiOk ? 'text-blue-400' : 'text-slate-600'}`}>
          {geminiOk ? <Wifi size={11} /> : <WifiOff size={11} />} Gemini
        </span>
      </div>

      <div className="flex-1" />

      {/* Stats */}
      <button
        onClick={() => navigate('agents')}
        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
      >
        <Bot size={11} />
        <span className={runningCount > 0 ? 'text-green-400' : ''}>
          {runningCount} running
        </span>
      </button>

      <button
        onClick={() => navigate('command-center')}
        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
      >
        <DollarSign size={11} />
        <span>${costToday.toFixed(3)}</span>
      </button>

      <button
        onClick={() => { markAllRead(); navigate('command-center') }}
        className={`flex items-center gap-1 px-2.5 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer ${unreadCount > 0 ? 'text-amber-400' : ''}`}
      >
        <Bell size={11} />
        {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>
    </div>
  )
}
