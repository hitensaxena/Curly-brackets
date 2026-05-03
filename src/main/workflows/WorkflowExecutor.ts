import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { BrowserWindow } from 'electron'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { workflows, workflowRuns } from '../db/schema'
import { runHeadless, getAgent } from '../agents/AgentManager'
import {
  Workflow,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdgeDef,
  EdgeCondition,
  OutputNodeConfig,
  StepState,
  StepStates,
  RunStatus
} from '@shared/types'

async function dispatchOutput(cfg: OutputNodeConfig, body: string): Promise<void> {
  switch (cfg.kind) {
    case 'slack': {
      // Slack incoming-webhook: { text: ... }
      const res = await fetch(cfg.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          ...(cfg.meta?.channel ? { channel: cfg.meta.channel } : {}),
          ...(cfg.meta?.username ? { username: cfg.meta.username } : {})
        })
      })
      if (!res.ok) throw new Error(`Slack webhook ${res.status}: ${await res.text()}`)
      return
    }
    case 'discord': {
      // Discord incoming-webhook: { content: ... } (max 2000 chars per message)
      const trimmed = body.length > 1900 ? body.slice(0, 1900) + '\n…[truncated]' : body
      const res = await fetch(cfg.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          ...(cfg.meta?.username ? { username: cfg.meta.username } : {})
        })
      })
      if (!res.ok) throw new Error(`Discord webhook ${res.status}: ${await res.text()}`)
      return
    }
    case 'webhook': {
      // Generic POST — sends raw body as text. JSON if Content-Type override given via meta.
      const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
      if (cfg.meta?.contentType) headers['Content-Type'] = cfg.meta.contentType
      if (cfg.meta?.bearer) headers['Authorization'] = `Bearer ${cfg.meta.bearer}`
      const res = await fetch(cfg.target, { method: 'POST', headers, body })
      if (!res.ok) throw new Error(`Webhook ${res.status}: ${await res.text()}`)
      return
    }
    case 'file': {
      mkdirSync(dirname(cfg.target), { recursive: true })
      writeFileSync(cfg.target, body, 'utf-8')
      return
    }
    default:
      throw new Error(`Unknown output kind: ${(cfg as { kind: string }).kind}`)
  }
}

/**
 * Evaluate an edge's condition against the source node's output.
 * No condition (or mode === 'always') always passes.
 */
function evaluateEdgeCondition(condition: EdgeCondition | undefined, output: string): boolean {
  if (!condition || condition.mode === 'always') return true
  const flags = condition.caseSensitive ? '' : 'i'
  const haystack = condition.caseSensitive ? output : output.toLowerCase()
  const needle = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
  switch (condition.mode) {
    case 'contains':
      return haystack.includes(needle)
    case 'not_contains':
      return !haystack.includes(needle)
    case 'starts_with':
      return haystack.trimStart().startsWith(needle)
    case 'matches':
      try {
        return new RegExp(condition.value, flags).test(output)
      } catch {
        return false
      }
    default:
      return true
  }
}

/**
 * In-process event bus for main-process consumers (e.g. ChatManager `/run`).
 * Mirrors the IPC events that go to the renderer.
 */
export const workflowEvents = new EventEmitter()

function broadcastToAll(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
  // Also emit on the in-process bus so main-process listeners (e.g. chat) can react.
  workflowEvents.emit(channel, payload)
}

/**
 * In-memory map of pending approval requests.
 * Each entry holds a resolver that the executor awaits, and is settled by
 * `resolveApproval(runId, stepId, decision)` from the IPC handler.
 */
const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void; nodeId: string; runId: string }>()

function approvalKey(runId: string, stepId: string): string {
  return `${runId}::${stepId}`
}

export function resolveApproval(runId: string, stepId: string, approved: boolean): boolean {
  const entry = pendingApprovals.get(approvalKey(runId, stepId))
  if (!entry) return false
  entry.resolve(approved)
  pendingApprovals.delete(approvalKey(runId, stepId))
  return true
}

