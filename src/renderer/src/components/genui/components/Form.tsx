import { useState } from 'react'
import { z } from 'zod'
import { FormSchema, GenUIAction } from '../schemas'
import { Button } from '../../ui/button'

type Props = z.infer<typeof FormSchema> & { onAction?: (a: GenUIAction) => void }
type FieldValue = string | number | boolean

export function GenUIForm({ title, prompt, submitLabel, fields, onAction }: Props) {
  const initial = Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.type === 'checkbox' ? false : f.type === 'number' ? 0 : ''
    ])
  ) as Record<string, FieldValue>
  const [values, setValues] = useState<Record<string, FieldValue>>(initial)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    const payload = fields.map((f) => `**${f.label}**: ${values[f.key]}`).join('\n')
    onAction?.({ sendMessage: payload })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="my-2 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-3">
        <p className="text-[11px] text-indigo-300">✓ Submitted</p>
      </div>
    )
  }

  return (
    <div className="my-2 rounded-md border border-white/10 bg-white/3 p-3">
      {title && <p className="text-[11px] font-medium text-slate-300 mb-1">{title}</p>}
      {prompt && <p className="text-[11px] text-slate-400 mb-3">{prompt}</p>}
      <div className="space-y-2.5">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[10px] text-slate-500 mb-0.5 block">
              {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {renderField(f, values[f.key], (v) => setValues((curr) => ({ ...curr, [f.key]: v })))}
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={handleSubmit} disabled={!onAction}>{submitLabel}</Button>
      </div>
    </div>
  )
}

function renderField(
  field: Props['fields'][number],
  value: FieldValue,
  onChange: (v: FieldValue) => void
): React.ReactNode {
  const cls = 'w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500/50'
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${cls} resize-none`}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={Number(value)}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          placeholder={field.placeholder}
          className={cls}
        />
      )
    case 'select': {
      const options = (field.options ?? []).map((o) =>
        typeof o === 'string' ? { value: o, label: o } : o
      )
      return (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={`${cls} cursor-pointer`}>
          <option value="" disabled>Choose…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5 cursor-pointer"
        />
      )
    default:
      return (
        <input
          type="text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      )
  }
}
