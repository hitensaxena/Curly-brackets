import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, MessageSquare, Pause } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info' | 'message' | 'approval'

interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  duration?: number
}

interface ToastEvent extends Toast {
  /** Internal flag set when the toast should fade out. */
  leaving?: boolean
}

let globalQueue: ((t: Toast) => void) | null = null

export function pushToast(t: Omit<Toast, 'id'> & { id?: string }) {
  if (!globalQueue) return
  globalQueue({ id: t.id ?? Math.random().toString(36).slice(2), ...t })
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle size={14} className="text-green-400" />,
  error: <AlertCircle size={14} className="text-red-400" />,
  info: <AlertCircle size={14} className="text-slate-400" />,
  message: <MessageSquare size={14} className="text-indigo-400" />,
  approval: <Pause size={14} className="text-amber-400" />
}

const BORDERS: Record<ToastKind, string> = {
  success: 'border-green-500/40 bg-green-500/5',
  error: 'border-red-500/40 bg-red-500/5',
  info: 'border-white/15 bg-white/5',
  message: 'border-indigo-500/40 bg-indigo-500/5',
  approval: 'border-amber-500/40 bg-amber-500/5'
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastEvent[]>([])

  useEffect(() => {
    globalQueue = (t) => {
      setToasts((curr) => [...curr, t])
      const dur = t.duration ?? 5000
      setTimeout(() => {
        setToasts((curr) => curr.map((x) => (x.id === t.id ? { ...x, leaving: true } : x)))
        setTimeout(() => setToasts((curr) => curr.filter((x) => x.id !== t.id)), 200)
      }, dur)
    }
    return () => { globalQueue = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto min-w-[280px] max-w-sm flex items-start gap-2.5 px-3 py-2.5 rounded-lg border backdrop-blur-sm shadow-lg transition-all duration-200 ${BORDERS[t.kind]} ${
            t.leaving ? 'opacity-0 translate-x-4' : 'opacity-100'
          }`}
        >
          <div className="mt-0.5 flex-shrink-0">{ICONS[t.kind]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200">{t.title}</p>
            {t.body && <p className="text-[11px] text-slate-400 mt-0.5 break-words">{t.body}</p>}
          </div>
          <button
            onClick={() => setToasts((curr) => curr.filter((x) => x.id !== t.id))}
            className="text-slate-500 hover:text-white text-xs leading-none cursor-pointer flex-shrink-0"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
