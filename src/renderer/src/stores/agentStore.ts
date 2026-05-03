import { create } from 'zustand'
import { Agent, AgentStatus } from '@shared/types'

interface AgentStore {
  agents: Agent[]
  loading: boolean
  activeSessionIds: Record<string, string> // agentId → sessionId

  fetchAgents: () => Promise<void>
  createAgent: (config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'activeSessionId' | 'memoryPath'>) => Promise<Agent>
  updateAgentStatus: (agentId: string, status: AgentStatus, sessionId?: string) => void
  startSession: (agentId: string) => Promise<string>
  killSession: (agentId: string) => Promise<void>
  sendInput: (sessionId: string, input: string) => Promise<void>
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  loading: false,
  activeSessionIds: {},

  fetchAgents: async () => {
    set({ loading: true })
    const agents = await window.api.agents.list()
    set({ agents, loading: false })
  },

  createAgent: async (config) => {
    const agent = await window.api.agents.create(config)
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  updateAgentStatus: (agentId, status, sessionId) => {
    const isIdle = status === 'idle'
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? { ...a, status, activeSessionId: isIdle ? null : (sessionId ?? a.activeSessionId) }
          : a
      ),
      activeSessionIds: isIdle
        ? Object.fromEntries(Object.entries(s.activeSessionIds).filter(([k]) => k !== agentId))
        : sessionId
          ? { ...s.activeSessionIds, [agentId]: sessionId }
          : s.activeSessionIds
    }))
  },

  startSession: async (agentId) => {
    const sessionId = await window.api.agents.startSession(agentId)
    get().updateAgentStatus(agentId, 'running', sessionId)
    return sessionId
  },

  killSession: async (agentId) => {
    await window.api.agents.killSession(agentId)
    get().updateAgentStatus(agentId, 'idle')
  },

  sendInput: async (sessionId, input) => {
    await window.api.agents.sendInput(sessionId, input)
  },

  resizeSession: async (sessionId, cols, rows) => {
    await window.api.agents.resizeSession(sessionId, cols, rows)
  },

  deleteAgent: async (id) => {
    await window.api.agents.delete(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  }
}))
