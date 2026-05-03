import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
  NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Play, Save, Trash2, Workflow as WorkflowIcon, Bot, ChevronRight, Clock, History } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Markdown } from '../components/Markdown'
import { ResizeHandle, usePersistedWidth } from '../components/ResizeHandle'
import { useWorkflowStore } from '../stores/workflowStore'
import { useAgentStore } from '../stores/agentStore'
import { WorkflowDefinition, StepStates, StepState, Agent, AgentRole, EdgeCondition, EdgeConditionMode } from '@shared/types'

interface AgentNodeData extends Record<string, unknown> {
  agentId: string
  promptTemplate: string
  agentName: string
  provider: string
  model: string
  stepState?: StepState
}

interface ApprovalNodeData extends Record<string, unknown> {
  approvalMessage: string
  stepState?: StepState
  runId?: string
  nodeId?: string
}

interface OutputNodeData extends Record<string, unknown> {
  outputConfig: {
    kind: 'slack' | 'discord' | 'webhook' | 'file'
    target: string
    template?: string
    meta?: Record<string, string>
  }
  stepState?: StepState
}

const OUTPUT_KIND_META: Record<string, { icon: string; label: string; color: string }> = {
  slack:   { icon: '💬', label: 'Slack',    color: 'border-purple-500/40 ring-purple-500/40' },
  discord: { icon: '🎮', label: 'Discord',  color: 'border-indigo-500/40 ring-indigo-500/40' },
  webhook: { icon: '🔗', label: 'Webhook',  color: 'border-cyan-500/40 ring-cyan-500/40' },
  file:    { icon: '📁', label: 'File',     color: 'border-emerald-500/40 ring-emerald-500/40' }
}

