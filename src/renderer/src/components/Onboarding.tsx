import { useEffect, useState } from 'react'
import { Sparkles, Key, BookOpen, Bot, ArrowRight, Check, X, FolderOpen } from 'lucide-react'
import { Button } from './ui/button'
import { useAgentStore } from '../stores/agentStore'

const SETTING_KEY = 'onboardingComplete'

type Step = 'welcome' | 'apiKey' | 'vault' | 'agent' | 'done'

export function Onboarding() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<Step>('welcome')

  // Decide whether to show on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const settings = await window.api.settings.all()
        const agents = await window.api.agents.list()
        if (cancelled) return
        if (settings[SETTING_KEY] !== '1' && agents.length === 0) setShow(true)
      } catch (err) {
        console.error('[onboarding] init failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const finish = async () => {
    try { await window.api.settings.set(SETTING_KEY, '1') }
    catch { /* best-effort */ }
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl shadow-2xl w-[560px] max-w-[90vw] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400" />
          <span className="text-sm font-medium text-slate-200">Welcome to Curly Brackets</span>
          <button onClick={finish} className="ml-auto text-slate-500 hover:text-white cursor-pointer" title="Skip onboarding">
            <X size={14} />
          </button>
        </div>

        <div className="p-5">
          <StepNav current={step} />
          <div className="mt-5 min-h-[180px]">
            {step === 'welcome' && <WelcomeStep onNext={() => setStep('apiKey')} />}
            {step === 'apiKey' && <ApiKeyStep onNext={() => setStep('vault')} onSkip={() => setStep('vault')} />}
            {step === 'vault' && <VaultStep onNext={() => setStep('agent')} onSkip={() => setStep('agent')} />}
            {step === 'agent' && <AgentStep onNext={() => setStep('done')} onSkip={() => setStep('done')} />}
            {step === 'done' && <DoneStep onFinish={finish} />}
          </div>
        </div>
      </div>
    </div>
  )
}

const STEP_ORDER: Step[] = ['welcome', 'apiKey', 'vault', 'agent', 'done']
const STEP_LABELS: Record<Step, string> = {
  welcome: 'Hello',
  apiKey: 'API key',
  vault: 'Vault',
  agent: 'First agent',
  done: 'Done'
}

