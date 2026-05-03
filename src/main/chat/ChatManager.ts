import { randomUUID } from 'crypto'
import { join } from 'path'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { app, BrowserWindow } from 'electron'
import { eq, asc, desc } from 'drizzle-orm'
import { db } from '../db'
import { conversations, conversationMessages, projects, agents, workflows, knowledgeSources, appSettings, usageRecords } from '../db/schema'
import { ClaudeAdapter } from '../cli/ClaudeAdapter'
import { runHeadless as runAgentHeadless } from '../agents/AgentManager'
import { runWorkflow, workflowEvents, getRunState } from '../workflows/WorkflowExecutor'
import { getMcpConfigPath } from '../messaging/mcpConfig'
import { getAiosBridgePort } from '../messaging/AiosBridge'
import { retrieve as retrieveKnowledge, isKnowledgeReady, getChunksByIds, type RetrievedChunk, type PinnedChunk } from '../knowledge/KnowledgeManager'

const MAX_RETRIEVED_CHUNKS = 6
const MIN_RETRIEVAL_SCORE = 0.3

// Documents the generative-UI registry to the model. Embedded into the chat system prompt.
const GENUI_SYSTEM_ADDENDUM = `## Inline UI components (Generative UI)

When the response benefits from a visual component instead of plain markdown,
emit a fenced code block with the language tag \`ui:<type>\` containing JSON.
The JSON is parsed + schema-validated + rendered inline. Falling back to plain
markdown is fine — only use these when they help.

Available types and their schemas:

- \`ui:table\` — { title?, columns: string[], rows: (string|number|boolean|null)[][] }
- \`ui:chart\` — { title?, variant?: "bar"|"line"|"pie"|"area", xKey?: string, data: object[], series?: { key, label?, color? }[] }
- \`ui:plan-tree\` — { title?, items: { id, label, status: "todo"|"in_progress"|"done"|"skipped", children?: [...] }[] }
- \`ui:diff\` — { title?, language?, unified?: string } OR { before, after }
- \`ui:file-picker\` — { title?, prompt?, files: { path, label?, description? }[], followUpTemplate?: "Use this file: {path}" } — user clicks send a follow-up message
- \`ui:form\` — { title?, prompt?, submitLabel?, fields: { key, label, type: "text"|"textarea"|"number"|"select"|"checkbox", placeholder?, required?, options? }[] } — submit sends a follow-up message
- \`ui:agent-handoff\` — { title?, description?, agentName: string, prompt: string } — button hands off the conversation to that agent

Example — render a table:
\`\`\`ui:table
{ "title": "Cost by model", "columns": ["Model", "$"], "rows": [["Sonnet", 1.20], ["Opus", 8.30]] }
\`\`\`

Rules:
- Always emit valid JSON inside the fence (no trailing commas, double-quoted keys/strings).
- Don't wrap the fence in any extra punctuation. The block must start at column 0.
- Mix freely with regular markdown — render a heading, then a table, then a paragraph.`

const claudeAdapter = new ClaudeAdapter()

