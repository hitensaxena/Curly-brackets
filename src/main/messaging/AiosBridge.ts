import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { agentMessages, agents, workflows } from '../db/schema'
import { runHeadless as runAgentHeadless } from '../agents/AgentManager'
import { runWorkflow, workflowEvents, getRunState } from '../workflows/WorkflowExecutor'
import { getWebhookWorkflow, fireWebhookWorkflow } from '../workflows/WorkflowScheduler'

let server: Server | null = null
let port = 0

function broadcastMessageNew(message: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('message:new', message)
  })
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://localhost')

  // GET /agents → [{ id, name, provider, model }]
  if (req.method === 'GET' && url.pathname === '/agents') {
    const rows = db.select({
      id: agents.id,
      name: agents.name,
      provider: agents.provider,
      model: agents.model,
      status: agents.status
    }).from(agents).all()
    return send(res, 200, rows)
  }

  // POST /messages/send  body: { fromAgentId, toAgentId, content, contentType?, priority? }
  if (req.method === 'POST' && url.pathname === '/messages/send') {
    const body = JSON.parse(await readBody(req))
    if (!body.toAgentId || typeof body.content !== 'string') {
      return send(res, 400, { error: 'toAgentId and content required' })
    }
    const message = {
      id: randomUUID(),
      fromAgentId: body.fromAgentId ?? null,
      toAgentId: body.toAgentId,
      workflowRunId: body.workflowRunId ?? null,
      contentType: body.contentType ?? 'text',
      content: body.content,
      priority: body.priority ?? 'normal',
      timestamp: Date.now(),
      read: 0
    }
    db.insert(agentMessages).values(message).run()
    broadcastMessageNew(message)
    return send(res, 200, { ok: true, id: message.id })
  }

  // GET /messages/inbox?agentId=X&limit=N → unread messages for agent
  if (req.method === 'GET' && url.pathname === '/messages/inbox') {
    const agentId = url.searchParams.get('agentId')
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)
    const onlyUnread = url.searchParams.get('unread') !== '0'
    if (!agentId) return send(res, 400, { error: 'agentId required' })

    let rows = db.select().from(agentMessages)
      .where(eq(agentMessages.toAgentId, agentId))
      .orderBy(desc(agentMessages.timestamp))
      .limit(limit)
      .all()
    if (onlyUnread) rows = rows.filter((m) => !m.read)
    return send(res, 200, rows)
  }

  // POST /webhook/:workflowId  body: arbitrary text/JSON, passed as initial input
  if (req.method === 'POST' && url.pathname.startsWith('/webhook/')) {
    const workflowId = url.pathname.slice('/webhook/'.length)
    const cfg = getWebhookWorkflow(workflowId)
    if (!cfg) return send(res, 404, { error: 'No webhook trigger registered for this workflow' })
    if (cfg.secret) {
      const provided = req.headers['x-webhook-secret']
      if (provided !== cfg.secret) return send(res, 401, { error: 'Bad secret' })
    }
    const body = await readBody(req)
    const fired = await fireWebhookWorkflow(workflowId, body)
    return send(res, fired ? 200 : 503, { ok: fired })
  }

  // GET /tools/workflows → [{ id, name, description }]
  if (req.method === 'GET' && url.pathname === '/tools/workflows') {
    const rows = db.select({
      id: workflows.id,
      name: workflows.name,
      description: workflows.description
    }).from(workflows).all()
    return send(res, 200, rows)
  }

  // POST /tools/invoke_agent  body: { agent_name, prompt, project_id? }
  if (req.method === 'POST' && url.pathname === '/tools/invoke_agent') {
    const body = JSON.parse(await readBody(req))
    const wanted = String(body.agent_name ?? '').trim()
    const prompt = String(body.prompt ?? '').trim()
    if (!wanted || !prompt) return send(res, 400, { error: 'agent_name and prompt required' })
    const all = db.select({ id: agents.id, name: agents.name }).from(agents).all()
    const match = all.find((a) => a.name.toLowerCase() === wanted.toLowerCase())
      ?? all.find((a) => a.name.toLowerCase().startsWith(wanted.toLowerCase()))
    if (!match) return send(res, 404, { error: `No agent matched "${wanted}"` })
    try {
      const result = await runAgentHeadless(match.id, prompt, undefined, body.project_id ?? null)
      return send(res, 200, {
        agent: match.name,
        content: result.content,
        cost_usd: result.costUsd,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens
      })
    } catch (err) {
      return send(res, 500, { error: String((err as Error)?.message || err) })
    }
  }

  // POST /tools/run_workflow  body: { workflow_name, input? }
  // Blocks until workflow completes (or 5min timeout) and returns leaf outputs.
  if (req.method === 'POST' && url.pathname === '/tools/run_workflow') {
    const body = JSON.parse(await readBody(req))
    const wanted = String(body.workflow_name ?? '').trim()
    if (!wanted) return send(res, 400, { error: 'workflow_name required' })
    const all = db.select({ id: workflows.id, name: workflows.name, definition: workflows.definition }).from(workflows).all()
    const match = all.find((w) => w.name.toLowerCase() === wanted.toLowerCase())
      ?? all.find((w) => w.name.toLowerCase().startsWith(wanted.toLowerCase()))
    if (!match) return send(res, 404, { error: `No workflow matched "${wanted}"` })
    try {
      const runId = await runWorkflow(match.id, body.input ? String(body.input) : undefined)
      // Wait (up to 5 minutes) for completion via the in-process event bus
      const completion = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const onComplete = (event: unknown): void => {
          const e = event as { runId: string; success: boolean; error?: string }
          if (e.runId !== runId) return
          workflowEvents.off('workflow:run:complete', onComplete)
          resolve({ success: e.success, error: e.error })
        }
        workflowEvents.on('workflow:run:complete', onComplete)
        setTimeout(() => {
          workflowEvents.off('workflow:run:complete', onComplete)
          resolve({ success: false, error: 'Workflow timed out after 5m' })
        }, 5 * 60 * 1000)
      })
      const state = await getRunState(runId)
      const def = JSON.parse(match.definition) as {
        nodes?: Array<{ id: string; agentId?: string }>
        edges?: Array<{ source: string; target: string }>
      }
      const sources = new Set((def.edges ?? []).map((e) => e.source))
      const leaves = (def.nodes ?? []).filter((n) => !sources.has(n.id))
      const outputs = leaves
        .map((n) => state?.stepStates[n.id]?.output)
        .filter(Boolean)
      return send(res, 200, {
        workflow: match.name,
        run_id: runId,
        success: completion.success,
        error: completion.error,
        outputs
      })
    } catch (err) {
      return send(res, 500, { error: String((err as Error)?.message || err) })
    }
  }

  // POST /messages/markRead  body: { ids: string[] }
  if (req.method === 'POST' && url.pathname === '/messages/markRead') {
    const body = JSON.parse(await readBody(req))
    const ids: string[] = Array.isArray(body.ids) ? body.ids : []
    for (const id of ids) {
      db.update(agentMessages).set({ read: 1 }).where(eq(agentMessages.id, id)).run()
    }
    return send(res, 200, { ok: true, marked: ids.length })
  }

  send(res, 404, { error: 'not found' })
}

export async function startAiosBridge(): Promise<{ port: number }> {
  if (server) return { port }
  server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      send(res, 500, { error: String(err?.message || err) })
    })
  })
  await new Promise<void>((resolve) => {
    // Bind to localhost only — never expose this to the network
    server!.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address()
  if (addr && typeof addr === 'object') port = addr.port
  return { port }
}

export function getAiosBridgePort(): number {
  return port
}

export function stopAiosBridge(): void {
  if (server) {
    server.close()
    server = null
    port = 0
  }
}
