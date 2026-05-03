import { ComponentType } from 'react'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import { REGISTRY_SCHEMAS, GenUIType, GenUIAction } from './schemas'
import { GenUITable } from './components/Table'
import { GenUIChart } from './components/Chart'
import { GenUIPlanTree } from './components/PlanTree'
import { GenUIDiff } from './components/Diff'
import { GenUIFilePicker } from './components/FilePicker'
import { GenUIForm } from './components/Form'
import { GenUIAgentHandoff } from './components/AgentHandoff'

// Each registered component receives the validated schema output plus an optional onAction
type RegisteredComponent = ComponentType<Record<string, unknown> & { onAction?: (a: GenUIAction) => void }>

const REGISTRY: Record<GenUIType, RegisteredComponent> = {
  table: GenUITable as RegisteredComponent,
  chart: GenUIChart as RegisteredComponent,
  'plan-tree': GenUIPlanTree as RegisteredComponent,
  diff: GenUIDiff as RegisteredComponent,
  'file-picker': GenUIFilePicker as RegisteredComponent,
  form: GenUIForm as RegisteredComponent,
  'agent-handoff': GenUIAgentHandoff as RegisteredComponent
}

export function GenUIBlock({
  type, data, raw, error, onAction
}: {
  type: string
  data: unknown
  raw: string
  error?: string
  onAction?: (a: GenUIAction) => void
}) {
  // Unknown type — render fallback so the user still sees the JSON
  if (!(type in REGISTRY)) {
    return <ErrorBlock title={`Unknown ui:${type} component`} body={raw} />
  }
  // JSON parse already failed in the parser — show the raw text + error
  if (error) {
    return <ErrorBlock title={`ui:${type} JSON parse error: ${error}`} body={raw} />
  }
  const schema = REGISTRY_SCHEMAS[type as GenUIType] as z.ZodType
  const result = schema.safeParse(data)
  if (!result.success) {
    return (
      <ErrorBlock
        title={`ui:${type} schema validation failed`}
        body={`${result.error.message}\n\n${raw}`}
      />
    )
  }
  const Component = REGISTRY[type as GenUIType]
  return <Component {...(result.data as Record<string, unknown>)} onAction={onAction} />
}

function ErrorBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="my-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle size={12} className="text-amber-400" />
        <p className="text-[11px] font-medium text-amber-300">{title}</p>
      </div>
      <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap">{body}</pre>
    </div>
  )
}