function topologicalSort(def: WorkflowDefinition): WorkflowNode[] | null {
  const indegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  for (const n of def.nodes) {
    indegree[n.id] = 0
    adj[n.id] = []
  }
  for (const e of def.edges) {
    if (!(e.target in indegree) || !(e.source in adj)) continue
    indegree[e.target] = (indegree[e.target] || 0) + 1
    adj[e.source].push(e.target)
  }

  const queue: string[] = Object.keys(indegree).filter((id) => indegree[id] === 0)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj[id]) {
      indegree[next]--
      if (indegree[next] === 0) queue.push(next)
    }
  }

  if (order.length !== def.nodes.length) return null // cycle
  const byId = new Map(def.nodes.map((n) => [n.id, n]))
  return order.map((id) => byId.get(id)!).filter(Boolean)
}

function renderTemplate(template: string, input: string): string {
  return template.replace(/\{\{\s*input\s*\}\}/g, input)
}

function persistRun(runId: string, status: RunStatus, stepStates: StepStates, completed = false): void {
  const patch: Record<string, unknown> = {
    status,
    stepStates: JSON.stringify(stepStates)
  }
  if (completed) patch.completedAt = Date.now()
  db.update(workflowRuns).set(patch).where(eq(workflowRuns.id, runId)).run()
}

export async function runWorkflow(workflowId: string, initialInput?: string): Promise<string> {
  const wf = db.select().from(workflows).where(eq(workflows.id, workflowId)).get() as Workflow | undefined
  if (!wf) throw new Error(`Workflow ${workflowId} not found`)

  let def: WorkflowDefinition
  try {
    def = JSON.parse(wf.definition)
  } catch {
    throw new Error('Workflow definition is not valid JSON')
  }
  if (!def.nodes?.length) throw new Error('Workflow has no nodes')

  const ordered = topologicalSort(def)
  if (!ordered) throw new Error('Workflow contains a cycle')

  const runId = randomUUID()
  const stepStates: StepStates = {}
  for (const n of def.nodes) stepStates[n.id] = { status: 'pending' }

  db.insert(workflowRuns).values({
    id: runId,
    workflowId,
    status: 'running',
    stepStates: JSON.stringify(stepStates),
    startedAt: Date.now(),
    triggeredBy: 'manual'
  }).run()

  broadcastToAll('workflow:run:started', { runId, workflowId, stepStates })

  // Run in background — return runId immediately
  void executeParallel(runId, def, stepStates, wf.projectId ?? null, initialInput ?? '', wf.perRunBudgetUsd).catch((err) => {
    persistRun(runId, 'failed', stepStates, true)
    broadcastToAll('workflow:run:complete', { runId, success: false, error: String(err?.message || err) })
  })

  return runId
}

