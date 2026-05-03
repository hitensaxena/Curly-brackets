import { z } from 'zod'
import { FileText } from 'lucide-react'
import { FilePickerSchema, GenUIAction } from '../schemas'

type Props = z.infer<typeof FilePickerSchema> & { onAction?: (a: GenUIAction) => void }

export function GenUIFilePicker({ title, prompt, files, followUpTemplate, onAction }: Props) {
  return (
    <div className="my-2 rounded-md border border-white/10 bg-white/3 p-3">
      {title && <p className="text-[11px] font-medium text-slate-300 mb-1">{title}</p>}
      {prompt && <p className="text-[11px] text-slate-400 mb-2">{prompt}</p>}
      <ul className="space-y-1">
        {files.map((f, i) => (
          <li key={i}>
            <button
              onClick={() => onAction?.({ sendMessage: followUpTemplate.replace('{path}', f.path) })}
              disabled={!onAction}
              className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-200 truncate">{f.label ?? f.path}</p>
                <p className="text-[10px] text-slate-600 font-mono truncate">{f.path}</p>
                {f.description && <p className="text-[10px] text-slate-500 mt-0.5">{f.description}</p>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
