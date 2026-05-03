import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  role: text('role').notNull().default('custom'),
  provider: text('provider').notNull().default('claude'),
  model: text('model').notNull().default('claude-sonnet-4-6'),
  systemPrompt: text('system_prompt').default(''),
  memoryPath: text('memory_path').default(''),
  toolsEnabled: text('tools_enabled').default('[]'),
  projectId: text('project_id'),
  status: text('status').default('idle'),
  activeSessionId: text('active_session_id'),
  // Daily cost cap in USD. When today's cost reaches this, runHeadless refuses + agent moves to 'paused'.
  dailyBudgetUsd: real('daily_budget_usd'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costUsd: real('cost_usd').default(0)
})

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  projectId: text('project_id'),
  definition: text('definition').notNull().default('{}'),
  triggerConfig: text('trigger_config'),
  // Per-run cost cap in USD. If cumulative cost exceeds, the run fails with a budget error.
  perRunBudgetUsd: real('per_run_budget_usd'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  status: text('status').notNull().default('queued'),
  stepStates: text('step_states'),
  artifacts: text('artifacts'),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  triggeredBy: text('triggered_by').default('manual')
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  tags: text('tags').default('[]'),
  repoPath: text('repo_path'),
  contextMdPath: text('context_md_path'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const usageRecords = sqliteTable('usage_records', {
  id: text('id').primaryKey(),
  agentId: text('agent_id'),
  sessionId: text('session_id'),
  workflowRunId: text('workflow_run_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  costUsd: real('cost_usd').default(0),
  timestamp: integer('timestamp').notNull()
})

export const agentMessages = sqliteTable('agent_messages', {
  id: text('id').primaryKey(),
  fromAgentId: text('from_agent_id'),
  toAgentId: text('to_agent_id'),
  workflowRunId: text('workflow_run_id'),
  contentType: text('content_type').notNull().default('text'),
  content: text('content').notNull(),
  priority: text('priority').default('normal'),
  timestamp: integer('timestamp').notNull(),
  read: integer('read').default(0)
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('New conversation'),
  projectId: text('project_id'),
  defaultModel: text('default_model').notNull().default('claude-sonnet-4-6'),
  defaultAgentId: text('default_agent_id'),
  claudeSessionId: text('claude_session_id'),
  // JSON array of vector_sources.id; always-injected pinned chunks (notes, files, urls)
  pinnedSourceIds: text('pinned_source_ids').default('[]'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastMessageAt: integer('last_message_at')
})

export const conversationMessages = sqliteTable('conversation_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  agentId: text('agent_id'),
  content: text('content').notNull(),
  sources: text('sources'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costUsd: real('cost_usd').default(0),
  createdAt: integer('created_at').notNull()
})

export const vectorSources = sqliteTable('vector_sources', {
  id: text('id').primaryKey(),
  sourceId: text('source_id'),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
  title: text('title'),
  headerChain: text('header_chain'),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  projectId: text('project_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const knowledgeSources = sqliteTable('knowledge_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scope: text('scope').notNull().default('global'),
  projectId: text('project_id'),
  type: text('type').notNull(),
  config: text('config').notNull().default('{}'),
  enabled: integer('enabled').notNull().default(1),
  status: text('status').notNull().default('idle'),
  errorMessage: text('error_message'),
  totalChunks: integer('total_chunks').default(0),
  lastIndexedAt: integer('last_indexed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})
