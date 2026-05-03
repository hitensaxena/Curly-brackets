import { z } from 'zod'
import { DiffSchema } from '../schemas'

type Props = z.infer<typeof DiffSchema>

function colorForLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return 'text-slate-500'
  if (line.startsWith('+')) return 'text-green-300 bg-green-500/10'
  if (line.startsWith('-')) return 'text-red-300 bg-red-500/10'
  return 'text-slate-300'
}

export function GenUIDiff({ title, unified, before, after, language }: Props) {
  const text = unified ?? buildSimpleDiff(before ?? '', after ?? '')
  const lines = text.split('\n')

  return (
    <div className="my-2 rounded-md border border-white/10 bg-black/40 overflow-hidden">
      {(title || language) && (
        <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
          {title && <p className="text-[11px] font-medium text-slate-300">{title}</p>}
          {language && <span className="text-[10px] text-slate-600 font-mono">{language}</span>}
        </div>
      )}
      <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto">
        {lines.map((line, i) => (
          <div key={i} className={`px-3 ${colorForLine(line)}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}

// Tiny line-level "diff" — model usually sends unified, but if it sends before/after we show them stacked.
function buildSimpleDiff(before: string, after: string): string {
  const beforeLines = before.split('\n').map((l) => `- ${l}`)
  const afterLines = after.split('\n').map((l) => `+ ${l}`)
  return [...beforeLines, ...afterLines].join('\n')
}
