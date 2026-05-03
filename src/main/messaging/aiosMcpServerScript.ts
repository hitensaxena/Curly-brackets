/**
 * Minimal MCP (Model Context Protocol) server, written verbatim to
 * `userData/bin/aios-mcp.js` at app startup. Spawned by Claude CLI when the
 * chat passes `--mcp-config`. Exposes tools that delegate to the AiosBridge
 * HTTP server in the main process.
 *
 * No external deps — implements line-delimited JSON-RPC over stdio by hand.
 */
export const AIOS_MCP_SERVER_SOURCE = `#!/usr/bin/env node
const PORT = process.env.AIOS_BRIDGE_PORT
if (!PORT) {
  process.stderr.write('AIOS_BRIDGE_PORT not set; aios-mcp cannot start.\\n')
  process.exit(1)
}
const BASE = 'http://127.0.0.1:' + PORT

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n')
}
function reply(id, result) { send({ jsonrpc: '2.0', id, result }) }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }) }

const TOOLS = [
  {
    name: 'invoke_agent',
    description: 'Invoke a configured AI OS agent with a prompt. The agent runs headless using its own system prompt and tools, then returns the response. Use this to delegate sub-tasks to specialised agents (e.g. a code reviewer, researcher, or writer).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: { type: 'string', description: 'Exact agent name (or unique prefix). Use list_agents to see options.' },
        prompt: { type: 'string', description: 'The prompt to send to the agent.' }
      },
      required: ['agent_name', 'prompt']
    }
  },
  {
    name: 'run_workflow',
    description: 'Trigger a configured AI OS workflow by name. Blocks until the workflow completes and returns the leaf-node outputs. Use this to run pre-built multi-step pipelines.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_name: { type: 'string', description: 'Exact workflow name (or unique prefix). Use list_workflows to see options.' },
        input: { type: 'string', description: 'Optional initial input passed as {{input}} to root nodes.' }
      },
      required: ['workflow_name']
    }
  },
  {
    name: 'list_agents',
    description: 'List all configured AI OS agents. Returns id, name, provider, model, and current status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_workflows',
    description: 'List all configured AI OS workflows. Returns id, name, and description.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
]

async function callTool(name, args) {
  const headers = { 'Content-Type': 'application/json' }
  if (name === 'list_agents') {
    const res = await fetch(BASE + '/agents')
    if (!res.ok) throw new Error('list_agents: ' + res.status)
    return await res.json()
  }
  if (name === 'list_workflows') {
    const res = await fetch(BASE + '/tools/workflows')
    if (!res.ok) throw new Error('list_workflows: ' + res.status)
    return await res.json()
  }
  if (name === 'invoke_agent') {
    const res = await fetch(BASE + '/tools/invoke_agent', {
      method: 'POST', headers, body: JSON.stringify(args)
    })
    if (!res.ok) throw new Error('invoke_agent: ' + (await res.text()))
    return await res.json()
  }
  if (name === 'run_workflow') {
    const res = await fetch(BASE + '/tools/run_workflow', {
      method: 'POST', headers, body: JSON.stringify(args)
    })
    if (!res.ok) throw new Error('run_workflow: ' + (await res.text()))
    return await res.json()
  }
  throw new Error('Unknown tool: ' + name)
}

async function handle(req) {
  const id = req.id
  const method = req.method
  try {
    if (method === 'initialize') {
      return reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'aios', version: '0.1.0' }
      })
    }
    if (method === 'notifications/initialized') {
      return // notification — no reply
    }
    if (method === 'tools/list') {
      return reply(id, { tools: TOOLS })
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = req.params || {}
      const result = await callTool(name, args || {})
      return reply(id, {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
      })
    }
    if (method === 'resources/list' || method === 'prompts/list') {
      // We don't expose any — return empty so clients don't error.
      return reply(id, { [method.split('/')[0]]: [] })
    }
    if (id != null) {
      return replyError(id, -32601, 'Method not found: ' + method)
    }
  } catch (err) {
    if (id != null) {
      return replyError(id, -32603, String(err && err.message || err))
    }
  }
}

let buf = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      handle(msg)
    } catch (err) {
      process.stderr.write('aios-mcp parse error: ' + (err && err.message || err) + '\\n')
    }
  }
})
process.stdin.on('end', () => process.exit(0))
`
