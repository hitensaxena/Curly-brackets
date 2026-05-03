import { randomUUID } from 'crypto'
import { join, resolve, relative, sep } from 'path'
import { mkdirSync, writeFileSync, existsSync, appendFileSync, readFileSync, readdirSync, statSync } from 'fs'
import { app, BrowserWindow } from 'electron'
import { db } from '../db'
import { agents, agentSessions, usageRecords, projects } from '../db/schema'
import { eq, and, gte } from 'drizzle-orm'
import { ClaudeAdapter, PTYSession, readClaudeSessionUsage, CLAUDE_PRICING } from '../cli/ClaudeAdapter'
import { GeminiAdapter, GeminiPTYSession } from '../cli/GeminiAdapter'
import { getAiosBridgePort } from '../messaging/AiosBridge'
import { Agent, AgentStatus } from '@shared/types'

const claudeAdapter = new ClaudeAdapter()
const geminiAdapter = new GeminiAdapter()

const activeSessions = new Map<string, PTYSession | GeminiPTYSession>()
const sessionBuffers = new Map<string, string>()
const MAX_BUFFER = 1_000_000 // 1 MB per session

function appendBuffer(sessionId: string, data: string): void {
  const existing = sessionBuffers.get(sessionId) ?? ''
  const next = existing + data
  sessionBuffers.set(sessionId, next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next)
}

export function getSessionBuffer(sessionId: string): string {
  return sessionBuffers.get(sessionId) ?? ''
}

function getAgentDataDir(agentId: string): string {
  const dir = join(app.getPath('userData'), 'agents', agentId)
  mkdirSync(dir, { recursive: true })
  return dir
}

function getAgentWorkspaceDir(agentId: string): string {
  const dir = join(app.getPath('userData'), 'agents', agentId, 'workspace')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Resolves the cwd for an agent session: project's repoPath if the agent is bound
 * to a project that has one, otherwise the per-agent workspace dir. Always returns
 * the agent workspace as an extraDir so CLAUDE.md/GEMINI.md remain discoverable.
 */
/**
 * Env vars + PATH addition that let a running PTY session shell out to the
 * `aios` CLI (installed at userData/bin/aios) so the agent can message peers.
 */
function buildAiosEnv(agentId: string): Record<string, string> {
  const binDir = join(app.getPath('userData'), 'bin')
  const port = getAiosBridgePort()
  return {
    AIOS_AGENT_ID: agentId,
    AIOS_BRIDGE_PORT: String(port || ''),
    PATH: `${binDir}:${process.env.PATH ?? ''}`
  }
}

function resolveSessionDirs(agent: Agent, projectIdOverride?: string | null): { cwd: string; extraDirs: string[] } {
  const workspaceDir = getAgentWorkspaceDir(agent.id)
  // Workflow-level project takes precedence over agent's own project
  const effectiveProjectId = projectIdOverride ?? agent.projectId
  if (!effectiveProjectId) return { cwd: workspaceDir, extraDirs: [] }

  const project = db.select().from(projects).where(eq(projects.id, effectiveProjectId)).get()
  const repoPath = project?.repoPath
  if (!repoPath || !existsSync(repoPath)) return { cwd: workspaceDir, extraDirs: [] }

  return { cwd: repoPath, extraDirs: [workspaceDir] }
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  })
}

export function resetStaleAgents(): void {
  db.update(agents)
    .set({ status: 'idle', activeSessionId: null, updatedAt: Date.now() })
    .where(eq(agents.status, 'running'))
    .run()
}

export async function createAgent(config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'activeSessionId' | 'memoryPath'>): Promise<Agent> {
  const id = randomUUID()
  const now = Date.now()
  getAgentDataDir(id)
  const workspaceDir = getAgentWorkspaceDir(id)
  const memoryFile = config.provider === 'gemini' ? 'GEMINI.md' : 'CLAUDE.md'
  const memoryPath = join(workspaceDir, memoryFile)

  if (!existsSync(memoryPath)) {
    writeFileSync(memoryPath, `# Agent: ${config.name} — Memory

## My Role
${config.systemPrompt}

## Talking to peer agents
You are running inside Curly Brackets. You can message other agents from your bash tool using the \`aios\` CLI:

- \`aios agents\` — list peers (id, name, provider/model)
- \`aios send <agent-name-or-id> "your message"\` — send a message; matches by exact id, exact name, or name prefix
- \`aios inbox\` — read your unread inbox (auto-marks as read); add \`--all\` to include read messages, \`-n N\` for a different limit
- \`aios whoami\` — confirm your identity

Use this for delegation ("ask the Reviewer to look at this diff"), status updates, or coordinating multi-step work. Keep messages short and actionable.

## Things I've Learned
(Auto-appended after each session.)

## Recent Sessions
`)
  }

  const agent: Agent = {
    ...config,
    id,
    memoryPath,
    status: 'idle',
    activeSessionId: null,
    createdAt: now,
    updatedAt: now
  }

  db.insert(agents).values({
    ...agent,
    toolsEnabled: JSON.stringify(agent.toolsEnabled)
  }).run()

  return agent
}