function StepNav({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current)
  return (
    <div className="flex items-center gap-1">
      {STEP_ORDER.map((s, i) => {
        const isActive = i === idx
        const isDone = i < idx
        return (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center gap-1.5 ${isActive ? 'text-indigo-300' : isDone ? 'text-green-400' : 'text-slate-600'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                isActive ? 'bg-indigo-500/20 border-indigo-500/50' :
                isDone ? 'bg-green-500/20 border-green-500/50' :
                'border-white/10'
              }`}>
                {isDone ? <Check size={10} /> : i + 1}
              </div>
              <span className="text-[10px] uppercase tracking-wider">{STEP_LABELS[s]}</span>
            </div>
            {i < STEP_ORDER.length - 1 && <div className={`flex-1 h-px mx-1.5 ${isDone ? 'bg-green-500/30' : 'bg-white/5'}`} />}
          </div>
        )
      })}
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-200">
        Curly Brackets is your personal multi-agent control center — chat, workflows, knowledge retrieval, all powered by Claude + Gemini CLIs running locally.
      </p>
      <ul className="space-y-1.5 text-xs text-slate-400 ml-3">
        <li>• <strong className="text-slate-200">Chat</strong> with any model and pin Obsidian notes / files for retrieval</li>
        <li>• <strong className="text-slate-200">Agents</strong> with their own memory, tools, and project bindings</li>
        <li>• <strong className="text-slate-200">Workflows</strong> — multi-step DAGs with cron / file-watch / webhook triggers</li>
        <li>• <strong className="text-slate-200">Cmd+K</strong> jumps to anything from anywhere</li>
      </ul>
      <p className="text-[11px] text-slate-500">Three quick setup steps — all skippable.</p>
      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={onNext}>Get started <ArrowRight size={11} /></Button>
      </div>
    </div>
  )
}

function ApiKeyStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const handleSave = async () => {
    if (!apiKey.trim()) return
    setBusy(true)
    try {
      await window.api.settings.set('openaiApiKey', apiKey.trim())
      onNext()
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Key size={14} className="text-amber-400" />
        <h3 className="text-sm font-medium text-slate-100">OpenAI API key (for embeddings)</h3>
      </div>
      <p className="text-xs text-slate-400">
        Used by the knowledge layer (text-embedding-3-small) to index your notes / PDFs / codebases.
        Without it, retrieval is disabled — you can still chat. Set later in Settings → Knowledge.
      </p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-..."
        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onSkip}>Skip</Button>
        <Button size="sm" onClick={handleSave} disabled={busy || !apiKey.trim()}>
          Save & next <ArrowRight size={11} />
        </Button>
      </div>
    </div>
  )
}

function VaultStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)

  const pickAndContinue = async () => {
    const picked = await window.api.dialog.pickDirectory({ title: 'Select your Obsidian vault' })
    if (picked) setPath(picked)
  }

  const create = async () => {
    if (!path) return
    setBusy(true)
    try {
      await window.api.knowledge.sources.create({
        name: 'Obsidian Vault',
        scope: 'global',
        type: 'obsidian',
        config: { path },
        enabled: true
      })
      // Background re-index — don't await
      window.api.knowledge.sources.list({ scope: 'global' }).then((sources) => {
        const s = sources.find((x) => x.config.path === path)
        if (s) window.api.knowledge.sources.reindex(s.id).catch(() => { /* ignore */ })
      })
      onNext()
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen size={14} className="text-indigo-400" />
        <h3 className="text-sm font-medium text-slate-100">Connect your Obsidian vault</h3>
      </div>
      <p className="text-xs text-slate-400">
        We'll watch this folder, embed your markdown notes, and inject relevant chunks into every chat turn. Add more sources (folders, PDFs, web pages, codebases) later from Settings → Knowledge.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] text-slate-300 font-mono bg-white/5 border border-white/10 rounded px-2 py-1.5 truncate">
          {path || 'No folder selected'}
        </code>
        <Button size="sm" variant="outline" onClick={pickAndContinue}>
          <FolderOpen size={11} /> Pick…
        </Button>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onSkip}>Skip</Button>
        <Button size="sm" onClick={create} disabled={busy || !path}>
          Add & next <ArrowRight size={11} />
        </Button>
      </div>
    </div>
  )
}

function AgentStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [busy, setBusy] = useState(false)
  const { fetchAgents } = useAgentStore()

  const TEMPLATES: Array<{ name: string; role: string; systemPrompt: string }> = [
    { name: 'Coder', role: 'coder', systemPrompt: 'You are a senior engineer. Write clean, idiomatic code with brief explanations.' },
    { name: 'Researcher', role: 'researcher', systemPrompt: 'You research thoroughly, cite sources, and produce concise structured summaries.' },
    { name: 'Reviewer', role: 'reviewer', systemPrompt: 'You critique work for correctness, clarity, and risk. Be direct and specific.' }
  ]

  const create = async (tpl: typeof TEMPLATES[number]) => {
    setBusy(true)
    try {
      const settings = await window.api.settings.all()
      const model = settings.defaultClaudeModel ?? 'claude-sonnet-4-6'
      await window.api.agents.create({
        name: tpl.name,
        description: '',
        role: tpl.role,
        provider: 'claude',
        model,
        systemPrompt: tpl.systemPrompt,
        toolsEnabled: ['bash', 'file_read', 'file_write'],
        projectId: null
      })
      await fetchAgents()
      onNext()
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bot size={14} className="text-indigo-400" />
        <h3 className="text-sm font-medium text-slate-100">Create your first agent</h3>
      </div>
      <p className="text-xs text-slate-400">
        An agent is a specialised Claude/Gemini session with its own system prompt, memory, and tools. Pick a template — you can edit, add more, or delete from Agents.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.name}
            disabled={busy}
            onClick={() => create(t)}
            className="px-3 py-2.5 rounded border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-left disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <p className="text-xs font-medium text-slate-200">{t.name}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{t.systemPrompt}</p>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onSkip} disabled={busy}>Skip</Button>
      </div>
    </div>
  )
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="space-y-3 text-center py-4">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40">
        <Check size={20} className="text-green-400" />
      </div>
      <h3 className="text-sm font-medium text-slate-100">You're all set</h3>
      <p className="text-xs text-slate-400">
        Press <kbd className="font-mono text-[10px] px-1 py-0.5 bg-white/5 rounded">⌘K</kbd> any time to jump to anything.
        Your first chat is just one click away.
      </p>
      <div className="pt-1">
        <Button size="sm" onClick={onFinish}>Open the app</Button>
      </div>
    </div>
  )
}