function broadcastToAll(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

function getConversationCwd(projectId: string | null): string {
  if (projectId) {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (project?.repoPath && existsSync(project.repoPath)) return project.repoPath
  }
  // Fallback: a sandbox dir under userData so each chat has somewhere to live
  const dir = join(app.getPath('userData'), 'chats', 'default')
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface CreateConversationInput {
  projectId?: string | null
  defaultModel?: string
  defaultAgentId?: string | null
  title?: string
}

export async function createConversation(input: CreateConversationInput = {}) {
  const id = randomUUID()
  const now = Date.now()
  const row = {
    id,
    title: input.title ?? 'New conversation',
    projectId: input.projectId ?? null,
    defaultModel: input.defaultModel ?? 'claude-sonnet-4-6',
    defaultAgentId: input.defaultAgentId ?? null,
    claudeSessionId: null as string | null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null as number | null
  }
  db.insert(conversations).values(row).run()
  broadcastToAll('chat:conversation:created', row)
  return row
}

export async function listConversations() {
  return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all()
}

export async function getConversation(id: string) {
  const conv = db.select().from(conversations).where(eq(conversations.id, id)).get()
  if (!conv) return null
  const messages = db.select().from(conversationMessages)
    .where(eq(conversationMessages.conversationId, id))
    .orderBy(asc(conversationMessages.createdAt))
    .all()
  return { conversation: conv, messages }
}

export async function updateConversation(id: string, updates: Partial<{
  title: string
  projectId: string | null
  defaultModel: string
  defaultAgentId: string | null
  pinnedSourceIds: string[]
}>) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if ('title' in updates) patch.title = updates.title
  if ('projectId' in updates) patch.projectId = updates.projectId
  if ('defaultModel' in updates) patch.defaultModel = updates.defaultModel
  if ('defaultAgentId' in updates) patch.defaultAgentId = updates.defaultAgentId
  if ('pinnedSourceIds' in updates) patch.pinnedSourceIds = JSON.stringify(updates.pinnedSourceIds ?? [])
  db.update(conversations).set(patch).where(eq(conversations.id, id)).run()
  broadcastToAll('chat:conversation:updated', { id, ...updates })
}

export async function deleteConversation(id: string) {
  db.delete(conversationMessages).where(eq(conversationMessages.conversationId, id)).run()
  db.delete(conversations).where(eq(conversations.id, id)).run()
  broadcastToAll('chat:conversation:deleted', { id })
}

/**
 * Fork a conversation: copy its config + messages up to and including `untilMessageId`
 * into a brand-new conversation. Returns the new conversation id.
 */
export async function forkConversation(sourceId: string, untilMessageId: string): Promise<{ id: string }> {
  const source = db.select().from(conversations).where(eq(conversations.id, sourceId)).get()
  if (!source) throw new Error(`Conversation ${sourceId} not found`)
  const allMsgs = db.select().from(conversationMessages)
    .where(eq(conversationMessages.conversationId, sourceId))
    .orderBy(asc(conversationMessages.createdAt))
    .all()
  const cutIdx = allMsgs.findIndex((m) => m.id === untilMessageId)
  if (cutIdx === -1) throw new Error(`Message ${untilMessageId} not found in conversation`)
  const kept = allMsgs.slice(0, cutIdx + 1)

  const newId = randomUUID()
  const now = Date.now()
  const newConv = {
    id: newId,
    title: `Fork: ${source.title}`,
    projectId: source.projectId,
    defaultModel: source.defaultModel,
    defaultAgentId: source.defaultAgentId,
    claudeSessionId: null as string | null,
    pinnedSourceIds: source.pinnedSourceIds ?? '[]',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: kept.length > 0 ? kept[kept.length - 1].createdAt : null
  }
  db.insert(conversations).values(newConv).run()

  // Copy messages with fresh ids so the new conversation owns them
  for (const m of kept) {
    db.insert(conversationMessages).values({
      ...m,
      id: randomUUID(),
      conversationId: newId
    }).run()
  }

  broadcastToAll('chat:conversation:created', newConv)
  return { id: newId }
}

// ── Auto-save to vault as markdown ───────────────────────────────────────────

const KEY_AUTO_SAVE = 'autoSaveConversations'
const KEY_SAVE_DIR = 'conversationsSaveDir' // overrides; if empty, fall back to first obsidian source / Conversations

function getSettingValue(key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value ?? null
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'conversation'
}

function resolveSaveDir(): string | null {
  const explicit = getSettingValue(KEY_SAVE_DIR)
  if (explicit && existsSync(explicit)) return explicit
  // Fall back to first enabled global Obsidian source's path + /Conversations
  const obsidianRow = db.select().from(knowledgeSources)
    .where(eq(knowledgeSources.type, 'obsidian'))
    .all()
    .find((s) => s.enabled !== 0 && s.scope === 'global')
  if (obsidianRow) {
    try {
      const cfg = JSON.parse(obsidianRow.config) as { path?: string }
      if (cfg.path && existsSync(cfg.path)) return join(cfg.path, 'Conversations')
    } catch { /* ignore */ }
  }
  return null
}

export function saveConversationToVault(conversationId: string): { path: string } | null {
  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (!conv) return null
  const msgs = db.select().from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt))
    .all()
  if (msgs.length === 0) return null

  const baseDir = resolveSaveDir()
  if (!baseDir) return null

  const created = new Date(conv.createdAt)
  const yearMonth = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
  const dir = join(baseDir, yearMonth)
  mkdirSync(dir, { recursive: true })

  const totalCost = msgs.reduce((s, m) => s + (m.costUsd ?? 0), 0)
  const totalTokens = msgs.reduce((s, m) => s + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0)
  const projectName = conv.projectId
    ? db.select({ name: projects.name }).from(projects).where(eq(projects.id, conv.projectId)).get()?.name
    : null
  const agentMap = new Map(db.select({ id: agents.id, name: agents.name }).from(agents).all().map((a) => [a.id, a.name]))

  const frontmatter = [
    '---',
    `id: ${conv.id}`,
    `title: ${JSON.stringify(conv.title)}`,
    `model: ${conv.defaultModel}`,
    projectName ? `project: ${JSON.stringify(projectName)}` : null,
    `created: ${new Date(conv.createdAt).toISOString()}`,
    `updated: ${new Date(conv.updatedAt).toISOString()}`,
    `messages: ${msgs.length}`,
    `cost_usd: ${totalCost.toFixed(6)}`,
    `tokens: ${totalTokens}`,
    'tags: [aios-chat]',
    '---',
    ''
  ].filter(Boolean).join('\n')

  const body = msgs.map((m) => {
    if (m.role === 'system') return `> _${m.content.replace(/\n/g, ' ')}_\n`
    const agent = m.agentId ? agentMap.get(m.agentId) : null
    const heading = m.role === 'user' ? '## 👤 User' : `## 🤖 ${agent ?? 'Assistant'}`
    const meta = m.role === 'assistant' && m.costUsd
      ? ` _(${m.inputTokens}+${m.outputTokens} tok · $${(m.costUsd ?? 0).toFixed(4)})_`
      : ''
    return `${heading}${meta}\n\n${m.content}\n`
  }).join('\n')

  const file = join(dir, `${slugify(conv.title)}-${conv.id.slice(0, 6)}.md`)
  writeFileSync(file, frontmatter + body, 'utf-8')
  return { path: file }
}

