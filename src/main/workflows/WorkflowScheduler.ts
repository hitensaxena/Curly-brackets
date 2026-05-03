import * as cron from 'node-cron'
import { CronExpressionParser } from 'cron-parser'
import { watch, FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { workflows } from '../db/schema'
import { runWorkflow } from './WorkflowExecutor'

/**
 * Compute the next-fire timestamp for a cron expression in the local timezone.
 * Returns null if the expression is invalid.
 */
export function nextFireForCron(expr: string): number | null {
  try {
    const it = CronExpressionParser.parse(expr, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
    return it.next().getTime()
  } catch {
    return null
  }
}

/**
 * trigger_config JSON shape stored on workflow rows. One of:
 *   { type: 'cron', cron: '0 9 * * *', enabled: boolean, lastRunAt?: number }
 *   { type: 'fileWatch', paths: string[], events?: ['add','change','unlink'], enabled: boolean, lastRunAt?: number }
 *   { type: 'webhook', secret?: string, enabled: boolean, lastRunAt?: number }
 */
type TriggerEvent = 'add' | 'change' | 'unlink'

interface CronTriggerConfig {
  type: 'cron'
  cron: string
  enabled: boolean
  lastRunAt?: number
}

interface FileWatchTriggerConfig {
  type: 'fileWatch'
  paths: string[]
  events?: TriggerEvent[]
  /** Debounce window in ms; back-to-back changes within this window only fire once */
  debounceMs?: number
  enabled: boolean
  lastRunAt?: number
}

interface WebhookTriggerConfig {
  type: 'webhook'
  secret?: string
  enabled: boolean
  lastRunAt?: number
}

type TriggerConfig = CronTriggerConfig | FileWatchTriggerConfig | WebhookTriggerConfig

const tasks = new Map<string, cron.ScheduledTask>()
const watchers = new Map<string, FSWatcher>()
const webhookWorkflows = new Map<string, WebhookTriggerConfig>() // workflowId → config

function broadcastSchedulerUpdate(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('workflow:scheduler:update', { active: tasks.size })
  })
}

function parseTrigger(raw: string | null): TriggerConfig | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (obj?.type === 'cron' && typeof obj.cron === 'string') {
      return { type: 'cron', cron: obj.cron, enabled: obj.enabled !== false, lastRunAt: obj.lastRunAt }
    }
    if (obj?.type === 'fileWatch' && Array.isArray(obj.paths)) {
      return {
        type: 'fileWatch',
        paths: obj.paths.filter((p: unknown) => typeof p === 'string'),
        events: Array.isArray(obj.events) ? obj.events : undefined,
        debounceMs: typeof obj.debounceMs === 'number' ? obj.debounceMs : 1000,
        enabled: obj.enabled !== false,
        lastRunAt: obj.lastRunAt
      }
    }
    if (obj?.type === 'webhook') {
      return { type: 'webhook', secret: obj.secret, enabled: obj.enabled !== false, lastRunAt: obj.lastRunAt }
    }
  } catch {
    // ignore
  }
  return null
}

function persistLastRun(workflowId: string): void {
  const fresh = db.select().from(workflows).where(eq(workflows.id, workflowId)).get() as
    | { triggerConfig: string | null }
    | undefined
  if (!fresh) return
  const cfg = parseTrigger(fresh.triggerConfig)
  if (!cfg) return
  cfg.lastRunAt = Date.now()
  db.update(workflows)
    .set({ triggerConfig: JSON.stringify(cfg), updatedAt: Date.now() })
    .where(eq(workflows.id, workflowId))
    .run()
}

function unscheduleWorkflow(workflowId: string): void {
  const t = tasks.get(workflowId)
  if (t) { t.stop(); tasks.delete(workflowId) }
  const w = watchers.get(workflowId)
  if (w) { w.close(); watchers.delete(workflowId) }
  webhookWorkflows.delete(workflowId)
}

