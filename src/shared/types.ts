export type Provider = 'claude' | 'gemini'

export type AgentRole =
  | 'orchestrator'
  | 'coder'
  | 'reviewer'
  | 'researcher'
  | 'writer'
  | 'tester'
  | 'analyst'
  | 'custom'

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error'

export type AgentTool =
  | 'bash'
  | 'file_read'
  | 'file_write'
  | 'web_search'
  | 'web_fetch'
  | 'computer'

export interface Agent {
  id: string
  name: string
  description: string
  role: AgentRole
  provider: Provider
  model: string
  systemPrompt: string
  memoryPath: string
  toolsEnabled: AgentTool[]
  projectId: string | null
  status: AgentStatus
  activeSessionId: string | null
  /** Daily cost cap in USD; when reached, the agent auto-pauses until the next day. */
  dailyBudgetUsd?: number | null
  createdAt: number
  updatedAt: number
}

export interface AgentSession {
  id: string
  agentId: string
  startedAt: number
  endedAt: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'
export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed'

export interface Workflow {
  id: string
  name: string
  description: string
  projectId: string | null
  definition: string
  triggerConfig: string | null
  /** Per-run cost cap in USD. If cumulative cost exceeds, the run fails with a budget error. */
  perRunBudgetUsd?: number | null
  createdAt: number
  updatedAt: number
}

export interface WorkflowRun {
  id: string
  workflowId: string
  status: RunStatus
  stepStates: string | null
  artifacts: string | null
  startedAt: number | null
  completedAt: number | null
  triggeredBy: string
}

export interface Project {
  id: string
  name: string
  description: string
  tags: string
  repoPath: string | null
  contextMdPath: string | null
  createdAt: number
  updatedAt: number
}

export interface UsageRecord {
  id: string
  agentId: string | null
  sessionId: string | null
  workflowRunId: string | null
  provider: Provider
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  costUsd: number
  timestamp: number
}

export interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  byProvider: Record<Provider, { tokens: number; costUsd: number }>
  byModel: Record<string, { tokens: number; costUsd: number }>
  byAgent: Record<string, { tokens: number; costUsd: number }>
}

// IPC event types
export interface AgentOutputEvent {
  sessionId: string
  data: string
}

export interface AgentStatusEvent {
  agentId: string
  status: AgentStatus
  sessionId?: string
}

export interface UsageUpdateEvent {
  record: UsageRecord
}

export interface WorkflowStepEvent {
  runId: string
  stepId: string
  status: string
}

export interface WorkflowCompleteEvent {
  runId: string
  success: boolean
  error?: string
}

// Workflow definition (stored as JSON in workflows.definition)
export type WorkflowNodeType = 'agent' | 'approval' | 'output'

/** Where an output node sends the upstream content. */
export type OutputNodeKind = 'slack' | 'discord' | 'webhook' | 'file'

export interface OutputNodeConfig {
  kind: OutputNodeKind
  /** Slack/Discord incoming webhook URL OR generic POST URL OR absolute file path. */
  target: string
  /** Optional message template; supports {{input}}. Default: passthrough of input. */
  template?: string
  /** Slack/Discord only: channel override (Slack) or content prefix. Optional. */
  meta?: Record<string, string>
}

export interface WorkflowNode {
  id: string
  /** Default 'agent' for back-compat. 'approval' nodes pause for human review.
   *  'output' nodes ship the upstream output to an external destination. */
  nodeType?: WorkflowNodeType
  agentId: string
  promptTemplate: string
  /** For approval nodes: the prompt shown to the human. Use {{input}}. */
  approvalMessage?: string
  /** For output nodes only. */
  outputConfig?: OutputNodeConfig
  position: { x: number; y: number }
}

/**
 * An edge between two workflow nodes. Optional `condition` only allows the edge
 * to "fire" (its target node becomes ready) when the source node's output
 * matches. Without a condition, the edge always fires (default DAG behavior).
 */
export type EdgeConditionMode = 'always' | 'contains' | 'not_contains' | 'matches' | 'starts_with'

export interface EdgeCondition {
  mode: EdgeConditionMode
  value: string  // substring or regex pattern
  caseSensitive?: boolean
}

export interface WorkflowEdgeDef {
  id: string
  source: string
  target: string
  condition?: EdgeCondition
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdgeDef[]
}

// Live state during a workflow run (stored as JSON in workflowRuns.stepStates)
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'awaiting_approval' | 'rejected'

export interface StepState {
  status: StepStatus
  output?: string
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  startedAt?: number
  endedAt?: number
  error?: string
}

export type StepStates = Record<string, StepState>

export interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info' | 'approval_required'
  title: string
  body: string
  agentId?: string
  workflowRunId?: string
  actionRequired: boolean
  timestamp: number
  read: boolean
}

// CLI health
export interface CLIHealth {
  claude: { available: boolean; version?: string; path: string }
  gemini: { available: boolean; version?: string; path: string }
}
