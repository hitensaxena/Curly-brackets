/**
 * Source for the `aios` CLI binary. Written verbatim to `userData/bin/aios`
 * at app startup so spawned PTY sessions can shell out to it.
 *
 * The script is plain Node — no dependencies — and uses fetch (Node 18+)
 * to talk to the AiosBridge HTTP server in the main process.
 */
export const AIOS_CLI_SOURCE = `#!/usr/bin/env node
const PORT = process.env.AIOS_BRIDGE_PORT
const ME = process.env.AIOS_AGENT_ID || null

if (!PORT) {
  console.error('AIOS_BRIDGE_PORT not set — this CLI is meant to run inside an aios PTY session.')
  process.exit(1)
}

const BASE = 'http://127.0.0.1:' + PORT

async function api(path, opts) {
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error('aios bridge ' + res.status + ': ' + text)
  }
  return res.json()
}

function usage() {
  console.log(\`aios — talk to other agents from inside a session.

USAGE
  aios whoami                       Show your agent id and name
  aios agents                       List all known agents
  aios send <to-agent> <text...>    Send a message to another agent
  aios inbox [--all] [-n N]         Read your inbox (default: unread, latest 20)

ENVIRONMENT
  AIOS_AGENT_ID    your agent id (auto-set by the host app)
  AIOS_BRIDGE_PORT bridge port    (auto-set by the host app)
\`)
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)

  if (!cmd || cmd === '-h' || cmd === '--help') return usage()

  if (cmd === 'whoami') {
    if (!ME) { console.log('(no AIOS_AGENT_ID set)'); return }
    const list = await api('/agents')
    const me = list.find((a) => a.id === ME)
    console.log(me ? me.name + ' (' + me.id + ')' : ME)
    return
  }

  if (cmd === 'agents') {
    const list = await api('/agents')
    for (const a of list) {
      const marker = a.id === ME ? ' (me)' : ''
      console.log(a.id + '  ' + a.name.padEnd(24) + ' ' + a.provider + '/' + a.model + marker)
    }
    return
  }

  if (cmd === 'send') {
    const to = args[0]
    const text = args.slice(1).join(' ')
    if (!to || !text) {
      console.error('usage: aios send <to-agent> <text...>')
      process.exit(2)
    }
    // Resolve "to" against agent ids first, then by name (case-insensitive prefix)
    const list = await api('/agents')
    let target = list.find((a) => a.id === to)
    if (!target) {
      const lower = to.toLowerCase()
      target = list.find((a) => a.name.toLowerCase() === lower)
        ?? list.find((a) => a.name.toLowerCase().startsWith(lower))
    }
    if (!target) {
      console.error('No agent matched "' + to + '". Try \`aios agents\` to list them.')
      process.exit(3)
    }
    const out = await api('/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAgentId: ME, toAgentId: target.id, content: text })
    })
    console.log('sent ' + out.id + ' → ' + target.name)
    return
  }

  if (cmd === 'inbox') {
    if (!ME) { console.error('AIOS_AGENT_ID not set; cannot read inbox.'); process.exit(1) }
    const limit = args.includes('-n')
      ? parseInt(args[args.indexOf('-n') + 1] || '20', 10)
      : 20
    const onlyUnread = !args.includes('--all')
    const list = await api('/agents')
    const nameFor = (id) => list.find((a) => a.id === id)?.name || id || 'user'
    const messages = await api('/messages/inbox?agentId=' + ME + '&limit=' + limit + '&unread=' + (onlyUnread ? '1' : '0'))
    if (messages.length === 0) {
      console.log(onlyUnread ? '(inbox empty — no unread)' : '(inbox empty)')
      return
    }
    for (const m of messages) {
      const when = new Date(m.timestamp).toLocaleString()
      const dot = m.read ? '  ' : '* '
      console.log(dot + when + '  ' + nameFor(m.fromAgentId) + ' → me')
      console.log('    ' + m.content.replace(/\\n/g, '\\n    '))
    }
    if (onlyUnread && messages.length > 0) {
      // Mark them as read after reading
      await api('/messages/markRead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: messages.map((m) => m.id) })
      })
    }
    return
  }

  console.error('Unknown command: ' + cmd)
  usage()
  process.exit(2)
}

main().catch((err) => {
  console.error('aios: ' + (err?.message || err))
  process.exit(1)
})
`