async function runOneStep(
  runId: string,
  node: WorkflowNode,
  liveParentIds: string[],
  stepStates: StepStates,
  projectId: string | null,
  rootInput: string
): Promise<boolean> {
  // Compute the input the same way for both agent and approval nodes
  const input = liveParentIds.length === 0
    ? rootInput
    : liveParentIds
        .map((pid) => stepStates[pid]?.output ?? '')
        .filter(Boolean)
        .join('\n\n---\n\n')

  // Output node: ship the input to an external destination (Slack, Discord, webhook, file)
  if (node.nodeType === 'output') {
    const startedAt = Date.now()
    const cfg = node.outputConfig
    if (!cfg || !cfg.target) {
      stepStates[node.id] = {
        status: 'failed',
        error: 'Output node missing target',
        startedAt,
        endedAt: Date.now()
      }
      broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
      return false
    }
    const body = renderTemplate(cfg.template ?? '{{input}}', input)
    stepStates[node.id] = { status: 'running', startedAt }
    broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
    try {
      await dispatchOutput(cfg, body)
      stepStates[node.id] = {
        status: 'done',
        output: `${cfg.kind} → ${cfg.target}\n\n${body.slice(0, 400)}${body.length > 400 ? '…' : ''}`,
        startedAt,
        endedAt: Date.now()
      }
      broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
      return true
    } catch (err) {
      stepStates[node.id] = {
        status: 'failed',
        error: `Output dispatch failed: ${(err as Error).message ?? err}`,
        startedAt,
        endedAt: Date.now()
      }
      broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
      return false
    }
  }

  // Approval node: pause the workflow and wait for human decision
  if (node.nodeType === 'approval') {
    const startedAt = Date.now()
    const message = renderTemplate(node.approvalMessage ?? 'Approve to proceed:\n\n{{input}}', input)
    stepStates[node.id] = { status: 'awaiting_approval', startedAt, output: message }
    broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })

    const approved = await new Promise<boolean>((resolve) => {
      pendingApprovals.set(approvalKey(runId, node.id), { resolve, nodeId: node.id, runId })
    })

    stepStates[node.id] = {
      status: approved ? 'done' : 'rejected',
      output: input, // pass-through input downstream
      startedAt,
      endedAt: Date.now()
    }
    broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
    return approved
  }

  const agent = await getAgent(node.agentId)
  if (!agent) {
    stepStates[node.id] = {
      status: 'failed',
      error: `Agent ${node.agentId} not found`,
      endedAt: Date.now()
    }
    broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
    return false
  }
  const prompt = renderTemplate(node.promptTemplate, input)

  const startedAt = Date.now()
  const startState: StepState = { status: 'running', startedAt }
  stepStates[node.id] = startState
  broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: startState })

  try {
    const result = await runHeadless(node.agentId, prompt, runId, projectId)
    stepStates[node.id] = {
      status: 'done',
      output: result.content,
      costUsd: result.costUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      startedAt,
      endedAt: Date.now()
    }
    broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
    return true
  } catch (err) {
    stepStates[node.id] = {
      status: 'failed',
      error: String((err as Error)?.message || err),
      startedAt,
      endedAt: Date.now()
    }
    broadcastToAll('workflow:step:update', { runId, stepId: node.id, state: stepStates[node.id] })
    return false
  }
}

function totalRunCost(stepStates: StepStates): number {
  return Object.values(stepStates).reduce((s, st) => s + (st.costUsd ?? 0), 0)
}

function checkRunBudget(
  budget: number | null | undefined,
  stepStates: StepStates
): { exceeded: boolean; spent: number } {
  if (!budget || budget <= 0) return { exceeded: false, spent: 0 }
  const spent = totalRunCost(stepStates)
  return { exceeded: spent >= budget, spent }
}

async function executeParallel(
  runId: string,
  def: WorkflowDefinition,
  stepStates: StepStates,
  projectId: string | null,
  rootInput: string,
  perRunBudgetUsd?: number | null
): Promise<void> {
  // Build parent + children maps, indegree, and an edge lookup keyed by source
  const childrenEdges: Record<string, WorkflowEdgeDef[]> = {}
  const indegree: Record<string, number> = {}
  const liveParents: Record<string, string[]> = {}
  const byId = new Map(def.nodes.map((n) => [n.id, n]))
  for (const n of def.nodes) {
    childrenEdges[n.id] = []
    indegree[n.id] = 0
    liveParents[n.id] = []
  }
  for (const e of def.edges) {
    if (!(e.source in childrenEdges) || !(e.target in indegree)) continue
    childrenEdges[e.source].push(e)
    indegree[e.target]++
  }

  // Roots have no incoming edges and are immediately ready
  let ready = Object.keys(indegree).filter((id) => indegree[id] === 0)

  while (ready.length > 0) {
    // Run this layer in parallel
    const results = await Promise.all(
      ready.map((id) => runOneStep(runId, byId.get(id)!, liveParents[id], stepStates, projectId, rootInput))
    )

    // If any node in this layer failed, abort the whole run
    if (results.some((ok) => !ok)) {
      const failedId = ready[results.findIndex((ok) => !ok)]
      const error = stepStates[failedId]?.error ?? 'unknown error'
      persistRun(runId, 'failed', stepStates, true)
      broadcastToAll('workflow:run:complete', { runId, success: false, error })
      return
    }

    // Per-run budget gate: if the cumulative cost has exceeded the cap, abort
    const budget = checkRunBudget(perRunBudgetUsd, stepStates)
    if (budget.exceeded) {
      const error = `Workflow per-run budget exceeded: $${budget.spent.toFixed(4)} of $${perRunBudgetUsd!.toFixed(2)} cap`
      persistRun(runId, 'failed', stepStates, true)
      broadcastToAll('workflow:budget:exceeded', { runId, spent: budget.spent, cap: perRunBudgetUsd })
      broadcastToAll('workflow:run:complete', { runId, success: false, error })
      return
    }

    // Resolve outgoing edges: each edge either fires (passes condition) or is skipped.
    // Either way it counts as "satisfied" for indegree, but only firing edges
    // contribute the source to the child's liveParents.
    const next: string[] = []
    const skipQueue: string[] = []
    for (const id of ready) {
      const output = stepStates[id]?.output ?? ''
      for (const edge of childrenEdges[id]) {
        const fires = evaluateEdgeCondition(edge.condition, output)
        if (fires) liveParents[edge.target].push(id)
        indegree[edge.target]--
        if (indegree[edge.target] === 0) {
          if (liveParents[edge.target].length === 0) {
            // No parent edges fired → child is skipped
            skipQueue.push(edge.target)
          } else {
            next.push(edge.target)
          }
        }
      }
    }

    // Cascade skipped nodes: their outgoing edges all fail (no output to test)
    while (skipQueue.length > 0) {
      const id = skipQueue.shift()!
      stepStates[id] = { status: 'skipped', endedAt: Date.now() }
      broadcastToAll('workflow:step:update', { runId, stepId: id, state: stepStates[id] })
      for (const edge of childrenEdges[id]) {
        indegree[edge.target]--
        if (indegree[edge.target] === 0) {
          if (liveParents[edge.target].length === 0) skipQueue.push(edge.target)
          else next.push(edge.target)
        }
      }
    }

    persistRun(runId, 'running', stepStates)
    ready = next
  }

  persistRun(runId, 'completed', stepStates, true)
  broadcastToAll('workflow:run:complete', { runId, success: true })
}

