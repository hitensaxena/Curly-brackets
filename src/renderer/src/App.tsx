import { useEffect, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { StatusBar } from './components/layout/StatusBar'
import { ToastHost, pushToast } from './components/ToastHost'
import { CommandPalette } from './components/CommandPalette'
import { Onboarding } from './components/Onboarding'
import { UpdateBanner } from './components/UpdateBanner'
import { AuroraBackground } from './components/AuroraBackground'
import { Home } from './pages/Home'
import { Chat } from './pages/Chat'
import { Agents } from './pages/Agents'
import { Workflows } from './pages/Workflows'
import { Projects } from './pages/Projects'
import { CommandCenter } from './pages/CommandCenter'
import { Settings } from './pages/Settings'
import { useAppStore } from './stores/appStore'
import { useAgentStore } from './stores/agentStore'
import { useWorkflowStore } from './stores/workflowStore'

export default function App() {
  const { currentPage, navigate, setCliHealth, setTodaySummary, addNotification } = useAppStore()
  const { fetchAgents, updateAgentStatus, agents } = useAgentStore()
  const { applyRunStarted, applyStepUpdate, applyRunComplete, workflows } = useWorkflowStore()

  // Global keyboard shortcuts. Skip when the user is typing in an input.
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (isTyping(e.target)) return
      const key = e.key.toLowerCase()
      // ⌘N — new chat
      if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        const settings = await window.api.settings.all()
        await window.api.chat.create({ defaultModel: settings.defaultClaudeModel ?? 'claude-sonnet-4-6' })
        navigate('chat')
        return
      }
      // ⌘⇧A — go to agents (and dispatch a "new" event the page picks up)
      if (key === 'a' && e.shiftKey) {
        e.preventDefault()
        navigate('agents')
        window.dispatchEvent(new CustomEvent('shortcut:new-agent'))
        return
      }
      // ⌘⇧W — go to workflows (and dispatch a "new" event)
      if (key === 'w' && e.shiftKey) {
        e.preventDefault()
        navigate('workflows')
        window.dispatchEvent(new CustomEvent('shortcut:new-workflow'))
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // Read settings on boot to gate toasts
  const toastsEnabled = useRef(true)
  useEffect(() => {
    window.api.settings.all().then((s) => { toastsEnabled.current = s.notificationsEnabled !== '0' })
  }, [])

  // Helpful name lookups for richer toast bodies
  const nameForAgent = (id: string | null | undefined) => agents.find((a) => a.id === id)?.name ?? 'Agent'
  const nameForWorkflow = (id: string) => workflows.find((w) => w.id === id)?.name ?? 'Workflow'

  // Boot: check CLI health, load agents, get today's usage
  useEffect(() => {
    const boot = async () => {
      const [health, usage] = await Promise.all([
        window.api.cli.health(),
        window.api.usage.summary(Date.now() - 24 * 60 * 60 * 1000)
      ])
      setCliHealth(health)
      setTodaySummary(usage)
      await fetchAgents()
    }
    boot()

    const interval = setInterval(async () => {
      const usage = await window.api.usage.summary(Date.now() - 24 * 60 * 60 * 1000)
      setTodaySummary(usage)
    }, 30_000)

    return () => clearInterval(interval)
  }, [])

  // IPC event subscriptions
  useEffect(() => {
    const unsubStatus = window.api.on('agent:status', (event: unknown) => {
      const e = event as { agentId: string; status: 'idle' | 'running' | 'paused' | 'error'; sessionId?: string }
      updateAgentStatus(e.agentId, e.status, e.sessionId)
      if (e.status === 'error') {
        addNotification({ type: 'error', title: 'Agent error', body: `Agent encountered an error`, actionRequired: false })
      }
    })
    const unsubUsage = window.api.on('usage:updated', async () => {
      const usage = await window.api.usage.summary(Date.now() - 24 * 60 * 60 * 1000)
      setTodaySummary(usage)
    })
    const unsubRunStarted = window.api.on('workflow:run:started', (event: unknown) => {
      const e = event as { runId: string; workflowId: string; stepStates: Record<string, never> }
      applyRunStarted(e.runId, e.workflowId, e.stepStates)
    })
    const unsubStepUpdate = window.api.on('workflow:step:update', (event: unknown) => {
      const e = event as { runId: string; stepId: string; state: never }
      applyStepUpdate(e.runId, e.stepId, e.state)
    })
    const unsubRunComplete = window.api.on('workflow:run:complete', (event: unknown) => {
      const e = event as { runId: string; success: boolean; error?: string }
      applyRunComplete(e.runId, e.success, e.error)
      const wfId = useWorkflowStore.getState().runs[e.runId]?.workflowId
      const wfName = wfId ? nameForWorkflow(wfId) : 'Workflow'
      if (e.success) {
        if (toastsEnabled.current) pushToast({ kind: 'success', title: `${wfName} completed` })
      } else {
        addNotification({ type: 'error', title: 'Workflow failed', body: e.error ?? 'Unknown error', actionRequired: false })
        if (toastsEnabled.current) pushToast({ kind: 'error', title: `${wfName} failed`, body: e.error })
      }
    })
    const unsubStepUpdateForToast = window.api.on('workflow:step:update', (event: unknown) => {
      const e = event as { runId: string; stepId: string; state: { status: string } }
      // Surface approvals as a toast so the user notices when they're not on Workflows page
      if (e.state.status === 'awaiting_approval' && toastsEnabled.current) {
        pushToast({ kind: 'approval', title: 'Approval required', body: 'A workflow is paused waiting for your decision.', duration: 12_000 })
      }
    })
    const unsubAgentBudget = window.api.on('agent:budget:exceeded', (event: unknown) => {
      const e = event as { agentId: string; agentName: string; spent: number; cap: number }
      addNotification({
        type: 'error',
        title: `${e.agentName} hit daily budget`,
        body: `Spent $${e.spent.toFixed(4)} of $${e.cap.toFixed(2)} cap. Auto-paused.`,
        actionRequired: true
      })
      if (toastsEnabled.current) {
        pushToast({
          kind: 'error',
          title: `${e.agentName} paused — budget exceeded`,
          body: `$${e.spent.toFixed(4)} / $${e.cap.toFixed(2)} today`,
          duration: 12_000
        })
      }
    })
    const unsubWfBudget = window.api.on('workflow:budget:exceeded', (event: unknown) => {
      const e = event as { runId: string; spent: number; cap: number }
      const wfName = nameForWorkflow(useWorkflowStore.getState().runs[e.runId]?.workflowId ?? '')
      if (toastsEnabled.current) {
        pushToast({
          kind: 'error',
          title: `${wfName} aborted — budget exceeded`,
          body: `$${e.spent.toFixed(4)} / $${e.cap.toFixed(2)} per-run cap`,
          duration: 12_000
        })
      }
    })
    const unsubMessage = window.api.on('message:new', (event: unknown) => {
      const e = event as { fromAgentId: string | null; toAgentId: string | null; content: string }
      if (toastsEnabled.current) {
        pushToast({
          kind: 'message',
          title: `${nameForAgent(e.fromAgentId)} → ${nameForAgent(e.toAgentId)}`,
          body: e.content.length > 80 ? e.content.slice(0, 80) + '…' : e.content
        })
      }
    })
    return () => { unsubStatus(); unsubUsage(); unsubRunStarted(); unsubStepUpdate(); unsubRunComplete(); unsubStepUpdateForToast(); unsubAgentBudget(); unsubWfBudget(); unsubMessage() }
  }, [agents, workflows])

  const pages: Record<string, React.ReactNode> = {
    home: <Home />,
    chat: <Chat />,
    agents: <Agents />,
    workflows: <Workflows />,
    projects: <Projects />,
    'command-center': <CommandCenter />,
    settings: <Settings />
  }

  return (
    <>
      {/* Ambient backdrop — sits behind everything else (z-index 0) */}
      <AuroraBackground />

      {/* App chrome rides above the aurora at z-index 1 */}
      <div className="relative flex flex-col h-screen overflow-hidden" style={{ zIndex: 1 }}>
        <StatusBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
            {pages[currentPage] ?? <Chat />}
          </main>
        </div>
        <ToastHost />
        <CommandPalette />
        <Onboarding />
        <UpdateBanner />
      </div>
    </>
  )
}