export async function listAgents(): Promise<Agent[]> {
  const rows = db.select().from(agents).all()
  return rows.map((r) => ({
    ...r,
    role: (r.role || 'custom') as Agent['role'],
    provider: (r.provider || 'claude') as Agent['provider'],
    toolsEnabled: JSON.parse(r.toolsEnabled || '[]'),
    description: r.description || '',
    systemPrompt: r.systemPrompt || '',
    memoryPath: r.memoryPath || '',
    status: (r.status || 'idle') as AgentStatus
  }))
}

export async function getAgent(id: string): Promise<Agent | null> {
  const row = db.select().from(agents).where(eq(agents.id, id)).get()
  if (!row) return null
  return {
    ...row,
    role: (row.role || 'custom') as Agent['role'],
    provider: (row.provider || 'claude') as Agent['provider'],
    toolsEnabled: JSON.parse(row.toolsEnabled || '[]'),
    description: row.description || '',
    systemPrompt: row.systemPrompt || '',
    memoryPath: row.memoryPath || '',
    status: (row.status || 'idle') as AgentStatus
  }
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<void> {
  const patch: Record<string, unknown> = { ...updates, updatedAt: Date.now() }
  if (updates.toolsEnabled) patch.toolsEnabled = JSON.stringify(updates.toolsEnabled)
  db.update(agents).set(patch).where(eq(agents.id, id)).run()
}

export async function deleteAgent(id: string): Promise<void> {
  await killSession(id)
  db.delete(agents).where(eq(agents.id, id)).run()
}

export async function startSession(agentId: string): Promise<string> {
  const agent = await getAgent(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  const sessionId = randomUUID()
  const startedAt = Date.now()
  const { cwd, extraDirs } = resolveSessionDirs(agent)

  const aiosEnv = buildAiosEnv(agentId)

  if (agent.provider === 'claude') {
    const session = claudeAdapter.spawnSession(sessionId)
    session.start(agent.systemPrompt || '', agent.model, cwd, extraDirs, aiosEnv)

    session.on('data', (data: string) => {
      appendBuffer(sessionId, data)
      broadcastToAll('agent:output', { sessionId, data })
    })

    session.on('exit', async () => {
      activeSessions.delete(sessionId)
      sessionBuffers.delete(sessionId)
      // Wait briefly so Claude can flush its session JSONL, then capture usage + memory
      setTimeout(() => {
        captureClaudePTYUsage(agentId, sessionId, agent.model, cwd)
        recordSessionToMemory(agent, sessionId, startedAt, cwd)
      }, 1000)
      await endSession(agentId, sessionId)
      broadcastToAll('agent:status', { agentId, status: 'idle', sessionId })
    })

    activeSessions.set(sessionId, session)
  } else {
    const session = geminiAdapter.spawnSession(sessionId)
    session.start(agent.model, cwd, extraDirs, aiosEnv)

    session.on('data', (data: string) => {
      appendBuffer(sessionId, data)
      broadcastToAll('agent:output', { sessionId, data })
    })

    session.on('exit', async () => {
      activeSessions.delete(sessionId)
      sessionBuffers.delete(sessionId)
      recordSessionToMemory(agent, sessionId, startedAt, cwd)
      await endSession(agentId, sessionId)
      broadcastToAll('agent:status', { agentId, status: 'idle', sessionId })
    })

    activeSessions.set(sessionId, session)
  }

  db.insert(agentSessions).values({
    id: sessionId,
    agentId,
    startedAt: Date.now()
  }).run()

  db.update(agents).set({ status: 'running', activeSessionId: sessionId, updatedAt: Date.now() }).where(eq(agents.id, agentId)).run()

  broadcastToAll('agent:status', { agentId, status: 'running', sessionId })
  return sessionId
}

export function sendInput(sessionId: string, input: string): void {
  activeSessions.get(sessionId)?.write(input)
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = activeSessions.get(sessionId)
  if (session) session.resize(cols, rows)
}

export async function killSession(agentId: string): Promise<void> {
  const agent = await getAgent(agentId)
  if (!agent?.activeSessionId) return

  const session = activeSessions.get(agent.activeSessionId)
  // session.kill() will trigger the 'exit' handler in startSession, which
  // captures usage and broadcasts idle status. Don't duplicate that work here.
  session?.kill()
}

function appendSessionSummary(agent: Agent, lines: string[]): void {
  if (!agent.memoryPath) {
    console.warn('[auto-memory] no memoryPath for', agent.name)
    return
  }
  if (!existsSync(agent.memoryPath)) {
    console.warn('[auto-memory] memory file missing for', agent.name, '@', agent.memoryPath)
    return
  }
  try {
    appendFileSync(agent.memoryPath, `\n${lines.join('\n')}\n`, 'utf-8')
    console.log('[auto-memory] appended', lines.length, 'lines to', agent.memoryPath)
  } catch (err) {
    console.error('[auto-memory] failed to append to', agent.memoryPath, err)
  }
}

/**
 * Append a one-line summary of a just-finished session to the agent's memory file.
 * For Claude we read tokens/cost from the session JSONL; for Gemini we just record duration.
 */
function recordSessionToMemory(agent: Agent, sessionId: string, startedAt: number, cwd: string): void {
  const endedAt = Date.now()
  const durationSec = Math.round((endedAt - startedAt) / 1000)
  const when = new Date(endedAt).toISOString()
  const lines: string[] = []
  lines.push(`### Session ${when}`)
  lines.push(`- Duration: ${durationSec}s`)
  lines.push(`- Working dir: ${cwd}`)

  if (agent.provider === 'claude') {
    const usage = readClaudeSessionUsage(cwd, sessionId)
    if (usage) {
      const totalTokens = usage.inputTokens + usage.outputTokens
      lines.push(`- Tokens: ${totalTokens} (${usage.inputTokens} in, ${usage.outputTokens} out)`)
    }
  }

  appendSessionSummary(agent, lines)
}

function captureClaudePTYUsage(agentId: string, sessionId: string, model: string, cwd: string): void {
  const usage = readClaudeSessionUsage(cwd, sessionId)
  if (!usage) return

  const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING['claude-sonnet-4-6']
  const costUsd =
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output +
    (usage.cacheReadTokens / 1_000_000) * pricing.input * 0.1 +
    (usage.cacheCreationTokens / 1_000_000) * pricing.input * 1.25

  db.insert(usageRecords).values({
    id: randomUUID(),
    agentId,
    sessionId,
    provider: 'claude',
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    costUsd,
    timestamp: Date.now()
  }).run()

  broadcastToAll('usage:updated', { agentId, sessionId, costUsd, ...usage })
}

async function endSession(agentId: string, sessionId: string): Promise<void> {
  db.update(agentSessions).set({ endedAt: Date.now() }).where(eq(agentSessions.id, sessionId)).run()
  db.update(agents).set({ status: 'idle', activeSessionId: null, updatedAt: Date.now() }).where(eq(agents.id, agentId)).run()
}

/**
 * Today's total spend for an agent (UTC midnight → now). Used by the budget gate.
 */
export function getAgentSpendToday(agentId: string): number {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const rows = db.select({ costUsd: usageRecords.costUsd })
    .from(usageRecords)
    .where(and(eq(usageRecords.agentId, agentId), gte(usageRecords.timestamp, dayStart.getTime())))
    .all()
  return rows.reduce((s, r) => s + (r.costUsd ?? 0), 0)
}

export class BudgetExceededError extends Error {
  constructor(public readonly agentId: string, public readonly spent: number, public readonly cap: number) {
    super(`Agent budget exceeded: $${spent.toFixed(4)} of $${cap.toFixed(2)} daily cap`)
    this.name = 'BudgetExceededError'
  }
}

export async function runHeadless(
  agentId: string,
  prompt: string,
  workflowRunId?: string,
  projectIdOverride?: string | null,
  onContent?: (delta: string) => void
): Promise<{ content: string; costUsd: number; inputTokens: number; outputTokens: number }> {
  const agent = await getAgent(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // Pre-flight budget check: if today's spend has hit the daily cap, refuse + auto-pause
  if (agent.dailyBudgetUsd && agent.dailyBudgetUsd > 0) {
    const spentToday = getAgentSpendToday(agentId)
    if (spentToday >= agent.dailyBudgetUsd) {
      // Mark paused so the UI can show it's not idle, then refuse
      db.update(agents).set({ status: 'paused', updatedAt: Date.now() }).where(eq(agents.id, agentId)).run()
      broadcastToAll('agent:status', { agentId, status: 'paused' })
      broadcastToAll('agent:budget:exceeded', {
        agentId, agentName: agent.name, spent: spentToday, cap: agent.dailyBudgetUsd
      })
      throw new BudgetExceededError(agentId, spentToday, agent.dailyBudgetUsd)
    }
  }

  const sessionId = randomUUID()
  const provider = agent.provider

  const { cwd, extraDirs } = resolveSessionDirs(agent, projectIdOverride)
  const result = provider === 'claude'
    ? await claudeAdapter.runHeadless(sessionId, prompt, agent.model, { systemPrompt: agent.systemPrompt, cwd, extraDirs, onContent })
    : await geminiAdapter.runHeadless(sessionId, prompt, agent.model)

  db.insert(usageRecords).values({
    id: randomUUID(),
    agentId,
    sessionId,
    workflowRunId: workflowRunId ?? null,
    provider,
    model: agent.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cacheReadTokens: 0,
    costUsd: result.costUsd,
    timestamp: Date.now()
  }).run()

  broadcastToAll('usage:updated', { agentId, sessionId, workflowRunId, costUsd: result.costUsd })

  return {
    content: result.content,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  }
}

// ── Memory editor + workspace file browser ─────────────────────────────────

const IGNORE_DIRS = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'out', '.next', 'target', '.cache'])
const MAX_FILE_SIZE_BYTES = 1_000_000 // 1MB cap on read/write to keep the UI snappy

export async function readMemory(agentId: string): Promise<{ path: string; content: string } | null> {
  const agent = await getAgent(agentId)
  if (!agent || !agent.memoryPath || !existsSync(agent.memoryPath)) return null
  const content = readFileSync(agent.memoryPath, 'utf-8')
  return { path: agent.memoryPath, content }
}

export async function writeMemory(agentId: string, content: string): Promise<void> {
  const agent = await getAgent(agentId)
  if (!agent || !agent.memoryPath) throw new Error('Agent has no memory file')
  writeFileSync(agent.memoryPath, content, 'utf-8')
}

interface WorkspaceRoot {
  label: string
  path: string
}

/**
 * Returns the roots an agent is allowed to read/write through the file browser:
 * - Always: the agent's own workspace dir
 * - If bound: the project's repoPath
 */
async function getAgentRoots(agentId: string): Promise<WorkspaceRoot[]> {
  const agent = await getAgent(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)
  const roots: WorkspaceRoot[] = [
    { label: 'workspace', path: getAgentWorkspaceDir(agentId) }
  ]
  if (agent.projectId) {
    const project = db.select().from(projects).where(eq(projects.id, agent.projectId)).get()
    if (project?.repoPath && existsSync(project.repoPath)) {
      roots.push({ label: project.name, path: project.repoPath })
    }
  }
  return roots
}

interface FileEntry {
  name: string
  path: string  // path relative to root
  isDir: boolean
  size?: number
  mtime?: number
}

/**
 * Resolve a relative path against a root, ensuring it stays inside the root.
 * Returns the absolute path or throws if the path escapes.
 */
function safeResolve(rootPath: string, relPath: string): string {
  const abs = resolve(rootPath, relPath)
  const rel = relative(rootPath, abs)
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(rootPath, rel) !== abs) {
    throw new Error(`Path escapes root: ${relPath}`)
  }
  return abs
}

