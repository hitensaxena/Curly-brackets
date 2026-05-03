import { useEffect, useState } from 'react'
import { Download, RefreshCw, X, Sparkles } from 'lucide-react'
import { Button } from './ui/button'

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'none'

interface Status {
  phase: Phase
  version?: string
  releaseNotes?: string
  releaseDate?: string
  percent?: number
  error?: string
}

/**
 * Floating banner that surfaces available app updates.
 * - Shows when an update is available, downloading, or ready to install
 * - Auto-hides on `none`/`idle`/`error` (errors logged to console only)
 * - Dismissible per-session via the X button
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const off = window.api.on('updater:status', (event: unknown) => {
      const s = event as Status
      setStatus(s)
      // New update arriving → un-dismiss
      if (s.phase === 'available' || s.phase === 'ready') setDismissed(false)
    })
    return () => off()
  }, [])

  if (dismissed) return null
  if (status.phase === 'idle' || status.phase === 'none' || status.phase === 'checking' || status.phase === 'error') return null

  const isReady = status.phase === 'ready'
  const isDownloading = status.phase === 'downloading'

  return (
    <div className="fixed bottom-12 right-4 z-[80] w-[360px] rounded-lg border border-indigo-500/30 bg-[#0d0d14]/95 backdrop-blur shadow-2xl">
      <div className="px-3 py-2.5 flex items-start gap-2">
        <Sparkles size={14} className="text-indigo-300 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-100">
            {isReady && `Update v${status.version} is ready`}
            {isDownloading && `Downloading v${status.version}…`}
            {status.phase === 'available' && `Update v${status.version} available`}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isReady && 'Restart Curly Brackets to apply the update.'}
            {isDownloading && (
              <>
                {status.percent ?? 0}% downloaded
                <span className="block w-full h-1 bg-white/5 rounded overflow-hidden mt-1">
                  <span
                    className="block h-full bg-indigo-500 transition-all"
                    style={{ width: `${status.percent ?? 0}%` }}
                  />
                </span>
              </>
            )}
            {status.phase === 'available' && 'Will download in the background.'}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-500 hover:text-white flex-shrink-0 cursor-pointer"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {isReady && (
        <div className="border-t border-white/5 px-3 py-2 flex items-center justify-between">
          <button
            onClick={() => window.api.updater.openReleases()}
            className="text-[10px] text-slate-500 hover:text-indigo-300 cursor-pointer"
          >
            Release notes ↗
          </button>
          <Button size="sm" onClick={() => window.api.updater.install()}>
            <RefreshCw size={11} /> Restart & install
          </Button>
        </div>
      )}

      {status.phase === 'available' && (
        <div className="border-t border-white/5 px-3 py-2 flex items-center justify-between">
          <button
            onClick={() => window.api.updater.openReleases()}
            className="text-[10px] text-slate-500 hover:text-indigo-300 cursor-pointer"
          >
            What's new?
          </button>
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Download size={10} /> downloading
          </span>
        </div>
      )}
    </div>
  )
}
