import { z } from 'zod'

// ── Action shape (what interactive components dispatch back to chat) ─────────
export const ActionSchema = z.object({
  // Send a follow-up user message in the same conversation
  sendMessage: z.string().optional(),
  // Invoke an agent for a single turn (renders amber bubble like @-mention)
  invokeAgent: z.string().optional(),
  // Open another conversation (future)
  openConversation: z.string().optional()
}).strict().partial()

export type GenUIAction = z.infer<typeof ActionSchema>

// ── Component schemas ────────────────────────────────────────────────────────

export const TableSchema = z.object({
  title: z.string().optional(),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
})

export const ChartSchema = z.object({
  title: z.string().optional(),
  variant: z.enum(['bar', 'line', 'pie', 'area']).default('bar'),
  xKey: z.string().optional(),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  series: z.array(z.object({
    key: z.string(),
    label: z.string().optional(),
    color: z.string().optional()
  })).optional()
})

export const PlanTreeSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    id: z.string(),
    label: z.string(),
    status: z.enum(['todo', 'in_progress', 'done', 'skipped']).default('todo'),
    children: z.array(z.lazy((): z.ZodTypeAny => PlanTreeNodeSchema)).optional()
  }))
})
export const PlanTreeNodeSchema: z.ZodTypeAny = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['todo', 'in_progress', 'done', 'skipped']).default('todo'),
  children: z.array(z.lazy((): z.ZodTypeAny => PlanTreeNodeSchema)).optional()
})

export const DiffSchema = z.object({
  title: z.string().optional(),
  // Either provide unified diff text OR before/after blobs
  unified: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  language: z.string().optional()
})

export const FilePickerSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  files: z.array(z.object({
    path: z.string(),
    label: z.string().optional(),
    description: z.string().optional()
  })).min(1),
  // Free-form follow-up template; {path} is substituted on click
  followUpTemplate: z.string().default('Use this file: {path}')
})

export const FormSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  submitLabel: z.string().default('Submit'),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'textarea', 'number', 'select', 'checkbox']).default('text'),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.union([
      z.string(),
      z.object({ value: z.string(), label: z.string() })
    ])).optional()
  })).min(1)
})

export const AgentHandoffSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  agentName: z.string(),
  prompt: z.string()
})

// Map of all known schemas — used to validate before render
export const REGISTRY_SCHEMAS = {
  table: TableSchema,
  chart: ChartSchema,
  'plan-tree': PlanTreeSchema,
  diff: DiffSchema,
  'file-picker': FilePickerSchema,
  form: FormSchema,
  'agent-handoff': AgentHandoffSchema
} as const

export type GenUIType = keyof typeof REGISTRY_SCHEMAS
export const GENUI_TYPES = Object.keys(REGISTRY_SCHEMAS) as GenUIType[]
