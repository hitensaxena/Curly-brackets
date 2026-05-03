import { z } from 'zod'
import { TableSchema } from '../schemas'

type Props = z.infer<typeof TableSchema>

export function GenUITable({ title, columns, rows }: Props) {
  return (
    <div className="my-2 rounded-md border border-white/10 bg-white/3 overflow-hidden">
      {title && (
        <div className="px-3 py-1.5 border-b border-white/5">
          <p className="text-[11px] font-medium text-slate-300">{title}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-white/5">
              {columns.map((c, i) => (
                <th key={i} className="text-left px-3 py-1.5 font-semibold text-slate-300">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-white/5 hover:bg-white/3">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 text-slate-200 font-mono">
                    {cell == null ? <span className="text-slate-600">—</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