/**
 * Build a single prompt from the conversation thread. Roles are tagged so the
 * model can distinguish past turns.
 */
function buildThreadedPrompt(
  history: Array<{ role: string; content: string }>,
  currentMessage: string
): string {
  if (history.length === 0) return currentMessage
  const formatted = history
    .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
    .join('\n\n')
  return `${formatted}\n\nUSER: ${currentMessage}\n\nASSISTANT:`
}

interface ParsedMessage {
  command?: { name: string; args: string }
  mentionedAgentId?: string
  // Text after stripping the @-mention; the original text if no mention
  body: string
}

/**
 * Parse a user message for slash commands (must be at the start) and @-mentions
 * (longest-prefix-match against existing agent names).
 */
function parseUserMessage(text: string, agentList: Array<{ id: string; name: string }>): ParsedMessage {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('/')) {
    const space = trimmed.indexOf(' ')
    const name = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).trim()
    const args = space === -1 ? '' : trimmed.slice(space + 1).trim()
    return { command: { name: name.toLowerCase(), args }, body: text }
  }
  if (trimmed.startsWith('@')) {
    // Try the longest agent name first (so "Senior Coder" wins over "Senior")
    const sorted = [...agentList].sort((a, b) => b.name.length - a.name.length)
    for (const a of sorted) {
      const prefix = '@' + a.name
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        const body = trimmed.slice(prefix.length).trimStart()
        return { mentionedAgentId: a.id, body }
      }
    }
  }
  return { body: text }
}

