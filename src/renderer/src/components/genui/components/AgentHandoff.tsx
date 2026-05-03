import { z } from 'zod'
import { Bot, ArrowRight } from 'lucide-react'
import { AgentHandoffSchema, GenUIAction } from '../schemas'
import { Button } from '../../ui/button'

type Props = z.infer<typeof AgentHandoffSchema> & { onAction?: (a: GenUIAction) => void }

export function GenUIAgentHandoff({ title, description, agentName, prompt, onAction }: Props) {
  return (
    <div className="my-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Bot size={12} className="text-amber-400" />
        <span className="text-[11px] font-medium text-amber-300">{title ?? `Hand off to ${agentName}`}</span>
      </div>
      {description && <p className="text-[11px] text-slate-300 mb-2">{description}</p>}
      <div className="rounded bg-black/20 border border-white/5 px-2 py-1.5 mb-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Suggested prompt</p>
        <p className="text-[11px] text-slate-300 italic">{prompt}</p>
      </div>
      <Button
        size="sm"
        onClick={() => onAction?.({ sendMessage: `@${agentName} ${prompt}` })}
        disabled={!onAction}
      >
        <ArrowRight size={11} /> Hand off to {agentName}
      </Button>
    </div>
  )
}