export function scheduleWorkflow(workflowId: string): void {
  unscheduleWorkflow(workflowId)
  const wf = db.select().from(workflows).where(eq(workflows.id, workflowId)).get() as
    | { id: string; name: string; triggerConfig: string | null }
    | undefined
  if (!wf) return
  const trigger = parseTrigger(wf.triggerConfig)
  if (!trigger || !trigger.enabled) return

  if (trigger.type === 'cron') {
    if (!cron.validate(trigger.cron)) {
      console.error('[scheduler] invalid cron for', wf.name, trigger.cron)
      return
    }
    const task = cron.schedule(trigger.cron, async () => {
      console.log('[scheduler] cron firing', wf.name, '@', new Date().toISOString())
      try { await runWorkflow(workflowId); persistLastRun(workflowId) }
      catch (err) { console.error('[scheduler] workflow run failed', wf.name, err) }
    })
    tasks.set(workflowId, task)
    console.log('[scheduler] scheduled cron', wf.name, '@', trigger.cron)
    return
  }

  if (trigger.type === 'fileWatch') {
    if (trigger.paths.length === 0) {
      console.error('[scheduler] fileWatch trigger has no paths for', wf.name)
      return
    }
    const allowedEvents = new Set<TriggerEvent>(trigger.events ?? ['add', 'change', 'unlink'])
    const debounceMs = trigger.debounceMs ?? 1000
    let pending: NodeJS.Timeout | null = null
    let lastReason = ''
    const fire = () => {
      pending = null
      console.log('[scheduler] fileWatch firing', wf.name, '— reason:', lastReason)
      runWorkflow(workflowId, lastReason)
        .then(() => persistLastRun(workflowId))
        .catch((err) => console.error('[scheduler] workflow run failed', wf.name, err))
    }
    const watcher = watch(trigger.paths, { ignoreInitial: true, persistent: true })
    for (const ev of ['add', 'change', 'unlink'] as TriggerEvent[]) {
      watcher.on(ev, (path: string) => {
        if (!allowedEvents.has(ev)) return
        lastReason = `${ev}: ${path}`
        if (pending) clearTimeout(pending)
        pending = setTimeout(fire, debounceMs)
      })
    }
    watcher.on('error', (err) => console.error('[scheduler] watcher error for', wf.name, err))
    watchers.set(workflowId, watcher)
    console.log('[scheduler] scheduled fileWatch', wf.name, '@', trigger.paths.join(', '))
    return
  }

  if (trigger.type === 'webhook') {
    webhookWorkflows.set(workflowId, trigger)
    console.log('[scheduler] registered webhook for', wf.name)
    return
  }
}

/**
 * Look up a webhook-registered workflow. Used by the AiosBridge HTTP server
 * to route POST /webhook/<workflowId> requests.
 */
export function getWebhookWorkflow(workflowId: string): { secret?: string } | null {
  return webhookWorkflows.get(workflowId) ?? null
}

/**
 * Fire a workflow run from a webhook with the request body as initial input.
 * Returns false if the workflow doesn't have an enabled webhook trigger.
 */
export async function fireWebhookWorkflow(workflowId: string, input: string): Promise<boolean> {
  const cfg = webhookWorkflows.get(workflowId)
  if (!cfg || !cfg.enabled) return false
  await runWorkflow(workflowId, input)
  persistLastRun(workflowId)
  return true
}

export function loadAllSchedules(): void {
  const all = db.select().from(workflows).all()
  for (const wf of all) {
    if (parseTrigger(wf.triggerConfig)) scheduleWorkflow(wf.id)
  }
  broadcastSchedulerUpdate()
}

export function reapplyWorkflowSchedule(workflowId: string): void {
  scheduleWorkflow(workflowId)
  broadcastSchedulerUpdate()
}

export function removeWorkflowSchedule(workflowId: string): void {
  unscheduleWorkflow(workflowId)
  broadcastSchedulerUpdate()
}

export function getActiveScheduleCount(): number {
  return tasks.size
}

