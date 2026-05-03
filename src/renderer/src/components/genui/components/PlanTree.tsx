import { z } from 'zod'
import { CheckCircle2, Circle, Loader2, MinusCircle } from 'lucide-react'
import { PlanTreeSchema } from '../schemas'

type Props = z.infer<typeof PlanTreeSchema>

// Hand-roll the node type because zod can't infer the lazy/recursive children
interface Node {
  id: string
  label: string
  status: 'todo' | 'in_progress' | 'done' | 'skipped'
  children?: Node[]
}

const STATUS_META: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  todo: { icon: Circle, color: 'text-slate-500', label: 'todo' },
  in_progress: { icon: Loader2, color: 'text-indigo-400 animate-spin', label: 'in progress' },
  done: { icon: CheckCircle2, color: 'text-green-400', label: 'done' },
  skipped: { icon: MinusCircle, color: 'text-slate-600 line-through', label: 'skipped' }
}

function NodeRow({ node, depth }: { node: Node; depth: number }) {
  const meta = STATUS_META[node.status] ?? STATUS_META.todo
  const Icon = meta.icon
  return (
    <>
      <li className="flex items-start gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
        <Icon size={12} className={`flex-shrink-0 mt-0.5 ${meta.color}`} />
        <span className={`text-[11px] ${node.status === 'skipped' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
          {node.label}
        </span>
      </li>
      {node.children && node.children.map((c, i) => (
        <NodeRow key={c.id ?? i} node={c} depth={depth + 1} />
      ))}
    </>
  )
}

export function GenUIPlanTree({ title, items }: Props) {
  return (
    <div className="my-2 rounded-md border border-white/10 bg-white/3 p-3">
      {title && <p className="text-[11px] font-medium text-slate-300 mb-2">{title}</p>}
      <ul className="space-y-0">
        {(items as Node[]).map((node, i) => <NodeRow key={node.id ?? i} node={node} depth={0} />)}
      </ul>
    </div>
  )
}
