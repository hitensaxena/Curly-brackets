import { useEffect, useState, Component, ReactNode, ErrorInfo } from 'react'
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { CLIHealth } from '@shared/types'
import { useAppStore } from '../stores/appStore'
import { Button } from '../components/ui/button'
import { SourcesManager } from '../components/knowledge/SourcesManager'

class SectionErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[settings] ${this.props.name} crashed:`, error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-xs text-red-300 font-medium mb-1">{this.props.name} crashed</p>
          <pre className="text-[11px] text-red-200/80 font-mono whitespace-pre-wrap">{String(this.state.error?.message ?? this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']
const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash']

export function Settings() {
  return (
    <SectionErrorBoundary name="Settings page">
      <SettingsInner />
    </SectionErrorBoundary>
  )
}

function SettingsInner() {
  const { cliHealth, setCliHealth } = useAppStore()
  const [checking, setChecking] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})

  const checkHealth = async () => {
    setChecking(true)
    const health = await window.api.cli.health()
    setCliHealth(health)
    setChecking(false)
  }

  useEffect(() => { checkHealth() }, [])
  useEffect(() => { window.api.settings.all().then(setSettings) }, [])

  const update = async (key: string, value: string) => {
    await window.api.settings.set(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const claudeModel = settings.defaultClaudeModel ?? 'claude-sonnet-4-6'
  const geminiModel = settings.defaultGeminiModel ?? 'gemini-2.5-pro'
  const notifications = settings.notificationsEnabled !== '0'

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Configure Curly Brackets</p>
      </div>

      <div className="max-w-xl space-y-6">
        {/* CLI Configuration */}
        <Section title="CLI Configuration">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">Check CLI availability</span>
            <Button size="sm" variant="outline" onClick={checkHealth} disabled={checking}>
              <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking...' : 'Refresh'}
            </Button>
          </div>

          {cliHealth && (
            <div className="space-y-3">
              <CLIRow name="Claude Code CLI" info={cliHealth.claude} />
              <CLIRow name="Gemini CLI" info={cliHealth.gemini} />
            </div>
          )}
        </Section>

        {/* Model Defaults */}
        <Section title="Model Defaults">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300">Default Claude Model</p>
                <p className="text-xs text-slate-500">Used when creating new Claude agents</p>
              </div>
              <select
                value={claudeModel}
                onChange={(e) => update('defaultClaudeModel', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
              >
                {CLAUDE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300">Default Gemini Model</p>
                <p className="text-xs text-slate-500">Used when creating new Gemini agents</p>
              </div>
              <select
                value={geminiModel}
                onChange={(e) => update('defaultGeminiModel', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
              >
                {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* Knowledge & Memory */}
        <SectionErrorBoundary name="Knowledge & Memory">
          <KnowledgeSection settings={settings} update={update} />
        </SectionErrorBoundary>

        {/* Conversation auto-save */}
        <SectionErrorBoundary name="Chat Persistence">
          <ChatPersistenceSection settings={settings} update={update} />
        </SectionErrorBoundary>

        {/* Notifications */}
        <Section title="Notifications">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Show toast notifications</p>
              <p className="text-xs text-slate-500">For workflow completions, approval requests, and incoming messages</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => update('notificationsEnabled', e.target.checked ? '1' : '0')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          </div>
        </Section>

        {/* App Info */}
        <Section title="About">
          <div className="space-y-2">
            <InfoRow label="App" value="Curly Brackets" />
            <InfoRow label="Version" value="0.1.0 (Phase 1)" />
            <InfoRow label="Node.js" value={window.electron?.process?.versions?.node || 'N/A'} />
            <InfoRow label="Electron" value={window.electron?.process?.versions?.electron || 'N/A'} />
            <InfoRow label="Chrome" value={window.electron?.process?.versions?.chrome || 'N/A'} />
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/2 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-medium text-slate-300">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function CLIRow({ name, info }: { name: string; info: CLIHealth['claude'] }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-white/3 border border-white/5">
      {info.available
        ? <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
        : <XCircle size={14} className="text-red-400 flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300">{name}</p>
        <p className="text-xs text-slate-600 font-mono truncate">{info.path}</p>
      </div>
      {info.version && <span className="text-xs text-slate-500">{info.version}</span>}
    </div>
  )
}

function ChatPersistenceSection({
  settings,
  update
}: {
  settings: Record<string, string>
  update: (key: string, value: string) => Promise<void>
}) {
  const enabled = settings.autoSaveConversations === '1'
  const saveDir = settings.conversationsSaveDir ?? ''

  const pickDir = async () => {
    const path = await window.api.dialog.pickDirectory({ title: 'Select folder for saved conversations' })
    if (path) await update('conversationsSaveDir', path)
  }

  return (
    <Section title="Chat Persistence">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Auto-save conversations to vault</p>
            <p className="text-xs text-slate-500">Saves to <code className="font-mono">{'<vault>/Conversations/YYYY-MM/<title>.md'}</code> after each turn</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => update('autoSaveConversations', e.target.checked ? '1' : '0')}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Save folder (optional override)</p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] text-slate-400 font-mono bg-white/5 border border-white/10 rounded px-2 py-1.5 flex-1 truncate">
              {saveDir || 'Default: first global Obsidian source / Conversations'}
            </code>
            <Button size="sm" variant="outline" onClick={pickDir}>Pick…</Button>
            {saveDir && <Button size="sm" variant="outline" onClick={() => update('conversationsSaveDir', '')}>Clear</Button>}
          </div>
        </div>
      </div>
    </Section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-300 font-mono">{value}</span>
    </div>
  )
}

function KnowledgeSection({
  settings,
  update
}: {
  settings: Record<string, string>
  update: (key: string, value: string) => Promise<void>
}) {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [bridgeMissing, setBridgeMissing] = useState(false)

  useEffect(() => {
    if (!window.api.knowledge) setBridgeMissing(true)
  }, [])

  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    await update('openaiApiKey', apiKeyInput.trim())
    setApiKeyInput('')
    setShowApiKey(false)
  }

  const apiKeyMasked = settings.openaiApiKey
    ? settings.openaiApiKey.slice(0, 7) + '...' + settings.openaiApiKey.slice(-4)
    : null

  if (bridgeMissing) {
    return (
      <Section title="Knowledge & Memory">
        <p className="text-xs text-amber-400">
          Knowledge bridge not loaded. Restart the dev server (<code className="font-mono">npm run dev</code>) — main + preload don't hot-reload.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Knowledge & Memory">
      <div className="space-y-5">
        {/* OpenAI API key */}
        <div>
          <p className="text-sm text-slate-300 mb-1">OpenAI API key</p>
          <p className="text-xs text-slate-500 mb-2">Used for embeddings (text-embedding-3-small)</p>
          {apiKeyMasked && !showApiKey ? (
            <div className="flex items-center gap-2">
              <code className="text-xs text-slate-400 font-mono bg-white/5 border border-white/10 rounded px-2 py-1 flex-1">
                {apiKeyMasked}
              </code>
              <Button size="sm" variant="outline" onClick={() => setShowApiKey(true)}>Change</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
              />
              <Button size="sm" onClick={saveApiKey} disabled={!apiKeyInput.trim()}>Save</Button>
              {apiKeyMasked && (
                <Button size="sm" variant="outline" onClick={() => { setShowApiKey(false); setApiKeyInput('') }}>
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Global sources */}
        <div>
          <p className="text-sm text-slate-300 mb-1">Global knowledge sources</p>
          <p className="text-xs text-slate-500 mb-2">
            Available in every conversation. Add per-project sources from each project's detail page.
          </p>
          <SourcesManager scope="global" />
        </div>
      </div>
    </Section>
  )
}