/**
 * Append a system-style message to the conversation (for command echoes /
 * workflow status / errors). Broadcasts to listeners.
 */
function appendSystemMessage(conversationId: string, content: string): void {
  const msg = {
    id: randomUUID(),
    conversationId,
    role: 'system' as const,
    agentId: null,
    content,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    createdAt: Date.now()
  }
  db.insert(conversationMessages).values(msg).run()
  db.update(conversations).set({ lastMessageAt: msg.createdAt, updatedAt: msg.createdAt }).where(eq(conversations.id, conversationId)).run()
  broadcastToAll('chat:message:added', { conversationId, message: msg })
}

const SLASH_HELP = `**Available commands**

\`/run <workflow-name> [input]\` — trigger a workflow inline
\`/agent <agent-name>\` — set the conversation's default agent (use the dropdown for spaced names too)
\`/model <model>\` — switch model (e.g. claude-opus-4-7)
\`/project <project-name>\` — switch the working project
\`/clear\` — clear the conversation history
\`/help\` — show this list

**@-mention**: start your message with \`@AgentName\` to invoke a specific agent for that turn only (longest-name prefix match).`

async function handleSlashCommand(conv: typeof conversations.$inferSelect, command: { name: string; args: string }): Promise<void> {
  const conversationId = conv.id
  switch (command.name) {
    case 'help': {
      appendSystemMessage(conversationId, SLASH_HELP)
      return
    }
    case 'clear': {
      db.delete(conversationMessages).where(eq(conversationMessages.conversationId, conversationId)).run()
      broadcastToAll('chat:conversation:cleared', { conversationId })
      appendSystemMessage(conversationId, '_Conversation history cleared._')
      return
    }
    case 'agent': {
      const wanted = command.args.trim()
      if (!wanted) {
        appendSystemMessage(conversationId, '_Usage: `/agent <agent-name>` (or empty to clear)._')
        return
      }
      const all = db.select({ id: agents.id, name: agents.name }).from(agents).all()
      const match = all.find((a) => a.name.toLowerCase() === wanted.toLowerCase())
        ?? all.find((a) => a.name.toLowerCase().startsWith(wanted.toLowerCase()))
      if (!match) {
        appendSystemMessage(conversationId, `_No agent matched "${wanted}"._`)
        return
      }
      db.update(conversations).set({ defaultAgentId: match.id, updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
      broadcastToAll('chat:conversation:updated', { id: conversationId, defaultAgentId: match.id })
      appendSystemMessage(conversationId, `_Default agent set to **${match.name}**._`)
      return
    }
    case 'model': {
      const wanted = command.args.trim()
      if (!wanted) {
        appendSystemMessage(conversationId, '_Usage: `/model <model-name>` (e.g. `claude-sonnet-4-6`)._')
        return
      }
      db.update(conversations).set({ defaultModel: wanted, updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
      broadcastToAll('chat:conversation:updated', { id: conversationId, defaultModel: wanted })
      appendSystemMessage(conversationId, `_Model set to **${wanted}**._`)
      return
    }
    case 'project': {
      const wanted = command.args.trim()
      if (!wanted) {
        db.update(conversations).set({ projectId: null, updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
        broadcastToAll('chat:conversation:updated', { id: conversationId, projectId: null })
        appendSystemMessage(conversationId, '_Project cleared._')
        return
      }
      const all = db.select({ id: projects.id, name: projects.name }).from(projects).all()
      const match = all.find((p) => p.name.toLowerCase() === wanted.toLowerCase())
        ?? all.find((p) => p.name.toLowerCase().startsWith(wanted.toLowerCase()))
      if (!match) {
        appendSystemMessage(conversationId, `_No project matched "${wanted}"._`)
        return
      }
      db.update(conversations).set({ projectId: match.id, updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
      broadcastToAll('chat:conversation:updated', { id: conversationId, projectId: match.id })
      appendSystemMessage(conversationId, `_Project set to **${match.name}**._`)
      return
    }
    case 'run': {
      const args = command.args.trim()
      const space = args.indexOf(' ')
      const wfName = (space === -1 ? args : args.slice(0, space)).trim()
      const input = space === -1 ? '' : args.slice(space + 1).trim()
      if (!wfName) {
        appendSystemMessage(conversationId, '_Usage: `/run <workflow-name> [input]`._')
        return
      }
      const all = db.select({ id: workflows.id, name: workflows.name }).from(workflows).all()
      const match = all.find((w) => w.name.toLowerCase() === wfName.toLowerCase())
        ?? all.find((w) => w.name.toLowerCase().startsWith(wfName.toLowerCase()))
      if (!match) {
        appendSystemMessage(conversationId, `_No workflow matched "${wfName}"._`)
        return
      }
      try {
        const runId = await runWorkflow(match.id, input || undefined)
        appendSystemMessage(conversationId, `🟢 Started workflow **${match.name}** — \`run id: ${runId.slice(0, 8)}\`. Outputs will appear when complete.`)
        // Subscribe to the in-process event bus and react when this specific run finishes
        const onComplete = async (event: unknown): Promise<void> => {
          const e = event as { runId: string; success: boolean; error?: string }
          if (e.runId !== runId) return
          workflowEvents.off('workflow:run:complete', onComplete)
          const state = await getRunState(runId)
          if (!state) {
            appendSystemMessage(conversationId, `_Workflow finished but run state was not retrievable._`)
            return
          }
          const wfRow = db.select({ definition: workflows.definition }).from(workflows).where(eq(workflows.id, match.id)).get()
          const wfDef = JSON.parse(wfRow?.definition ?? '{}') as {
            nodes?: Array<{ id: string }>
            edges?: Array<{ source: string; target: string }>
          }
          const sources = new Set((wfDef.edges ?? []).map((edge) => edge.source))
          const leaves = (wfDef.nodes ?? []).filter((n) => !sources.has(n.id))
          const outputs = leaves
            .map((n) => state.stepStates[n.id]?.output)
            .filter(Boolean)
            .join('\n\n---\n\n')
          const verb = e.success ? '✅ completed' : '❌ failed'
          const tail = outputs ? `\n\n${outputs}` : (e.error ? `\n\n_${e.error}_` : '')
          appendSystemMessage(conversationId, `Workflow **${match.name}** ${verb}.${tail}`)
        }
        workflowEvents.on('workflow:run:complete', onComplete)
      } catch (err) {
        appendSystemMessage(conversationId, `_Failed to start workflow: ${(err as Error).message ?? err}_`)
      }
      return
    }
    default:
      appendSystemMessage(conversationId, `_Unknown command \`/${command.name}\`. Try \`/help\`._`)
  }
}

export async function sendMessage(conversationId: string, userText: string): Promise<void> {
  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (!conv) throw new Error(`Conversation ${conversationId} not found`)

  const now = Date.now()
  const userMsg = {
    id: randomUUID(),
    conversationId,
    role: 'user' as const,
    agentId: null,
    content: userText,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    createdAt: now
  }
  db.insert(conversationMessages).values(userMsg).run()
  db.update(conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, conversationId)).run()
  broadcastToAll('chat:message:added', { conversationId, message: userMsg })

  // Auto-title on first turn (regardless of dispatch path)
  const isFirstUserMessage = db.select().from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .all().filter((m) => m.role === 'user').length === 1
  if (isFirstUserMessage && conv.title === 'New conversation') {
    const titleSeed = (userMsg.content.length > 60 ? userMsg.content.slice(0, 57) + '...' : userMsg.content).replace(/\n/g, ' ')
    db.update(conversations).set({ title: titleSeed }).where(eq(conversations.id, conversationId)).run()
    broadcastToAll('chat:conversation:updated', { id: conversationId, title: titleSeed })
  }

  // Parse for slash commands and @-mentions
  const allAgents = db.select({ id: agents.id, name: agents.name }).from(agents).all()
  const parsed = parseUserMessage(userText, allAgents)

  if (parsed.command) {
    await handleSlashCommand(conv, parsed.command)
    return
  }

  // Decide which agent to invoke (if any).
  // Priority: @-mention for this turn > conversation default > none
  const turnAgentId = parsed.mentionedAgentId ?? conv.defaultAgentId

  // Build thread context (everything except the just-inserted user msg)
  const history = db.select().from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt))
    .all()
    .filter((m) => m.id !== userMsg.id && m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const promptBody = parsed.body || userText

  // Resolve pinned chunks (always-injected, regardless of retrieval scoring)
  let pinnedChunks: PinnedChunk[] = []
  try {
    const pinnedIds = JSON.parse(conv.pinnedSourceIds ?? '[]') as string[]
    if (pinnedIds.length > 0) pinnedChunks = getChunksByIds(pinnedIds)
  } catch (err) {
    console.error('[chat] failed to load pinned chunks', err)
  }

  // Retrieve top-k chunks scoped to this conversation: global sources + sources bound to this project
  let retrievedChunks: RetrievedChunk[] = []
  if (isKnowledgeReady()) {
    try {
      const all = await retrieveKnowledge(promptBody, {
        k: MAX_RETRIEVED_CHUNKS,
        globalScope: true,
        projectId: conv.projectId
      })
      retrievedChunks = all.filter((c) => c.score >= MIN_RETRIEVAL_SCORE)
    } catch (err) {
      console.error('[chat] retrieval failed', err)
    }
  }

  const pinnedPreamble = pinnedChunks.length > 0
    ? `📌 Pinned context — the user explicitly attached these to this conversation; treat as authoritative:\n\n${pinnedChunks
        .map((c, i) => {
          const header = c.headerChain.length > 0 ? ` › ${c.headerChain.join(' › ')}` : ''
          const src = c.sourceName ? `${c.sourceName} › ` : ''
          return `[pin#${i + 1}] ${src}${c.path}${header}\n${c.content.slice(0, 1600)}`
        })
        .join('\n\n---\n\n')}\n\n`
    : ''

  const knowledgePreamble = retrievedChunks.length > 0
    ? `Retrieved context from the user's knowledge sources — cite by [source › path] when used:\n\n${retrievedChunks
        .map((c, i) => {
          const header = c.headerChain.length > 0 ? ` › ${c.headerChain.join(' › ')}` : ''
          const src = c.sourceName ? `${c.sourceName} › ` : ''
          return `[#${i + 1}] ${src}${c.path}${header}\n${c.content.slice(0, 1200)}`
        })
        .join('\n\n---\n\n')}\n\n`
    : ''

  const prompt = buildThreadedPrompt(history, pinnedPreamble + knowledgePreamble + promptBody)

  const assistantId = randomUUID()
  broadcastToAll('chat:message:streaming', { conversationId, messageId: assistantId, agentId: turnAgentId ?? null })

  // Forward each model content block to the renderer so the bubble updates live
  let streamedContent = ''
  const onContent = (delta: string) => {
    if (!delta) return
    streamedContent += delta
    broadcastToAll('chat:message:delta', {
      conversationId,
      messageId: assistantId,
      delta,
      content: streamedContent
    })
  }

  let result
  try {
    if (turnAgentId) {
      // Route through AgentManager so the agent's system prompt + tools + project apply.
      // (Configured agents have their own toolset; we don't add aios MCP tools to them.)
      result = await runAgentHeadless(turnAgentId, prompt, undefined, conv.projectId, onContent)
    } else {
      // Plain chat — use Claude adapter directly with a generic assistant persona,
      // and expose the aios MCP server so the model can delegate to other agents/workflows.
      const cwd = getConversationCwd(conv.projectId)
      const sessionId = randomUUID()
      const mcpConfigPath = getMcpConfigPath()
      const bridgePort = getAiosBridgePort()
      const systemPrompt = `You are the orchestrator inside Curly Brackets — a local-first multi-agent workstation. Reply in clear markdown. Be concise.

You can delegate to specialised agents and pre-built workflows via these tools:
- mcp__aios__list_agents — discover what agents exist and what they're good at
- mcp__aios__list_workflows — discover what workflows are available
- mcp__aios__invoke_agent { agent_name, prompt } — delegate a sub-task to an agent and return its full response
- mcp__aios__run_workflow { workflow_name, input? } — trigger a multi-step workflow and return its leaf outputs

Use these when the user asks for something a specialised agent or workflow handles better than a general reply. Otherwise, just reply directly. When you reference files, use paths from the working directory.

${GENUI_SYSTEM_ADDENDUM}`

      result = await claudeAdapter.runHeadless(sessionId, prompt, conv.defaultModel, {
        systemPrompt,
        cwd,
        onContent,
        mcpConfigPath: mcpConfigPath ?? undefined,
        allowedTools: mcpConfigPath ? [
          'mcp__aios__list_agents',
          'mcp__aios__list_workflows',
          'mcp__aios__invoke_agent',
          'mcp__aios__run_workflow'
        ] : undefined,
        extraEnv: bridgePort ? { AIOS_BRIDGE_PORT: String(bridgePort) } : undefined
      })
    }
  } catch (err) {
    const errMsg = String((err as Error)?.message || err)
    const failMsg = {
      id: assistantId,
      conversationId,
      role: 'assistant' as const,
      agentId: turnAgentId ?? null,
      content: `_Error from model: ${errMsg}_`,
      sources: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      createdAt: Date.now()
    }
    db.insert(conversationMessages).values(failMsg).run()
    broadcastToAll('chat:message:added', { conversationId, message: failMsg })
    return
  }

  const sourcesJson = retrievedChunks.length > 0
    ? JSON.stringify(retrievedChunks.map((c) => ({
        sourceId: c.sourceId,
        sourceName: c.sourceName,
        sourceType: c.sourceType,
        kind: c.kind,
        path: c.path,
        title: c.title,
        headerChain: c.headerChain,
        score: c.score
      })))
    : null

  const assistantMsg = {
    id: assistantId,
    conversationId,
    role: 'assistant' as const,
    agentId: turnAgentId ?? null,
    content: result.content || '_(empty response)_',
    sources: sourcesJson,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    createdAt: Date.now()
  }
  db.insert(conversationMessages).values(assistantMsg).run()
  db.update(conversations).set({ lastMessageAt: Date.now(), updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
  broadcastToAll('chat:message:added', { conversationId, message: assistantMsg })

  // Record usage so Home / Command Center stays in sync.
  // (When `turnAgentId` is set we go via AgentManager.runHeadless, which already records usage.)
  if (!turnAgentId && (result.inputTokens > 0 || result.outputTokens > 0)) {
    try {
      db.insert(usageRecords).values({
        id: randomUUID(),
        agentId: null,
        sessionId: null,
        workflowRunId: null,
        provider: 'claude',
        model: conv.defaultModel,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: 0,
        costUsd: result.costUsd,
        timestamp: Date.now()
      }).run()
      broadcastToAll('usage:updated', {
        conversationId,
        provider: 'claude',
        model: conv.defaultModel,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd
      })
    } catch (err) {
      console.error('[chat] failed to record usage', err)
    }
  }

  // Best-effort auto-save (non-blocking failures)
  if (getSettingValue(KEY_AUTO_SAVE) === '1') {
    try { saveConversationToVault(conversationId) }
    catch (err) { console.error('[chat] auto-save failed', err) }
  }
}