function ApprovalFlowNode({ data, selected, id }: NodeProps) {
  const d = data as ApprovalNodeData
  const status = d.stepState?.status
  const isAwaiting = status === 'awaiting_approval'
  const ringColor =
    isAwaiting ? 'ring-amber-400 animate-pulse' :
    status === 'done' ? 'ring-green-400/60' :
    status === 'rejected' ? 'ring-red-500/60' :
    selected ? 'ring-indigo-400/60' : 'ring-amber-500/40'

  const handleDecision = async (approved: boolean) => {
    if (!d.runId) return
    await window.api.workflows.resolveApproval(d.runId, id, approved)
  }

  return (
    <div className={`w-64 rounded-lg bg-[#13131a] border border-amber-500/30 ring-2 ${ringColor} transition-colors`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-400 !border-none !w-2 !h-2" />
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <span className="text-amber-400">⏸</span>
        <span className="text-xs font-medium text-slate-200">Approval gate</span>
        {status && (
          <span className={`ml-auto text-[10px] uppercase tracking-wider ${
            isAwaiting ? 'text-amber-400' :
            status === 'done' ? 'text-green-400' :
            status === 'rejected' ? 'text-red-400' : 'text-slate-500'
          }`}>{status === 'awaiting_approval' ? 'awaiting' : status}</span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] text-slate-300 line-clamp-3 whitespace-pre-wrap">
          {d.approvalMessage || <span className="text-slate-600 italic">No approval message — uses {`{{input}}`}</span>}
        </p>
        {isAwaiting && (
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => handleDecision(true)}
              className="flex-1 px-2 py-1 rounded text-[11px] bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 cursor-pointer"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => handleDecision(false)}
              className="flex-1 px-2 py-1 rounded text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 cursor-pointer"
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400 !border-none !w-2 !h-2" />
    </div>
  )
}

function AgentFlowNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData
  const status = d.stepState?.status
  const ringColor =
    status === 'running' ? 'ring-amber-400/60 animate-pulse' :
    status === 'done' ? 'ring-green-400/60' :
    status === 'failed' ? 'ring-red-500/60' :
    selected ? 'ring-indigo-400/60' : 'ring-white/10'

  return (
    <div className={`w-56 rounded-lg bg-[#13131a] border border-white/10 ring-2 ${ringColor} transition-colors`}>
      <Handle type="target" position={Position.Top} className="!bg-indigo-400 !border-none !w-2 !h-2" />
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <Bot size={12} className="text-indigo-400 flex-shrink-0" />
        <span className="text-xs font-medium text-slate-200 truncate">{d.agentName}</span>
        {status && (
          <span className={`ml-auto text-[10px] uppercase tracking-wider ${
            status === 'running' ? 'text-amber-400' :
            status === 'done' ? 'text-green-400' :
            status === 'failed' ? 'text-red-400' : 'text-slate-500'
          }`}>{status}</span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[10px] text-slate-500 mb-1">{d.provider} · {d.model}</p>
        <p className="text-[11px] text-slate-300 line-clamp-3 whitespace-pre-wrap">
          {d.promptTemplate || <span className="text-slate-600 italic">No prompt set</span>}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400 !border-none !w-2 !h-2" />
    </div>
  )
}

function OutputFlowNode({ data, selected }: NodeProps) {
  const d = data as OutputNodeData
  const cfg = d.outputConfig
  const meta = OUTPUT_KIND_META[cfg.kind] ?? OUTPUT_KIND_META.webhook
  const status = d.stepState?.status
  const ringColor =
    status === 'running' ? 'ring-amber-400/60 animate-pulse' :
    status === 'done' ? 'ring-green-400/60' :
    status === 'failed' ? 'ring-red-500/60' :
    selected ? 'ring-indigo-400/60' : meta.color

  const targetDisplay = cfg.target
    ? (cfg.kind === 'file' ? cfg.target.split('/').slice(-2).join('/') : truncMid(cfg.target, 32))
    : <span className="text-slate-600 italic">Set a target</span>

  return (
    <div className={`w-60 rounded-lg bg-[#13131a] border ${meta.color.split(' ')[0]} ring-2 ${ringColor} transition-colors`}>
      <Handle type="target" position={Position.Top} className="!bg-emerald-400 !border-none !w-2 !h-2" />
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <span>{meta.icon}</span>
        <span className="text-xs font-medium text-slate-200">{meta.label} output</span>
        {status && (
          <span className={`ml-auto text-[10px] uppercase tracking-wider ${
            status === 'running' ? 'text-amber-400' :
            status === 'done' ? 'text-green-400' :
            status === 'failed' ? 'text-red-400' : 'text-slate-500'
          }`}>{status}</span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[10px] text-slate-500 mb-0.5">Target</p>
        <p className="text-[11px] text-slate-300 font-mono truncate">{targetDisplay}</p>
        {cfg.template && (
          <>
            <p className="text-[10px] text-slate-500 mb-0.5 mt-1.5">Template</p>
            <p className="text-[11px] text-slate-400 line-clamp-2 whitespace-pre-wrap">{cfg.template}</p>
          </>
        )}
      </div>
    </div>
  )
}

function truncMid(s: string, max: number): string {
  if (s.length <= max) return s
  const half = Math.floor((max - 1) / 2)
  return `${s.slice(0, half)}…${s.slice(-half)}`
}

const nodeTypes = { agent: AgentFlowNode, approval: ApprovalFlowNode, output: OutputFlowNode }

function OutputNodeInspector({
  data, onKindChange, onTargetChange, onTemplateChange, onMetaChange
}: {
  data: OutputNodeData
  onKindChange: (kind: 'slack' | 'discord' | 'webhook' | 'file') => void
  onTargetChange: (target: string) => void
  onTemplateChange: (template: string) => void
  onMetaChange: (key: string, val: string) => void
}) {
  const cfg = data.outputConfig
  const meta = cfg.meta ?? {}
  const targetLabel =
    cfg.kind === 'slack' ? 'Slack incoming-webhook URL' :
    cfg.kind === 'discord' ? 'Discord webhook URL' :
    cfg.kind === 'webhook' ? 'POST URL' :
    'Absolute file path'
  const targetPlaceholder =
    cfg.kind === 'slack' ? 'https://hooks.slack.com/services/...' :
    cfg.kind === 'discord' ? 'https://discord.com/api/webhooks/...' :
    cfg.kind === 'webhook' ? 'https://api.example.com/hook' :
    '/Users/you/output.md'

  const isUrl = cfg.kind !== 'file'
  const pickFile = async () => {
    if (cfg.kind !== 'file') return
    const path = await window.api.dialog.pickDirectory({ title: 'Select output directory' })
    if (path) onTargetChange(`${path}/output.md`)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase text-slate-500 block mb-1">Destination</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(['slack', 'discord', 'webhook', 'file'] as const).map((k) => {
            const m = OUTPUT_KIND_META[k]
            return (
              <button
                key={k}
                onClick={() => onKindChange(k)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-[11px] cursor-pointer ${
                  cfg.kind === k
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                    : 'border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <span>{m.icon}</span> {m.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase text-slate-500 block mb-1">{targetLabel}</label>
        <div className="flex items-center gap-1.5">
          <input
            type={isUrl ? 'url' : 'text'}
            value={cfg.target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder={targetPlaceholder}
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
          />
          {!isUrl && (
            <button onClick={pickFile} className="px-2 py-1 rounded text-[10px] border border-white/10 text-slate-300 hover:bg-white/5 cursor-pointer">Pick…</button>
          )}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase text-slate-500 block mb-1">
          Template <span className="text-slate-600 normal-case">(optional, default: {'{{input}}'})</span>
        </label>
        <textarea
          value={cfg.template ?? ''}
          onChange={(e) => onTemplateChange(e.target.value)}
          placeholder="*Build report*\n{{input}}"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded p-2 text-[11px] text-slate-200 outline-none focus:border-indigo-500/50 resize-none"
        />
      </div>

      {/* Per-kind meta fields */}
      {cfg.kind === 'slack' && (
        <div className="space-y-2">
          <MetaInput label="Channel override" placeholder="#alerts" value={meta.channel ?? ''} onChange={(v) => onMetaChange('channel', v)} />
          <MetaInput label="Username" placeholder="AI OS Bot" value={meta.username ?? ''} onChange={(v) => onMetaChange('username', v)} />
        </div>
      )}
      {cfg.kind === 'discord' && (
        <MetaInput label="Username" placeholder="AI OS Bot" value={meta.username ?? ''} onChange={(v) => onMetaChange('username', v)} />
      )}
      {cfg.kind === 'webhook' && (
        <div className="space-y-2">
          <MetaInput label="Content-Type" placeholder="application/json" value={meta.contentType ?? ''} onChange={(v) => onMetaChange('contentType', v)} />
          <MetaInput label="Bearer token" placeholder="(optional)" value={meta.bearer ?? ''} onChange={(v) => onMetaChange('bearer', v)} type="password" />
        </div>
      )}

      <p className="text-[10px] text-slate-600 leading-relaxed">
        {cfg.kind === 'slack' && 'Generate a webhook URL at api.slack.com → Incoming Webhooks. The body is sent as the message text.'}
        {cfg.kind === 'discord' && 'Server settings → Integrations → Webhooks → Copy URL. Messages over 1900 chars are auto-truncated.'}
        {cfg.kind === 'webhook' && 'Generic POST with the rendered body. Add a Bearer token if your endpoint requires auth.'}
        {cfg.kind === 'file' && 'Atomic write to an absolute path. Parent directory is created if missing.'}
      </p>
    </div>
  )
}

function MetaInput({ label, placeholder, value, onChange, type = 'text' }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 block mb-0.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
      />
    </div>
  )
}

export function Workflows() {
  const { workflows, selectedId, fetchWorkflows, selectWorkflow, createWorkflow, deleteWorkflow } = useWorkflowStore()

  const { agents } = useAgentStore()
  const [showNew, setShowNew] = useState(false)
  const [sidebarWidth, setSidebarWidth] = usePersistedWidth('workflows:sidebarWidth', 192, 160, 400)

  useEffect(() => { fetchWorkflows() }, [])

  // Open the create modal when ⌘⇧W is pressed anywhere
  useEffect(() => {
    const open = () => setShowNew(true)
    window.addEventListener('shortcut:new-workflow', open)
    return () => window.removeEventListener('shortcut:new-workflow', open)
  }, [])

  const selected = workflows.find((w) => w.id === selectedId)

  const handleNewBlank = async () => {
    const name = `Workflow ${workflows.length + 1}`
    await createWorkflow(name)
    setShowNew(false)
  }

  const handleNewFromTemplate = async (tpl: WorkflowTemplate) => {
    // Resolve each templated step to an actual agent (by role) — fallback to any
    const def: WorkflowDefinition = {
      nodes: tpl.steps.map((s, i) => {
        const byRole = agents.find((a) => a.role === s.role)
        const agent = byRole ?? agents[0]
        return {
          id: `n-${Date.now()}-${i}`,
          agentId: agent?.id ?? '',
          promptTemplate: s.promptTemplate,
          position: { x: 200, y: 50 + i * 140 }
        }
      }),
      edges: tpl.steps.slice(0, -1).map((_, i) => ({
        id: `e-${Date.now()}-${i}`,
        source: `n-${Date.now()}-${i}`,
        target: `n-${Date.now()}-${i + 1}`
      }))
    }
    // Re-link edges to use the actual node ids we just generated (timestamps may collide)
    const ids = def.nodes.map((n) => n.id)
    def.edges = def.nodes.slice(0, -1).map((_, i) => ({
      id: `e-${ids[i]}-${ids[i + 1]}`,
      source: ids[i],
      target: ids[i + 1]
    }))
    const wf = await window.api.workflows.create({
      name: tpl.name,
      description: tpl.description,
      definition: JSON.stringify(def)
    }) as { id: string }
    await fetchWorkflows()
    selectWorkflow(wf.id)
    setShowNew(false)
  }

  return (
    <div className="flex flex-1 h-full min-w-0">
      {/* Workflow List */}
      <div
        className="flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d14]"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Workflows</span>
          <button
            onClick={() => setShowNew(true)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {workflows.map((w) => (
            <button
              key={w.id}
              onClick={() => selectWorkflow(w.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                selectedId === w.id
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <WorkflowIcon size={12} className="flex-shrink-0" />
              <span className="text-xs truncate">{w.name}</span>
            </button>
          ))}
          {workflows.length === 0 && (
            <p className="text-xs text-slate-600 px-3 py-4 text-center">No workflows yet</p>
          )}
        </div>
      </div>

      <ResizeHandle width={sidebarWidth} onResize={setSidebarWidth} min={160} max={400} />

      {/* Editor */}
      {selected ? (
        <ReactFlowProvider>
          <WorkflowEditor
            key={selected.id}
            workflowId={selected.id}
            name={selected.name}
            definitionJson={selected.definition}
            projectId={selected.projectId}
            triggerConfig={selected.triggerConfig}
            perRunBudgetUsd={selected.perRunBudgetUsd ?? null}
            onDelete={() => deleteWorkflow(selected.id)}
          />
        </ReactFlowProvider>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <WorkflowIcon size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Select or create a workflow</p>
            <Button className="mt-4" onClick={() => setShowNew(true)}>
              <Plus size={14} /> New Workflow
            </Button>
          </div>
        </div>
      )}

      {showNew && (
        <NewWorkflowModal
          onBlank={handleNewBlank}
          onTemplate={handleNewFromTemplate}
          onClose={() => setShowNew(false)}
          agentCount={agents.length}
        />
      )}
    </div>
  )
}

const ROLE_LABELS: Record<AgentRole, string> = {
  orchestrator: 'Orchestrator', coder: 'Coder', reviewer: 'Reviewer',
  researcher: 'Researcher', writer: 'Writer', tester: 'Tester',
  analyst: 'Analyst', custom: 'Custom'
}

interface WorkflowTemplate {
  id: string
  name: string
  description: string
  steps: { role: AgentRole; promptTemplate: string }[]
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'code-review',
    name: 'Code Review Pipeline',
    description: 'Coder writes the change → Reviewer audits → Tester suggests test cases.',
    steps: [
      { role: 'coder', promptTemplate: 'Implement the following change carefully and explain your approach:\n\n{{input}}' },
      { role: 'reviewer', promptTemplate: 'Review the following implementation. List issues, security concerns, and improvements as a numbered list:\n\n{{input}}' },
      { role: 'tester', promptTemplate: 'Given the implementation and review notes below, propose a focused test plan covering golden path + 3 edge cases:\n\n{{input}}' }
    ]
  },
  {
    id: 'research-report',
    name: 'Research & Report',
    description: 'Researcher gathers context → Writer turns it into a structured note.',
    steps: [
      { role: 'researcher', promptTemplate: 'Research the topic below and produce a thorough briefing with sources:\n\n{{input}}' },
      { role: 'writer', promptTemplate: 'Turn this research into a 1-page structured note (TL;DR, key findings, open questions):\n\n{{input}}' }
    ]
  },
  {
    id: 'bug-triage',
    name: 'Bug Triage',
    description: 'Analyst categorises severity → Coder proposes a fix.',
    steps: [
      { role: 'analyst', promptTemplate: 'Triage this bug report. Output: severity (P0-P3), suspected root cause, affected components, repro steps:\n\n{{input}}' },
      { role: 'coder', promptTemplate: 'Based on the triage below, propose a minimal fix with the actual code change:\n\n{{input}}' }
    ]
  },
  {
    id: 'doc-generator',
    name: 'Doc Generator',
    description: 'Coder explains the code → Writer formats it as user-facing docs.',
    steps: [
      { role: 'coder', promptTemplate: 'Read the code below and explain what it does, its public API, and gotchas:\n\n{{input}}' },
      { role: 'writer', promptTemplate: 'Turn this engineering explanation into clear user-facing docs (What, Quick start, API reference, FAQs):\n\n{{input}}' }
    ]
  },
  {
    id: 'daily-digest',
    name: 'Daily Digest',
    description: 'Researcher pulls today\'s activity → Writer formats a 5-line digest. Pair with a daily schedule.',
    steps: [
      { role: 'researcher', promptTemplate: 'Look up the most relevant updates from the past 24 hours related to:\n\n{{input}}' },
      { role: 'writer', promptTemplate: 'Format the findings below as a 5-bullet daily digest. Lead with the most important item:\n\n{{input}}' }
    ]
  }
]

function NewWorkflowModal({
  onBlank,
  onTemplate,
  onClose,
  agentCount
}: {
  onBlank: () => void
  onTemplate: (tpl: WorkflowTemplate) => void
  onClose: () => void
  agentCount: number
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13131a] border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">New Workflow</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none cursor-pointer">×</button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {agentCount === 0 && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
              You don't have any agents yet. Templates will create nodes but each step needs an agent assigned before it can run.
            </p>
          )}
          <button
            onClick={onBlank}
            className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/2 hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer transition-colors"
          >
            <p className="text-sm font-medium text-slate-200">Blank workflow</p>
            <p className="text-xs text-slate-500 mt-0.5">Start with an empty canvas.</p>
          </button>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-3">Templates</p>
          {WORKFLOW_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onTemplate(tpl)}
              className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/2 hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-200">{tpl.name}</p>
                <span className="text-[10px] text-slate-500">· {tpl.steps.length} step{tpl.steps.length === 1 ? '' : 's'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{tpl.description}</p>
              <div className="flex gap-1 mt-1.5">
                {tpl.steps.map((s, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                    {ROLE_LABELS[s.role]}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface PastRun {
  id: string
  workflowId: string
  status: string
  stepStates: string | null
  startedAt: number | null
  completedAt: number | null
  triggeredBy: string
}

function RunHistoryPanel({
  workflowId,
  nodeNames,
  onClose
}: {
  workflowId: string
  nodeNames: Record<string, string>
  onClose: () => void
}) {
  const [runs, setRuns] = useState<PastRun[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    window.api.workflows.runs.list(workflowId).then((rs) => {
      const sorted = [...(rs as PastRun[])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      setRuns(sorted)
      if (sorted.length > 0) setExpandedId(sorted[0].id)
    })
  }, [workflowId])

  // Subscribe to live updates so we refresh when new runs come in
  useEffect(() => {
    const unsub = window.api.on('workflow:run:complete', () => {
      window.api.workflows.runs.list(workflowId).then((rs) => {
        setRuns([...(rs as PastRun[])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)))
      })
    })
    return unsub
  }, [workflowId])

  const summarize = (r: PastRun) => {
    const states: StepStates = r.stepStates ? JSON.parse(r.stepStates) : {}
    let cost = 0
    let inTok = 0
    let outTok = 0
    for (const s of Object.values(states)) {
      cost += s.costUsd ?? 0
      inTok += s.inputTokens ?? 0
      outTok += s.outputTokens ?? 0
    }
    return { cost, inTok, outTok, states }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[480px] h-full bg-[#0d0d14] border-l border-white/10 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <History size={14} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200">Run history</h2>
            <span className="text-xs text-slate-500">{runs.length} run{runs.length === 1 ? '' : 's'}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {runs.length === 0 && (
            <p className="text-xs text-slate-600 p-4 text-center">No runs yet. Click Run to start one.</p>
          )}
          {runs.map((r) => {
            const { cost, inTok, outTok, states } = summarize(r)
            const expanded = expandedId === r.id
            const duration = (r.startedAt && r.completedAt)
              ? Math.round((r.completedAt - r.startedAt) / 100) / 10
              : null
            return (
              <div key={r.id} className="border-b border-white/5">
                <button
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 cursor-pointer text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    r.status === 'completed' ? 'bg-green-400' :
                    r.status === 'failed' ? 'bg-red-400' :
                    r.status === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-200">
                        {r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wider ${
                        r.status === 'completed' ? 'text-green-400' :
                        r.status === 'failed' ? 'text-red-400' :
                        r.status === 'running' ? 'text-amber-300' : 'text-slate-500'
                      }`}>{r.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                      {duration != null && <span>{duration}s</span>}
                      <span>·</span>
                      <span>${cost.toFixed(4)}</span>
                      <span>·</span>
                      <span>{(inTok + outTok).toLocaleString()} tokens</span>
                      <span>·</span>
                      <span>{r.triggeredBy}</span>
                    </div>
                  </div>
                  <span className="text-slate-500">{expanded ? '▾' : '▸'}</span>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {Object.entries(states).map(([stepId, state]) => (
                      <div key={stepId} className="bg-white/3 border border-white/5 rounded p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-1 h-1 rounded-full ${
                            state.status === 'done' ? 'bg-green-400' :
                            state.status === 'failed' ? 'bg-red-400' :
                            state.status === 'running' ? 'bg-amber-400 animate-pulse' :
                            state.status === 'skipped' ? 'bg-slate-600' : 'bg-slate-700'
                          }`} />
                          <span className="text-xs font-medium text-slate-300">
                            {nodeNames[stepId] ?? '(deleted node)'}
                          </span>
                          <span className={`ml-auto text-[10px] uppercase ${
                            state.status === 'done' ? 'text-green-400' :
                            state.status === 'failed' ? 'text-red-400' :
                            state.status === 'skipped' ? 'text-slate-500' :
                            state.status === 'running' ? 'text-amber-300' : 'text-slate-500'
                          }`}>{state.status}</span>
                        </div>
                        {(state.costUsd != null || state.inputTokens != null) && (
                          <p className="text-[10px] text-slate-500 mb-1.5">
                            {state.startedAt && state.endedAt && (
                              <span>{Math.round((state.endedAt - state.startedAt) / 100) / 10}s · </span>
                            )}
                            {state.costUsd != null && <span>${state.costUsd.toFixed(4)} · </span>}
                            {(state.inputTokens ?? 0) + (state.outputTokens ?? 0)} tokens
                          </p>
                        )}
                        {state.error && (
                          <p className="text-[11px] text-red-400 leading-relaxed">{state.error}</p>
                        )}
                        {state.output && (
                          <div className="mt-1 max-h-60 overflow-y-auto bg-black/20 rounded p-2 border border-white/5">
                            <Markdown>{state.output}</Markdown>
                          </div>
                        )}
                      </div>
                    ))}
                    {Object.keys(states).length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-2">No step state recorded.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EdgeInspector({
  edge,
  onChange,
  onDelete,
  onClose
}: {
  edge: Edge
  onChange: (c: EdgeCondition | undefined) => void
  onDelete: () => void
  onClose: () => void
}) {
  const cond = (edge.data as { condition?: EdgeCondition } | undefined)?.condition
  const [mode, setMode] = useState<EdgeConditionMode>(cond?.mode ?? 'always')
  const [value, setValue] = useState(cond?.value ?? '')
  const [caseSensitive, setCaseSensitive] = useState(cond?.caseSensitive ?? false)

  const apply = () => {
    if (mode === 'always') onChange(undefined)
    else onChange({ mode, value, caseSensitive })
  }

  return (
    <div className="border-l border-white/5 bg-[#0d0d14] flex flex-col min-h-0 overflow-hidden">
      <div className="px-3 py-3 border-b border-white/5 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-200">Edge condition</span>
        <Button size="sm" variant="ghost" onClick={onDelete} className="ml-auto">
          <Trash2 size={11} />
        </Button>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-base leading-none cursor-pointer">×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          The downstream node only runs if the source's output matches this condition.
          If no condition fires for a node, it's <span className="text-slate-300">skipped</span>.
        </p>
        <div>
          <label className="text-[10px] uppercase text-slate-500 block mb-1">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as EdgeConditionMode)}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
          >
            <option value="always">Always (no condition)</option>
            <option value="contains">Output contains…</option>
            <option value="not_contains">Output does NOT contain…</option>
            <option value="starts_with">Output starts with…</option>
            <option value="matches">Output matches regex…</option>
          </select>
        </div>
        {mode !== 'always' && (
          <>
            <div>
              <label className="text-[10px] uppercase text-slate-500 block mb-1">
                {mode === 'matches' ? 'Pattern' : 'Value'}
              </label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === 'matches' ? 'e.g. ^LGTM' : 'e.g. LGTM'}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500/50"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="cursor-pointer"
              />
              Case-sensitive
            </label>
          </>
        )}
        <Button size="sm" onClick={apply} className="w-full">
          Apply (save the workflow to persist)
        </Button>
      </div>
    </div>
  )
}

function FinalOutputPanel({
  workflowName,
  nodes,
  edges,
  stepStates,
  runStatus
}: {
  workflowName: string
  nodes: { id: string; agentName: string }[]
  edges: { source: string; target: string }[]
  stepStates: StepStates
  runStatus: string | undefined
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [copyState, setCopyState] = useState<Record<string, 'idle' | 'copied'>>({})

  // Leaf nodes: nodes that have no outgoing edges (i.e. terminal nodes in the DAG)
  const leafIds = useMemo(() => {
    const hasChild = new Set(edges.map((e) => e.source))
    return nodes.filter((n) => !hasChild.has(n.id)).map((n) => n.id)
  }, [nodes, edges])

  const finalOutputs = useMemo(
    () =>
      leafIds
        .map((id) => {
          const n = nodes.find((nn) => nn.id === id)
          const s = stepStates[id]
          return n && s?.status === 'done' && s.output
            ? { id, agentName: n.agentName, output: s.output }
            : null
        })
        .filter((x): x is { id: string; agentName: string; output: string } => Boolean(x)),
    [leafIds, nodes, stepStates]
  )

  // Don't render if there are no completed leaf outputs and no run is in progress
  if (finalOutputs.length === 0) return null

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState((s) => ({ ...s, [id]: 'copied' }))
      setTimeout(() => setCopyState((s) => ({ ...s, [id]: 'idle' })), 1500)
    } catch {
      // ignore
    }
  }

  const handleDownload = (agentName: string, text: string) => {
    const safeName = `${workflowName}-${agentName}`.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="absolute left-0 right-0 bottom-0 z-10 bg-[#13131a]/95 border-t border-white/10 backdrop-blur-sm">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 cursor-pointer border-b border-white/5"
      >
        <span className={`text-xs ${
          runStatus === 'completed' ? 'text-green-400' : runStatus === 'failed' ? 'text-red-400' : 'text-slate-400'
        }`}>{collapsed ? '▸' : '▾'}</span>
        <span className="font-medium">Final output</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-500">
          {finalOutputs.length} leaf{finalOutputs.length === 1 ? '' : 's'}
        </span>
        {runStatus && (
          <span className={`ml-auto text-[10px] uppercase tracking-wider ${
            runStatus === 'completed' ? 'text-green-400' :
            runStatus === 'failed' ? 'text-red-400' :
            runStatus === 'running' ? 'text-amber-300' : 'text-slate-500'
          }`}>{runStatus}</span>
        )}
      </button>
      {!collapsed && (
        <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
          {finalOutputs.map((o) => (
            <div key={o.id} className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Bot size={11} className="text-indigo-400" />
                <span className="text-xs font-medium text-slate-300">{o.agentName}</span>
                <div className="ml-auto flex gap-1.5">
                  <button
                    onClick={() => handleCopy(o.id, o.output)}
                    className="px-2 py-0.5 rounded text-[10px] border border-white/10 text-slate-300 hover:border-white/20 cursor-pointer"
                  >
                    {copyState[o.id] === 'copied' ? '✓ Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleDownload(o.agentName, o.output)}
                    className="px-2 py-0.5 rounded text-[10px] border border-white/10 text-slate-300 hover:border-white/20 cursor-pointer"
                  >
                    Download .md
                  </button>
                </div>
              </div>
              <div className="bg-white/3 border border-white/5 rounded p-2.5">
                <Markdown>{o.output}</Markdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchedulePopover({
  trigger,
  workflowId,
  onChange,
  onClose
}: {
  trigger: Trigger | null
  workflowId: string
  onChange: (t: Trigger | null) => void
  onClose: () => void
}) {
  const [type, setType] = useState<'cron' | 'fileWatch' | 'webhook'>(trigger?.type ?? 'cron')
  const [enabled, setEnabled] = useState(trigger?.enabled ?? true)
  // cron
  const [cronExpr, setCronExpr] = useState(trigger?.type === 'cron' ? trigger.cron : '0 9 * * *')
  // fileWatch
  const [pathsText, setPathsText] = useState(trigger?.type === 'fileWatch' ? trigger.paths.join('\n') : '')
  const [debounceMs, setDebounceMs] = useState(trigger?.type === 'fileWatch' ? (trigger.debounceMs ?? 1000) : 1000)
  // webhook
  const [secret, setSecret] = useState(trigger?.type === 'webhook' ? (trigger.secret ?? '') : '')
  const [bridgePort, setBridgePort] = useState<number | null>(null)

  useEffect(() => {
    if (type === 'webhook') window.api.aios.bridgePort().then(setBridgePort)
  }, [type])

  const apply = () => {
    let next: Trigger | null = null
    if (type === 'cron') {
      next = { type: 'cron', cron: cronExpr.trim(), enabled, lastRunAt: trigger?.lastRunAt }
    } else if (type === 'fileWatch') {
      const paths = pathsText.split('\n').map((p) => p.trim()).filter(Boolean)
      next = { type: 'fileWatch', paths, debounceMs, enabled, lastRunAt: trigger?.lastRunAt }
    } else if (type === 'webhook') {
      next = { type: 'webhook', secret: secret.trim() || undefined, enabled, lastRunAt: trigger?.lastRunAt }
    }
    onChange(next)
    onClose()
  }
  const clear = () => { onChange(null); onClose() }

  const browseAndAddPath = async () => {
    const p = await window.api.dialog.pickDirectory({ title: 'Pick a folder to watch' })
    if (p) setPathsText((curr) => (curr.trim() ? `${curr.trim()}\n${p}` : p))
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-96 bg-[#13131a] border border-white/10 rounded-lg shadow-xl z-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Trigger</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none cursor-pointer">×</button>
      </div>

      {/* Trigger type tabs */}
      <div className="flex gap-1 p-0.5 bg-white/5 rounded">
        {(['cron', 'fileWatch', 'webhook'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
              type === t ? 'bg-indigo-500/30 text-indigo-200' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'cron' ? 'Schedule' : t === 'fileWatch' ? 'On file change' : 'Webhook'}
          </button>
        ))}
      </div>

      {type === 'cron' && (
        <div>
          <label className="text-[10px] uppercase text-slate-500 block mb-1">Cron expression (local time)</label>
          <input
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500/50"
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.cron}
                onClick={() => setCronExpr(p.cron)}
                className="px-1.5 py-0.5 rounded text-[10px] border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === 'fileWatch' && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase text-slate-500 block">Paths to watch (one per line, files or folders)</label>
          <textarea
            value={pathsText}
            onChange={(e) => setPathsText(e.target.value)}
            placeholder="/Users/you/projects/my-app/src&#10;/Users/you/projects/my-app/docs"
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500/50 resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={browseAndAddPath}
              className="px-2 py-1 rounded text-[11px] border border-white/10 text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              + Browse folder
            </button>
            <span className="text-[10px] text-slate-500">Workflow input will be the changed path.</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase text-slate-500">Debounce</label>
            <input
              type="number"
              value={debounceMs}
              onChange={(e) => setDebounceMs(parseInt(e.target.value, 10) || 0)}
              className="w-24 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
            />
            <span className="text-[10px] text-slate-500">ms (groups bursts of changes)</span>
          </div>
        </div>
      )}

      {type === 'webhook' && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase text-slate-500 block">Endpoint</label>
          <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] font-mono text-slate-200 break-all">
            {bridgePort ? `POST http://127.0.0.1:${bridgePort}/webhook/${workflowId}` : 'loading...'}
          </div>
          <p className="text-[10px] text-slate-500">
            POST any text/JSON body — it becomes the workflow's runtime input. Localhost only.
          </p>
          <label className="text-[10px] uppercase text-slate-500 block">Optional secret (sent in <code className="text-indigo-400">x-webhook-secret</code> header)</label>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="leave blank for no auth (local-only is the default trust boundary)"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500/50"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="cursor-pointer"
        />
        Enabled
      </label>
      {trigger?.lastRunAt && (
        <p className="text-[10px] text-slate-500">Last fired {new Date(trigger.lastRunAt).toLocaleString()}</p>
      )}
      <div className="flex gap-2 pt-1">
        {trigger && (
          <button onClick={clear} className="px-3 py-1 rounded text-xs text-slate-400 hover:text-red-400 cursor-pointer">
            Remove
          </button>
        )}
        <button
          onClick={apply}
          className="ml-auto px-3 py-1 rounded text-xs bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer"
        >
          Apply (then Save in header)
        </button>
      </div>
      <p className="text-[10px] text-slate-600 leading-relaxed">
        The workflow must be saved for the trigger to take effect.
      </p>
    </div>
  )
}

type CronTrigger = { type: 'cron'; cron: string; enabled: boolean; lastRunAt?: number }
type FileWatchTrigger = { type: 'fileWatch'; paths: string[]; events?: ('add'|'change'|'unlink')[]; debounceMs?: number; enabled: boolean; lastRunAt?: number }
type WebhookTrigger = { type: 'webhook'; secret?: string; enabled: boolean; lastRunAt?: number }
type Trigger = CronTrigger | FileWatchTrigger | WebhookTrigger

/** Compact label for edge conditions, shown on the React Flow edge. */
function edgeLabel(condition?: EdgeCondition): string | undefined {
  if (!condition || condition.mode === 'always') return undefined
  const v = condition.value.length > 18 ? condition.value.slice(0, 17) + '…' : condition.value
  switch (condition.mode) {
    case 'contains': return `if contains "${v}"`
    case 'not_contains': return `if NOT contains "${v}"`
    case 'starts_with': return `if starts "${v}"`
    case 'matches': return `if /${v}/`
    default: return undefined
  }
}

/** Format a timestamp as "in 23m" / "in 4h" / "5m ago" / "Mar 5". */
function formatRelative(ts: number): string {
  if (!ts) return ''
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const m = Math.round(abs / 60_000)
  const h = Math.round(abs / 3_600_000)
  const d = Math.round(abs / 86_400_000)
  let str: string
  if (abs < 60_000) str = 'just now'
  else if (m < 60) str = `${m}m`
  else if (h < 24) str = `${h}h`
  else if (d < 7) str = `${d}d`
  else str = new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (str === 'just now') return str
  return diff > 0 ? `in ${str}` : `${str} ago`
}

function parseTrigger(raw: string | null): Trigger | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (obj?.type === 'cron' && typeof obj.cron === 'string') return obj as CronTrigger
    if (obj?.type === 'fileWatch' && Array.isArray(obj.paths)) return obj as FileWatchTrigger
    if (obj?.type === 'webhook') return obj as WebhookTrigger
  } catch { /* ignore */ }
  return null
}

function triggerSummary(t: Trigger | null): string {
  if (!t) return 'Trigger'
  if (t.type === 'cron') return t.cron
  if (t.type === 'fileWatch') return `watch ${t.paths.length} path${t.paths.length === 1 ? '' : 's'}`
  if (t.type === 'webhook') return 'webhook'
  return 'Trigger'
}

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily 9am', cron: '0 9 * * *' },
  { label: 'Weekdays 9am', cron: '0 9 * * 1-5' },
  { label: 'Weekly Mon 9am', cron: '0 9 * * 1' }
]

function WorkflowEditor({
  workflowId,
  name,
  definitionJson,
  projectId: initialProjectId,
  triggerConfig: initialTriggerConfig,
  perRunBudgetUsd: initialPerRunBudgetUsd,
  onDelete
}: {
  workflowId: string
  name: string
  definitionJson: string
  projectId: string | null
  triggerConfig: string | null
  perRunBudgetUsd: number | null
  onDelete: () => void
}) {
  const { agents, fetchAgents } = useAgentStore()
  const { saveDefinition, runWorkflow, renameWorkflow, runs } = useWorkflowStore()
  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string; repoPath: string | null }>>([])

  useEffect(() => {
    window.api.projects.list().then((p) => setProjectList(p as Array<{ id: string; name: string; repoPath: string | null }>))
  }, [])

  const initial: WorkflowDefinition = useMemo(() => {
    try { return JSON.parse(definitionJson) as WorkflowDefinition }
    catch { return { nodes: [], edges: [] } }
  }, [definitionJson])

  // Latest run for THIS workflow
  const latestRun = useMemo(() => {
    const entries = Object.entries(runs).filter(([, r]) => r.workflowId === workflowId)
    return entries.length ? entries[entries.length - 1] : null
  }, [runs, workflowId])
  const stepStates: StepStates = latestRun?.[1].stepStates ?? {}
  const runStatus = latestRun?.[1].status

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  useEffect(() => { if (agents.length === 0) fetchAgents() }, [])

  // React Flow state — initialised from the saved definition
  const [nodes, setNodes] = useState<Node<AgentNodeData | ApprovalNodeData | OutputNodeData>[]>(() =>
    initial.nodes.map((n) => {
      if (n.nodeType === 'approval') {
        return {
          id: n.id,
          type: 'approval',
          position: n.position,
          data: { approvalMessage: n.approvalMessage ?? '' } as ApprovalNodeData
        }
      }
      if (n.nodeType === 'output') {
        return {
          id: n.id,
          type: 'output',
          position: n.position,
          data: {
            outputConfig: n.outputConfig ?? { kind: 'webhook', target: '' }
          } as OutputNodeData
        }
      }
      const agent = agentMap.get(n.agentId)
      return {
        id: n.id,
        type: 'agent',
        position: n.position,
        data: {
          agentId: n.agentId,
          promptTemplate: n.promptTemplate,
          agentName: agent?.name ?? '(missing agent)',
          provider: agent?.provider ?? '?',
          model: agent?.model ?? '?'
        } as AgentNodeData
      }
    })
  )
  const [edges, setEdges] = useState<Edge[]>(() =>
    initial.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: { condition: e.condition },
      label: edgeLabel(e.condition),
      animated: !!e.condition && e.condition.mode !== 'always',
      labelStyle: { fill: '#a78bfa', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      labelBgStyle: { fill: '#13131a', stroke: '#a78bfa55', strokeWidth: 1 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4
    }))
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editedName, setEditedName] = useState(name)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runtimeInput, setRuntimeInput] = useState('')
  const [trigger, setTrigger] = useState<Trigger | null>(parseTrigger(initialTriggerConfig))
  const [perRunBudget, setPerRunBudget] = useState<string>(
    initialPerRunBudgetUsd != null ? String(initialPerRunBudgetUsd) : ''
  )
  const budgetDirty = useRef(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [nextFire, setNextFire] = useState<number | null>(null)
  const [lastRun, setLastRun] = useState<{ status: string; startedAt: number | null; completedAt: number | null } | null>(null)
  const dirty = useRef(false)
  const triggerDirty = useRef(false)

  // Refresh next-fire whenever the cron expression changes (cron triggers only)
  useEffect(() => {
    if (!trigger?.enabled || trigger.type !== 'cron') { setNextFire(null); return }
    let cancelled = false
    window.api.workflows.nextFire(trigger.cron).then((ts) => {
      if (!cancelled) setNextFire(ts as number | null)
    })
    return () => { cancelled = true }
  }, [trigger?.type, (trigger as CronTrigger | null)?.cron, trigger?.enabled])

  // Refresh last-run when latestRun (from store) changes or initially
  const refreshLastRun = useCallback(async () => {
    const lr = await window.api.workflows.lastRun(workflowId) as
      | { status: string; startedAt: number | null; completedAt: number | null }
      | null
    setLastRun(lr)
  }, [workflowId])

  useEffect(() => { refreshLastRun() }, [refreshLastRun, latestRun])

  // Refresh agent labels once agents load
  useEffect(() => {
    if (agentMap.size === 0) return
    setNodes((curr) =>
      curr.map((n) => {
        const agent = agentMap.get(n.data.agentId)
        if (!agent) return n
        return { ...n, data: { ...n.data, agentName: agent.name, provider: agent.provider, model: agent.model } }
      })
    )
  }, [agentMap])

  // Overlay live step state onto nodes whenever runs change
  // Latest run id (for handing to approval node click handlers)
  const latestRunId = latestRun?.[0]

  const nodesWithState = useMemo(
    () => nodes.map((n) => ({
      ...n,
      data: { ...n.data, stepState: stepStates[n.id], runId: latestRunId, nodeId: n.id }
    })),
    [nodes, stepStates, latestRunId]
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as Node<AgentNodeData>[])
    dirty.current = true
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
    dirty.current = true
  }, [])
  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({
      ...conn,
      id: `e-${conn.source}-${conn.target}-${Date.now()}`,
      data: { condition: undefined },
      labelBgPadding: [4, 2] as [number, number]
    }, eds))
    dirty.current = true
  }, [])

  const updateEdgeCondition = (edgeId: string, condition: EdgeCondition | undefined) => {
    setEdges((eds) => eds.map((e) => e.id === edgeId
      ? {
          ...e,
          data: { ...e.data, condition },
          label: edgeLabel(condition),
          animated: !!condition && condition.mode !== 'always'
        }
      : e
    ))
    dirty.current = true
  }

  const handleAddAgent = (agent: Agent) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const yOffset = nodes.length * 120 + 50
    setNodes((curr) => [
      ...curr,
      {
        id,
        type: 'agent',
        position: { x: 200, y: yOffset },
        data: {
          agentId: agent.id,
          promptTemplate: '',
          agentName: agent.name,
          provider: agent.provider,
          model: agent.model
        }
      }
    ])
    setSelectedNodeId(id)
    dirty.current = true
  }

  const handleAddApproval = () => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const yOffset = nodes.length * 120 + 50
    setNodes((curr) => [
      ...curr,
      {
        id,
        type: 'approval',
        position: { x: 200, y: yOffset },
        data: { approvalMessage: 'Review the output below and approve or reject:\n\n{{input}}' } as ApprovalNodeData
      }
    ])
    setSelectedNodeId(id)
    dirty.current = true
  }

  const handleAddOutput = (kind: 'slack' | 'discord' | 'webhook' | 'file') => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const yOffset = nodes.length * 120 + 50
    setNodes((curr) => [
      ...curr,
      {
        id,
        type: 'output',
        position: { x: 200, y: yOffset },
        data: { outputConfig: { kind, target: '' } } as OutputNodeData
      }
    ])
    setSelectedNodeId(id)
    dirty.current = true
  }

  const handleSave = async () => {
    setSaving(true)
    const def: WorkflowDefinition = {
      nodes: nodes.map((n) => {
        if (n.type === 'approval') {
          const d = n.data as ApprovalNodeData
          return {
            id: n.id,
            nodeType: 'approval' as const,
            agentId: '',
            promptTemplate: '',
            approvalMessage: d.approvalMessage,
            position: n.position
          }
        }
        if (n.type === 'output') {
          const d = n.data as OutputNodeData
          return {
            id: n.id,
            nodeType: 'output' as const,
            agentId: '',
            promptTemplate: '',
            outputConfig: d.outputConfig,
            position: n.position
          }
        }
        const d = n.data as AgentNodeData
        return {
          id: n.id,
          agentId: d.agentId,
          promptTemplate: d.promptTemplate,
          position: n.position
        }
      }),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        condition: (e.data as { condition?: EdgeCondition } | undefined)?.condition
      }))
    }
    await saveDefinition(workflowId, def)
    if (editedName !== name) await renameWorkflow(workflowId, editedName)
    if (projectId !== initialProjectId) {
      await window.api.workflows.update(workflowId, { projectId })
    }
    if (triggerDirty.current) {
      await window.api.workflows.update(workflowId, {
        triggerConfig: trigger ? JSON.stringify(trigger) : null
      })
      triggerDirty.current = false
    }
    if (budgetDirty.current) {
      const parsed = perRunBudget.trim() === '' ? null : Math.max(0, parseFloat(perRunBudget))
      await window.api.workflows.update(workflowId, { perRunBudgetUsd: parsed })
      budgetDirty.current = false
    }
    dirty.current = false
    setSaving(false)
  }

  const handleRun = async () => {
    if (dirty.current) await handleSave()
    setRunning(true)
    try {
      await runWorkflow(workflowId, runtimeInput.trim() || undefined)
    } finally {
      setRunning(false)
    }
  }

  const handleDeleteSelected = () => {
    if (!selectedNodeId) return
    setNodes((curr) => curr.filter((n) => n.id !== selectedNodeId))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
    dirty.current = true
  }

  const updateSelectedPrompt = (val: string) => {
    if (!selectedNodeId) return
    setNodes((curr) => curr.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, promptTemplate: val } } : n)))
    dirty.current = true
  }

  const updateSelectedApprovalMessage = (val: string) => {
    if (!selectedNodeId) return
    setNodes((curr) => curr.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, approvalMessage: val } } : n)))
    dirty.current = true
  }

  const updateSelectedOutputConfig = (patch: Partial<OutputNodeData['outputConfig']>) => {
    if (!selectedNodeId) return
    setNodes((curr) => curr.map((n) => {
      if (n.id !== selectedNodeId) return n
      const d = n.data as OutputNodeData
      return { ...n, data: { ...d, outputConfig: { ...d.outputConfig, ...patch } } }
    }))
    dirty.current = true
  }
  const updateSelectedOutputMeta = (key: string, val: string) => {
    if (!selectedNodeId) return
    setNodes((curr) => curr.map((n) => {
      if (n.id !== selectedNodeId) return n
      const d = n.data as OutputNodeData
      const meta = { ...(d.outputConfig.meta ?? {}) }
      if (val === '') delete meta[key]
      else meta[key] = val
      return { ...n, data: { ...d, outputConfig: { ...d.outputConfig, meta } } }
    }))
    dirty.current = true
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedState = selectedNodeId ? stepStates[selectedNodeId] : undefined

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <input
          value={editedName}
          onChange={(e) => { setEditedName(e.target.value); dirty.current = true }}
          className="bg-transparent text-base font-medium text-slate-200 outline-none border-b border-transparent hover:border-white/10 focus:border-indigo-500/50 px-1"
        />
        {runStatus && (
          <Badge variant={
            runStatus === 'running' ? 'warning' :
            runStatus === 'completed' ? 'success' :
            runStatus === 'failed' ? 'error' : 'muted'
          }>{runStatus}</Badge>
        )}
        <select
          value={projectId ?? ''}
          onChange={(e) => { setProjectId(e.target.value || null); dirty.current = true }}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
          title="Project context for all agents in this workflow"
        >
          <option value="">No project (use each agent's own)</option>
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>📁 {p.name}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2 items-center relative">
          {lastRun && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
                lastRun.status === 'completed' ? 'border-green-500/30 text-green-400 bg-green-500/5' :
                lastRun.status === 'failed' ? 'border-red-500/30 text-red-400 bg-red-500/5' :
                lastRun.status === 'running' ? 'border-amber-500/30 text-amber-300 bg-amber-500/5' :
                'border-white/10 text-slate-500 bg-white/5'
              }`}
              title={`Last run ${lastRun.status} at ${new Date(lastRun.completedAt ?? lastRun.startedAt ?? 0).toLocaleString()}`}
            >
              {lastRun.status === 'completed' ? '✓' : lastRun.status === 'failed' ? '✗' : '•'}
              <span className="opacity-80">last {formatRelative(lastRun.completedAt ?? lastRun.startedAt ?? 0)}</span>
            </span>
          )}
          {nextFire && trigger?.enabled && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-cyan-500/30 text-cyan-300 bg-cyan-500/5"
              title={`Next scheduled fire at ${new Date(nextFire).toLocaleString()}`}
            >
              ↻ next {formatRelative(nextFire)}
            </span>
          )}
          <button
            onClick={() => setShowSchedule((s) => !s)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors cursor-pointer ${
              trigger?.enabled
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
            }`}
            title={trigger?.enabled ? `Trigger: ${trigger.type}` : 'Add a trigger (cron, file watch, webhook)'}
          >
            <Clock size={11} />
            {triggerSummary(trigger)}
          </button>
          {showSchedule && (
            <SchedulePopover
              trigger={trigger}
              workflowId={workflowId}
              onChange={(t) => { setTrigger(t); triggerDirty.current = true }}
              onClose={() => setShowSchedule(false)}
            />
          )}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-white/10 text-slate-400" title="Per-run cost cap (USD). Leave blank for no cap.">
            <span>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={perRunBudget}
              onChange={(e) => { setPerRunBudget(e.target.value); budgetDirty.current = true }}
              placeholder="cap"
              className="w-12 bg-transparent outline-none text-slate-200 placeholder:text-slate-600"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)}>
            <History size={12} /> Runs
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="success" onClick={handleRun} disabled={running || nodes.length === 0}>
            <Play size={12} /> {running ? 'Starting...' : 'Run'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {/* Runtime input row — value passed as {{input}} to root nodes */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 flex-shrink-0 bg-white/2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 flex-shrink-0">
          Input
        </span>
        <input
          value={runtimeInput}
          onChange={(e) => setRuntimeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !running && nodes.length > 0) handleRun() }}
          placeholder='Optional — use {{input}} in any root node to reference this (e.g. PR URL, file path, question)'
          className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
        />
      </div>

      <div
        className="flex-1 grid min-h-0"
        style={{ gridTemplateColumns: (selectedNodeId || selectedEdgeId) ? '192px minmax(0, 1fr) 288px' : '192px minmax(0, 1fr)' }}
      >
        {/* Agents palette */}
        <div className="border-r border-white/5 bg-[#0d0d14] overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-3 pb-1.5">Add agent step</p>
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => handleAddAgent(a)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              <Bot size={11} className="text-indigo-400 flex-shrink-0" />
              <span className="truncate">{a.name}</span>
              <ChevronRight size={11} className="ml-auto text-slate-600" />
            </button>
          ))}
          {agents.length === 0 && (
            <p className="text-xs text-slate-600 px-3 py-4 text-center">No agents — create one first.</p>
          )}
          <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-4 pb-1.5">Other steps</p>
          <button
            onClick={handleAddApproval}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
          >
            <span className="text-amber-400 flex-shrink-0">⏸</span>
            <span className="truncate">Approval gate</span>
            <ChevronRight size={11} className="ml-auto text-slate-600" />
          </button>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-4 pb-1.5">Output</p>
          {(['slack', 'discord', 'webhook', 'file'] as const).map((kind) => {
            const m = OUTPUT_KIND_META[kind]
            return (
              <button
                key={kind}
                onClick={() => handleAddOutput(kind)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
              >
                <span className="flex-shrink-0">{m.icon}</span>
                <span className="truncate">{m.label}</span>
                <ChevronRight size={11} className="ml-auto text-slate-600" />
              </button>
            )
          })}
        </div>

        {/* Canvas */}
        <div className="bg-[#0a0a0f] min-w-0 min-h-0 relative">
          <ReactFlow
            style={{ width: '100%', height: '100%' }}
            nodes={nodesWithState}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null) }}
            onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null) }}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={16} />
            <Controls className="!bg-[#13131a] !border-white/10" />
            <MiniMap className="!bg-[#13131a] !border-white/10" maskColor="rgba(0,0,0,0.6)" nodeColor="#6366f1" />
          </ReactFlow>
          <FinalOutputPanel
            workflowName={editedName}
            nodes={nodes.map((n) => ({ id: n.id, agentName: n.data.agentName }))}
            edges={edges.map((e) => ({ source: e.source, target: e.target }))}
            stepStates={stepStates}
            runStatus={runStatus}
          />
        </div>

        {/* Edge inspector — appears when an edge is clicked */}
        {selectedEdgeId && !selectedNode && (
          <EdgeInspector
            edge={edges.find((e) => e.id === selectedEdgeId)!}
            onChange={(c) => updateEdgeCondition(selectedEdgeId, c)}
            onDelete={() => {
              setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId))
              setSelectedEdgeId(null)
              dirty.current = true
            }}
            onClose={() => setSelectedEdgeId(null)}
          />
        )}

        {/* Inspector */}
        {selectedNode && (
          <div className="border-l border-white/5 bg-[#0d0d14] flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 py-3 border-b border-white/5 flex items-center gap-2">
              {selectedNode.type === 'approval' ? (
                <span className="text-amber-400">⏸</span>
              ) : selectedNode.type === 'output' ? (
                <span>{OUTPUT_KIND_META[(selectedNode.data as OutputNodeData).outputConfig.kind]?.icon ?? '📤'}</span>
              ) : (
                <Bot size={14} className="text-indigo-400" />
              )}
              <span className="text-sm font-medium text-slate-200 truncate">
                {selectedNode.type === 'approval'
                  ? 'Approval gate'
                  : selectedNode.type === 'output'
                    ? `${OUTPUT_KIND_META[(selectedNode.data as OutputNodeData).outputConfig.kind]?.label ?? 'Output'} output`
                    : (selectedNode.data as AgentNodeData).agentName}
              </span>
              <Button size="sm" variant="ghost" onClick={handleDeleteSelected} className="ml-auto">
                <Trash2 size={11} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedNode.type === 'approval' ? (
                <div>
                  <label className="text-[10px] uppercase text-slate-500 block mb-1">Approval message</label>
                  <textarea
                    className="w-full h-32 bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 outline-none focus:border-indigo-500/50 resize-none placeholder:text-slate-600"
                    value={(selectedNode.data as ApprovalNodeData).approvalMessage}
                    onChange={(e) => updateSelectedApprovalMessage(e.target.value)}
                    placeholder="Message shown to the human reviewer. Use {{input}} to reference upstream output."
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Workflow pauses here until you click Approve or Reject. On approve, downstream nodes receive the upstream output as <code className="text-indigo-400">{'{{input}}'}</code>.
                  </p>
                </div>
              ) : selectedNode.type === 'output' ? (
                <OutputNodeInspector
                  data={selectedNode.data as OutputNodeData}
                  onKindChange={(kind) => updateSelectedOutputConfig({ kind })}
                  onTargetChange={(target) => updateSelectedOutputConfig({ target })}
                  onTemplateChange={(template) => updateSelectedOutputConfig({ template: template || undefined })}
                  onMetaChange={updateSelectedOutputMeta}
                />
              ) : (
                <div>
                  <label className="text-[10px] uppercase text-slate-500 block mb-1">Prompt template</label>
                  <textarea
                    className="w-full h-32 bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 outline-none focus:border-indigo-500/50 resize-none placeholder:text-slate-600"
                    value={(selectedNode.data as AgentNodeData).promptTemplate}
                    onChange={(e) => updateSelectedPrompt(e.target.value)}
                    placeholder="Enter prompt. Use {{input}} to reference output from previous step(s)."
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Use <code className="text-indigo-400">{'{{input}}'}</code> to reference previous step output
                  </p>
                </div>
              )}

              {selectedState && (
                <div className="border-t border-white/5 pt-3">
                  <label className="text-[10px] uppercase text-slate-500 block mb-1">Last run</label>
                  <p className="text-[11px] text-slate-300">Status: <span className={
                    selectedState.status === 'running' ? 'text-amber-400' :
                    selectedState.status === 'done' ? 'text-green-400' :
                    selectedState.status === 'failed' ? 'text-red-400' : 'text-slate-400'
                  }>{selectedState.status}</span></p>
                  {latestRunId && selectedNodeId && (
                    <button
                      onClick={async () => {
                        await window.api.workflows.resumeFrom(latestRunId, selectedNodeId)
                      }}
                      className="mt-1 px-2 py-0.5 rounded text-[10px] border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 cursor-pointer"
                    >
                      ↻ Re-run from this step
                    </button>
                  )}
                  {selectedState.costUsd != null && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ${selectedState.costUsd.toFixed(4)} · {(selectedState.inputTokens ?? 0) + (selectedState.outputTokens ?? 0)} tokens
                    </p>
                  )}
                  {selectedState.output && (
                    <div className="mt-2 p-2 bg-white/3 border border-white/5 rounded max-h-72 overflow-y-auto">
                      <p className="text-[10px] text-slate-500 mb-1">Output</p>
                      <Markdown>{selectedState.output}</Markdown>
                    </div>
                  )}
                  {selectedState.error && (
                    <p className="text-[11px] text-red-400 mt-1">{selectedState.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showHistory && (
        <RunHistoryPanel
          workflowId={workflowId}
          nodeNames={Object.fromEntries(nodes.map((n) => {
            if (n.type === 'approval') return [n.id, 'Approval gate']
            if (n.type === 'output') {
              const cfg = (n.data as OutputNodeData).outputConfig
              return [n.id, `${OUTPUT_KIND_META[cfg.kind]?.label ?? 'Output'} output`]
            }
            return [n.id, (n.data as AgentNodeData).agentName ?? 'Agent']
          }))}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}
