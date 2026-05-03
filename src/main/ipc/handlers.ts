import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { randomUUID } from 'crypto'
import { db } from '../db'
import { projects, usageRecords, workflows, workflowRuns, agentMessages, appSettings } from '../db/schema'
import { eq, gte, lte, desc, and } from 'drizzle-orm'
import * as AgentManager from '../agents/AgentManager'
import * as WorkflowExecutor from '../workflows/WorkflowExecutor'
import * as WorkflowScheduler from '../workflows/WorkflowScheduler'
import * as ChatManager from '../chat/ChatManager'
import * as KnowledgeManager from '../knowledge/KnowledgeManager'
import { ClaudeAdapter } from '../cli/ClaudeAdapter'
import { GeminiAdapter } from '../cli/GeminiAdapter'
import { Agent, Project, UsageSummary, CLIHealth } from '@shared/types'

const claudeAdapter = new ClaudeAdapter()
const geminiAdapter = new GeminiAdapter()

export function registerHandlers(): void {
  // ── Agents ──────────────────────────────────────────────────────────────
  ipcMain.handle('agents:create', async (_, config) => AgentManager.createAgent(config))
  ipcMain.handle('agents:list', async () => AgentManager.listAgents())
  ipcMain.handle('agents:get', async (_, id: string) => AgentManager.getAgent(id))
  ipcMain.handle('agents:update', async (_, id: string, updates: Partial<Agent>) => AgentManager.updateAgent(id, updates))
  ipcMain.handle('agents:delete', async (_, id: string) => AgentManager.deleteAgent(id))

  ipcMain.handle('agents:startSession', async (_, agentId: string) => AgentManager.startSession(agentId))
  ipcMain.handle('agents:killSession', async (_, agentId: string) => AgentManager.killSession(agentId))
  ipcMain.handle('agents:sendInput', async (_, sessionId: string, input: string) => AgentManager.sendInput(sessionId, input))
  ipcMain.handle('agents:resizeSession', async (_, sessionId: string, cols: number, rows: number) => AgentManager.resizeSession(sessionId, cols, rows))
  ipcMain.handle('agents:runHeadless', async (_, agentId: string, prompt: string) => AgentManager.runHeadless(agentId, prompt))
  ipcMain.handle('agents:getBuffer', async (_, sessionId: string) => AgentManager.getSessionBuffer(sessionId))

  ipcMain.handle('agents:readMemory', async (_, agentId: string) => AgentManager.readMemory(agentId))
  ipcMain.handle('agents:writeMemory', async (_, agentId: string, content: string) => AgentManager.writeMemory(agentId, content))
  ipcMain.handle('agents:roots', async (_, agentId: string) => AgentManager.getAgentRootList(agentId))
  ipcMain.handle('agents:listFiles', async (_, agentId: string, rootPath: string, subPath?: string) =>
    AgentManager.listWorkspaceFiles(agentId, rootPath, subPath ?? '')
  )
  ipcMain.handle('agents:readFile', async (_, agentId: string, rootPath: string, relPath: string) =>
    AgentManager.readWorkspaceFile(agentId, rootPath, relPath)
  )
  ipcMain.handle('agents:writeFile', async (_, agentId: string, rootPath: string, relPath: string, content: string) =>
    AgentManager.writeWorkspaceFile(agentId, rootPath, relPath, content)
  )

  // ── Projects ─────────────────────────────────────────────────────────────
  ipcMain.handle('projects:list', async () => {
    return db.select().from(projects).all()
  })

  ipcMain.handle('projects:create', async (_, config: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const project: Project = { ...config, id: randomUUID(), createdAt: now, updatedAt: now }
    db.insert(projects).values({ ...project, tags: JSON.stringify(project.tags) }).run()
    return project
  })

  ipcMain.handle('projects:delete', async (_, id: string) => {
    db.delete(projects).where(eq(projects.id, id)).run()
  })

  // ── Workflows ─────────────────────────────────────────────────────────────
  ipcMain.handle('workflows:list', async () => db.select().from(workflows).all())

  ipcMain.handle('workflows:get', async (_, id: string) => {
    return db.select().from(workflows).where(eq(workflows.id, id)).get() ?? null
  })

  ipcMain.handle('workflows:create', async (_, config) => {
    const now = Date.now()
    const wf = {
      id: randomUUID(),
      name: config.name,
      description: config.description ?? '',
      projectId: config.projectId ?? null,
      definition: config.definition ?? JSON.stringify({ nodes: [], edges: [] }),
      triggerConfig: config.triggerConfig ?? null,
      createdAt: now,
      updatedAt: now
    }
    db.insert(workflows).values(wf).run()
    return wf
  })

  ipcMain.handle('workflows:update', async (_, id: string, updates: Record<string, unknown>) => {
    const patch: Record<string, unknown> = { ...updates, updatedAt: Date.now() }
    db.update(workflows).set(patch).where(eq(workflows.id, id)).run()
    // If trigger config changed, re-apply the cron schedule
    if ('triggerConfig' in updates) {
      WorkflowScheduler.reapplyWorkflowSchedule(id)
    }
  })

  ipcMain.handle('workflows:delete', async (_, id: string) => {
    WorkflowScheduler.removeWorkflowSchedule(id)
    db.delete(workflows).where(eq(workflows.id, id)).run()
  })

  ipcMain.handle('workflows:run', async (_, workflowId: string, initialInput?: string) => {
    return WorkflowExecutor.runWorkflow(workflowId, initialInput)
  })

  ipcMain.handle('workflows:run:state', async (_, runId: string) => {
    return WorkflowExecutor.getRunState(runId)
  })

  ipcMain.handle('workflows:runs:list', async (_, workflowId?: string) => {
    if (workflowId) {
      return db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, workflowId)).all()
    }
    return db.select().from(workflowRuns).all()
  })

  ipcMain.handle('workflows:nextFire', async (_, cronExpr: string) => {
    return WorkflowScheduler.nextFireForCron(cronExpr)
  })

  ipcMain.handle('aios:bridgePort', async () => {
    const { getAiosBridgePort } = await import('../messaging/AiosBridge')
    return getAiosBridgePort()
  })

  ipcMain.handle('workflows:approval:resolve', async (_, runId: string, stepId: string, approved: boolean) => {
    return WorkflowExecutor.resolveApproval(runId, stepId, approved)
  })

  ipcMain.handle('workflows:resumeFrom', async (_, runId: string, fromStepId: string, initialInput?: string) => {
    return WorkflowExecutor.resumeWorkflow(runId, fromStepId, initialInput)
  })

  ipcMain.handle('workflows:lastRun', async (_, workflowId: string) => {
    const row = db.select().from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(1)
      .get()
    return row ?? null
  })

  // ── Usage & Analytics ─────────────────────────────────────────────────────
  ipcMain.handle('usage:summary', async (_, sinceMs?: number): Promise<UsageSummary> => {
    const since = sinceMs || Date.now() - 24 * 60 * 60 * 1000
    const records = db.select().from(usageRecords).where(gte(usageRecords.timestamp, since)).all()

    const summary: UsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      byProvider: { claude: { tokens: 0, costUsd: 0 }, gemini: { tokens: 0, costUsd: 0 } },
      byModel: {},
      byAgent: {}
    }

    for (const r of records) {
      const tokens = (r.inputTokens || 0) + (r.outputTokens || 0)
      summary.totalInputTokens += r.inputTokens || 0
      summary.totalOutputTokens += r.outputTokens || 0
      summary.totalCostUsd += r.costUsd || 0

      const provider = r.provider as 'claude' | 'gemini'
      summary.byProvider[provider].tokens += tokens
      summary.byProvider[provider].costUsd += r.costUsd || 0

      if (!summary.byModel[r.model]) summary.byModel[r.model] = { tokens: 0, costUsd: 0 }
      summary.byModel[r.model].tokens += tokens
      summary.byModel[r.model].costUsd += r.costUsd || 0

      if (r.agentId) {
        if (!summary.byAgent[r.agentId]) summary.byAgent[r.agentId] = { tokens: 0, costUsd: 0 }
        summary.byAgent[r.agentId].tokens += tokens
        summary.byAgent[r.agentId].costUsd += r.costUsd || 0
      }
    }

    return summary
  })

  ipcMain.handle('usage:history', async (_, days: number = 7) => {
    const result: { date: string; claude: number; gemini: number; claudeCost: number; geminiCost: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)
      const records = db
        .select()
        .from(usageRecords)
        .where(
          and(
            gte(usageRecords.timestamp, dayStart.getTime()),
            lte(usageRecords.timestamp, dayEnd.getTime())
          )
        )
        .all()
      const date = dayStart.toLocaleDateString('en-US', { weekday: 'short' })
      let claude = 0,
        gemini = 0,
        claudeCost = 0,
        geminiCost = 0
      for (const r of records) {
        const t = (r.inputTokens || 0) + (r.outputTokens || 0)
        if (r.provider === 'claude') {
          claude += t
          claudeCost += r.costUsd || 0
        } else {
          gemini += t
          geminiCost += r.costUsd || 0
        }
      }
      result.push({ date, claude, gemini, claudeCost, geminiCost })
    }
    return result
  })

  // ── Agent Messaging ────────────────────────────────────────────────────────
  ipcMain.handle('messages:send', async (_, payload: {
    fromAgentId: string | null
    toAgentId: string | null
    content: string
    contentType?: string
    priority?: string
    workflowRunId?: string
  }) => {
    const id = randomUUID()
    const message = {
      id,
      fromAgentId: payload.fromAgentId,
      toAgentId: payload.toAgentId,
      workflowRunId: payload.workflowRunId ?? null,
      contentType: payload.contentType ?? 'text',
      content: payload.content,
      priority: payload.priority ?? 'normal',
      timestamp: Date.now(),
      read: 0
    }
    db.insert(agentMessages).values(message).run()
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('message:new', message)
    })
    return message
  })

  ipcMain.handle('messages:list', async (_, filter?: {
    toAgentId?: string
    fromAgentId?: string
    workflowRunId?: string
    limit?: number
  }) => {
    let query = db.select().from(agentMessages).$dynamic()
    const conds = []
    if (filter?.toAgentId) conds.push(eq(agentMessages.toAgentId, filter.toAgentId))
    if (filter?.fromAgentId) conds.push(eq(agentMessages.fromAgentId, filter.fromAgentId))
    if (filter?.workflowRunId) conds.push(eq(agentMessages.workflowRunId, filter.workflowRunId))
    if (conds.length) query = query.where(and(...conds))
    return query.orderBy(desc(agentMessages.timestamp)).limit(filter?.limit ?? 100).all()
  })

  ipcMain.handle('messages:unreadCounts', async () => {
    const rows = db.select({
      toAgentId: agentMessages.toAgentId,
      read: agentMessages.read
    }).from(agentMessages).all()
    const counts: Record<string, number> = {}
    for (const r of rows) {
      if (!r.toAgentId || r.read) continue
      counts[r.toAgentId] = (counts[r.toAgentId] || 0) + 1
    }
    return counts
  })

  ipcMain.handle('messages:markRead', async (_, messageId: string) => {
    db.update(agentMessages).set({ read: 1 }).where(eq(agentMessages.id, messageId)).run()
  })

  // ── Chat ───────────────────────────────────────────────────────────────────
  ipcMain.handle('chat:list', async () => ChatManager.listConversations())
  ipcMain.handle('chat:get', async (_, id: string) => ChatManager.getConversation(id))
  ipcMain.handle('chat:create', async (_, input?: ChatManager.CreateConversationInput) => ChatManager.createConversation(input))
  ipcMain.handle('chat:update', async (_, id: string, updates: Parameters<typeof ChatManager.updateConversation>[1]) =>
    ChatManager.updateConversation(id, updates)
  )
  ipcMain.handle('chat:delete', async (_, id: string) => ChatManager.deleteConversation(id))
  ipcMain.handle('chat:send', async (_, conversationId: string, content: string) =>
    ChatManager.sendMessage(conversationId, content)
  )
  ipcMain.handle('chat:fork', async (_, sourceId: string, untilMessageId: string) =>
    ChatManager.forkConversation(sourceId, untilMessageId)
  )
  ipcMain.handle('chat:saveToVault', async (_, conversationId: string) =>
    ChatManager.saveConversationToVault(conversationId)
  )

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle('settings:all', async () => {
    const rows = db.select().from(appSettings).all()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  ipcMain.handle('settings:set', async (_, key: string, value: string) => {
    const now = Date.now()
    const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
    if (existing) {
      db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run()
    } else {
      db.insert(appSettings).values({ key, value, updatedAt: now }).run()
    }
  })

  // ── Knowledge (multi-source + per-project) ─────────────────────────────────
  ipcMain.handle('knowledge:stats', async () => KnowledgeManager.getStats())
  ipcMain.handle('knowledge:sources:list', async (_, filter?: { scope?: 'global' | 'project'; projectId?: string | null }) =>
    KnowledgeManager.listSources(filter)
  )
  ipcMain.handle('knowledge:sources:get', async (_, id: string) => KnowledgeManager.getSource(id))
  ipcMain.handle('knowledge:sources:create', async (_, input: Parameters<typeof KnowledgeManager.createSource>[0]) =>
    KnowledgeManager.createSource(input)
  )
  ipcMain.handle('knowledge:sources:update', async (_, id: string, updates: Parameters<typeof KnowledgeManager.updateSource>[1]) =>
    KnowledgeManager.updateSource(id, updates)
  )
  ipcMain.handle('knowledge:sources:delete', async (_, id: string) => KnowledgeManager.deleteSource(id))
  ipcMain.handle('knowledge:sources:reindex', async (_, id: string) => KnowledgeManager.reindexSource(id))
  ipcMain.handle('knowledge:retrieve', async (_, query: string, opts?: Parameters<typeof KnowledgeManager.retrieve>[1]) =>
    KnowledgeManager.retrieve(query, opts)
  )
  ipcMain.handle('knowledge:chunks:byIds', async (_, ids: string[]) => KnowledgeManager.getChunksByIds(ids))
  ipcMain.handle('knowledge:chunks:search', async (_, query: string, opts?: { projectId?: string | null; limit?: number }) =>
    KnowledgeManager.searchChunkPaths(query, opts)
  )
  ipcMain.handle('knowledge:startWatchers', async () => {
    KnowledgeManager.startAllWatchers()
    return { count: KnowledgeManager.getStats().watcherCount }
  })
  ipcMain.handle('knowledge:stopWatchers', async () => {
    KnowledgeManager.stopAllWatchers()
    return { count: 0 }
  })

  // ── Dialogs ────────────────────────────────────────────────────────────────
  ipcMain.handle('dialog:pickFile', async (_, opts?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const dialogOpts = {
      properties: ['openFile' as const],
      title: opts?.title ?? 'Select file',
      defaultPath: opts?.defaultPath,
      filters: opts?.filters
    }
    const result = win ? await dialog.showOpenDialog(win, dialogOpts) : await dialog.showOpenDialog(dialogOpts)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:pickDirectory', async (_, opts?: { title?: string; defaultPath?: string }) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
          title: opts?.title ?? 'Select directory',
          defaultPath: opts?.defaultPath
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: opts?.title ?? 'Select directory',
          defaultPath: opts?.defaultPath
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── App info ───────────────────────────────────────────────────────────────
  ipcMain.handle('app:info', async () => ({
    name: 'Curly Brackets',
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch
  }))

  // ── CLI Health ─────────────────────────────────────────────────────────────
  ipcMain.handle('cli:health', async (): Promise<CLIHealth> => {
    const [claude, gemini] = await Promise.all([
      claudeAdapter.healthCheck(),
      geminiAdapter.healthCheck()
    ])
    return { claude, gemini }
  })
}