/**
 * Re-execute a workflow starting from `fromStepId`. The chosen step and all
 * its transitive descendants are reset to `pending`; upstream done steps keep
 * their outputs and feed them to the resumed branch.
 */
export async function resumeWorkflow(runId: string, fromStepId: string, initialInput?: string): Promise<void> {
  const run = db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get()
  if (!run) throw new Error(`Run ${runId} not found`)

  const wf = db.select().from(workflows).where(eq(workflows.id, run.workflowId)).get() as Workflow | undefined
  if (!wf) throw new Error(`Workflow ${run.workflowId} not found`)

  const def: WorkflowDefinition = JSON.parse(wf.definition)
  if (!def.nodes.find((n) => n.id === fromStepId)) {
    throw new Error(`Step ${fromStepId} not found in workflow definition`)
  }

  // Compute to-run set: fromStepId + transitive descendants
  const childrenMap: Record<string, string[]> = {}
  for (const n of def.nodes) childrenMap[n.id] = []
  for (const e of def.edges) {
    if (childrenMap[e.source]) childrenMap[e.source].push(e.target)
  }
  const toRun = new Set<string>()
  const stack = [fromStepId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (toRun.has(id)) continue
    toRun.add(id)
    for (const child of childrenMap[id] ?? []) stack.push(child)
  }

  // Load existing state, reset to-run nodes
  const stepStates: StepStates = run.stepStates ? JSON.parse(run.stepStates) : {}
  for (const id of toRun) stepStates[id] = { status: 'pending' }
  for (const n of def.nodes) {
    if (!stepStates[n.id]) stepStates[n.id] = { status: 'pending' }
  }

  // Persist the reset and notify listeners
  db.update(workflowRuns).set({
    status: 'running',
    stepStates: JSON.stringify(stepStates),
    completedAt: null
  }).where(eq(workflowRuns.id, runId)).run()
  broadcastToAll('workflow:run:started', { runId, workflowId: run.workflowId, stepStates, resumed: true })
  for (const id of toRun) {
    broadcastToAll('workflow:step:update', { runId, stepId: id, state: stepStates[id] })
  }

  // Run with the pre-seeded done state for upstream nodes
  void executeResume(runId, def, stepStates, toRun, wf.projectId ?? null, initialInput ?? '', wf.perRunBudgetUsd).catch((err) => {
    persistRun(runId, 'failed', stepStates, true)
    broadcastToAll('workflow:run:complete', { runId, success: false, error: String(err?.message || err) })
  })
}

