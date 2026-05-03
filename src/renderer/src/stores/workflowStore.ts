import { create } from 'zustand'
import { Workflow, WorkflowDefinition, StepStates, StepState } from '@shared/types'

interface WorkflowStore {
  workflows: Workflow[]
  selectedId: string | null
  // Live run state, keyed by runId
  runs: Record<string, { workflowId: string; stepStates: StepStates; status: string }>

  fetchWorkflows: () => Promise<void>
  selectWorkflow: (id: string | null) => void
  createWorkflow: (name: string) => Promise<Workflow>
  saveDefinition: (id: string, def: WorkflowDefinition) => Promise<void>
  renameWorkflow: (id: string, name: string) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  runWorkflow: (id: string, initialInput?: string) => Promise<string>
  applyStepUpdate: (runId: string, stepId: string, state: StepState) => void
  applyRunStarted: (runId: string, workflowId: string, stepStates: StepStates) => void
  applyRunComplete: (runId: string, success: boolean, error?: string) => void
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  selectedId: null,
  runs: {},

  fetchWorkflows: async () => {
    const list = await window.api.workflows.list()
    set({ workflows: list })
  },

  selectWorkflow: (id) => set({ selectedId: id }),

  createWorkflow: async (name) => {
    const wf = await window.api.workflows.create({ name, definition: JSON.stringify({ nodes: [], edges: [] }) })
    set((s) => ({ workflows: [...s.workflows, wf], selectedId: wf.id }))
    return wf
  },

  saveDefinition: async (id, def) => {
    await window.api.workflows.update(id, { definition: JSON.stringify(def) })
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, definition: JSON.stringify(def), updatedAt: Date.now() } : w
      )
    }))
  },

  renameWorkflow: async (id, name) => {
    await window.api.workflows.update(id, { name })
    set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? { ...w, name } : w)) }))
  },

  deleteWorkflow: async (id) => {
    await window.api.workflows.delete(id)
    set((s) => ({
      workflows: s.workflows.filter((w) => w.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId
    }))
  },

  runWorkflow: async (id, initialInput) => {
    const runId = await window.api.workflows.run(id, initialInput)
    return runId
  },

  applyRunStarted: (runId, workflowId, stepStates) => {
    set((s) => ({
      runs: { ...s.runs, [runId]: { workflowId, stepStates, status: 'running' } }
    }))
  },

  applyStepUpdate: (runId, stepId, state) => {
    set((s) => {
      const run = s.runs[runId]
      if (!run) return s
      return {
        runs: {
          ...s.runs,
          [runId]: { ...run, stepStates: { ...run.stepStates, [stepId]: state } }
        }
      }
    })
  },

  applyRunComplete: (runId, success) => {
    set((s) => {
      const run = s.runs[runId]
      if (!run) return s
      return {
        runs: {
          ...s.runs,
          [runId]: { ...run, status: success ? 'completed' : 'failed' }
        }
      }
    })
  }
}))

// Convenience selector
export const selectLatestRunForWorkflow = (workflowId: string | null) => (s: WorkflowStore) => {
  if (!workflowId) return null
  const entries = Object.entries(s.runs).filter(([, r]) => r.workflowId === workflowId)
  return entries.length ? entries[entries.length - 1] : null
}