export async function listWorkspaceFiles(agentId: string, rootPath: string, subPath = ''): Promise<FileEntry[]> {
  const roots = await getAgentRoots(agentId)
  const root = roots.find((r) => r.path === rootPath)
  if (!root) throw new Error(`Root not allowed: ${rootPath}`)
  const dir = safeResolve(root.path, subPath)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  const entries: FileEntry[] = []
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue
    const full = join(dir, name)
    let stat
    try { stat = statSync(full) } catch { continue }
    entries.push({
      name,
      path: relative(root.path, full),
      isDir: stat.isDirectory(),
      size: stat.isFile() ? stat.size : undefined,
      mtime: stat.mtimeMs
    })
  }
  // Folders first, then alpha
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  return entries
}

export async function getAgentRootList(agentId: string): Promise<WorkspaceRoot[]> {
  return getAgentRoots(agentId)
}

export async function readWorkspaceFile(agentId: string, rootPath: string, relPath: string): Promise<{ path: string; content: string; size: number; truncated: boolean }> {
  const roots = await getAgentRoots(agentId)
  const root = roots.find((r) => r.path === rootPath)
  if (!root) throw new Error(`Root not allowed: ${rootPath}`)
  const abs = safeResolve(root.path, relPath)
  if (!existsSync(abs)) throw new Error('File not found')
  const stat = statSync(abs)
  if (!stat.isFile()) throw new Error('Path is not a file')
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return {
      path: abs,
      content: readFileSync(abs, 'utf-8').slice(0, MAX_FILE_SIZE_BYTES),
      size: stat.size,
      truncated: true
    }
  }
  return { path: abs, content: readFileSync(abs, 'utf-8'), size: stat.size, truncated: false }
}

export async function writeWorkspaceFile(agentId: string, rootPath: string, relPath: string, content: string): Promise<void> {
  if (content.length > MAX_FILE_SIZE_BYTES) throw new Error('File too large to write through the UI')
  const roots = await getAgentRoots(agentId)
  const root = roots.find((r) => r.path === rootPath)
  if (!root) throw new Error(`Root not allowed: ${rootPath}`)
  const abs = safeResolve(root.path, relPath)
  writeFileSync(abs, content, 'utf-8')
}