async function executeResume(
  runId: string,
  def: WorkflowDefinition,
  stepStates: StepStates,
  toRun: Set<string>,
  projectId: string | null,
  rootInput: string,
  perRunBudgetUsd?: number | null
): Promise<void> {
  const childrenEdges: Record<string, WorkflowEdgeDef[]> = {}
  const indegree: Record<string, number> = {}
  const liveParents: Record<string, string[]> = {}
  const byId = new Map(def.nodes.map((n) => [n.id, n]))
  for (const n of def.nodes) {
    childrenEdges[n.id] = []
    indegree[n.id] = 0
    liveParents[n.id] = []
  }
  for (const e of def.edges) {
    if (!toRun.has(e.target)) continue // skip edges to nodes we don't intend to re-run
    childrenEdges[e.source].push(e)
    if (toRun.has(e.source)) {
      // both endpoints will run in this resume
      indegree[e.target]++
    } else {
      // upstream parent already done; pre-evaluate its edge condition
      const out = stepStates[e.source]?.output ?? ''
      if (evaluateEdgeCondition(e.condition, out)) {
        liveParents[e.target].push(e.source)
      }
    }
  }

  let ready = Array.from(toRun).filter((id) => indegree[id] === 0)

  while (ready.length > 0) {
    const results = await Promise.all(
      ready.map((id) => runOneStep(runId, byId.get(id)!, liveParents[id], stepStates, projectId, rootInput))
    )
    if (results.some((ok) => !ok)) {
      const failedId = ready[results.findIndex((ok) => !ok)]
      const error = stepStates[failedId]?.error ?? 'unknown error'
      persistRun(runId, 'failed', stepStates, true)
      broadcastToAll('workflow:run:complete', { runId, success: false, error })
      return
    }
    const budget = checkRunBudget(perRunBudgetUsd, stepStates)
    if (budget.exceeded) {
      const error = `Workflow per-run budget exceeded: $${budget.spent.toFixed(4)} of $${perRunBudgetUsd!.toFixed(2)} cap`
      persistRun(runId, 'failed', stepStates, true)
      broadcastToAll('workflow:budget:exceeded', { runId, spent: budget.spent, cap: perRunBudgetUsd })
      broadcastToAll('workflow:run:complete', { runId, success: false, error })
      return
    }
    const next: string[] = []
    const skipQueue: string[] = []
    for (const id of ready) {
      const output = stepStates[id]?.output ?? ''
      for (const edge of childrenEdges[id]) {
        if (!toRun.has(edge.target)) continue
        const fires = evaluateEdgeCondition(edge.condition, output)
        if (fires) liveParents[edge.target].push(id)
        indegree[edge.target]--
        if (indegree[edge.target] === 0) {
          if (liveParents[edge.target].length === 0) skipQueue.push(edge.target)
          else next.push(edge.target)
        }
      }
    }
    while (skipQueue.length > 0) {
      const id = skipQueue.shift()!
      stepStates[id] = { status: 'skipped', endedAt: Date.now() }
      broadcastToAll('workflow:step:update', { runId, stepId: id, state: stepStates[id] })
      for (const edge of childrenEdges[id]) {
        if (!toRun.has(edge.target)) continue
        indegree[edge.target]--
        if (indegree[edge.target] === 0) {
          if (liveParents[edge.target].length === 0) skipQueue.push(edge.target)
          else next.push(edge.target)
        }
      }
    }
    persistRun(runId, 'running', stepStates)
    ready = next
  }

  persistRun(runId, 'completed', stepStates, true)
  broadcastToAll('workflow:run:complete', { runId, success: true })
}

export async function getRunState(runId: string): Promise<{ status: RunStatus; stepStates: StepStates } | null> {
  const row = db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get()
  if (!row) return null
  return {
    status: row.status as RunStatus,
    stepStates: row.stepStates ? JSON.parse(row.stepStates) : {}
  }
}
