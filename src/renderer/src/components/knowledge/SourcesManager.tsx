import { useEffect, useState } from 'react'
import { FolderOpen, FileText, BookOpen, Database, Plus, RefreshCw, Trash2, Loader2, AlertCircle, Globe, Code2, Pencil } from 'lucide-react'
import { Button } from '../ui/button'
import type { KnowledgeSourceRow } from '../../../../preload/index.d'

type SourceType = 'obsidian' | 'folder' | 'pdf' | 'pdfFolder' | 'url' | 'codebase'
type Scope = 'global' | 'project'
type PickKind = 'directory' | 'file' | 'url'

const TYPE_META: Record<SourceType, { label: string; icon: typeof FolderOpen; helper: string; pickKind: PickKind; defaultName: string }> = {
  obsidian:  { label: 'Obsidian Vault', icon: BookOpen,   helper: 'A folder containing .md notes (with frontmatter support)', pickKind: 'directory', defaultName: 'Obsidian Vault' },
  folder:    { label: 'Folder',         icon: FolderOpen, helper: 'Any folder of .md / .txt files',                            pickKind: 'directory', defaultName: 'Folder' },
  pdf:       { label: 'PDF File',       icon: FileText,   helper: 'A single PDF document',                                     pickKind: 'file',      defaultName: 'PDF' },
  pdfFolder: { label: 'PDF Folder',     icon: FileText,   helper: 'A folder containing PDF documents',                         pickKind: 'directory', defaultName: 'PDF Folder' },
  url:       { label: 'Web Page',       icon: Globe,      helper: 'Fetch + readability-extract a single URL (manual re-index)', pickKind: 'url',       defaultName: 'Web Page' },
  codebase:  { label: 'Codebase',       icon: Code2,      helper: 'Source-code folder; ignores .git/node_modules/dist/etc.',    pickKind: 'directory', defaultName: 'Codebase' }
}

export function SourcesManager({ scope, projectId }: { scope: Scope; projectId?: string | null }) {
  const [sources, setSources] = useState<KnowledgeSourceRow[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<KnowledgeSourceRow | null>(null)
  const [reindexing, setReindexing] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, { current: number; total: number; file: string }>>({})

  const refresh = async () => {
    if (!window.api.knowledge?.sources) return
    const list = await window.api.knowledge.sources.list({ scope, projectId: scope === 'project' ? projectId : undefined })
    setSources(list)
  }

  useEffect(() => { refresh() }, [scope, projectId])

  useEffect(() => {
    const offUpdated = window.api.on('knowledge:sources:updated', () => refresh())
    const offProgress = window.api.on('knowledge:index:progress', (event: unknown) => {
      const e = event as { sourceId: string; current: number; total: number; file: string }
      setProgress((p) => ({ ...p, [e.sourceId]: { current: e.current, total: e.total, file: e.file } }))
    })
    const offComplete = window.api.on('knowledge:index:complete', (event: unknown) => {
      const e = event as { sourceId: string; indexed: number; failed: number; firstError?: string }
      setProgress((p) => {
        const next = { ...p }
        delete next[e.sourceId]
        return next
      })
      setReindexing((r) => (r === e.sourceId ? null : r))
      // Only alert when nothing got indexed AND we have an error to show
      if (e.indexed === 0 && e.failed > 0 && e.firstError) {
        // Use a soft async alert so we don't block React render
        setTimeout(() => alert(`Indexing failed.\n\nFirst error:\n${e.firstError}`), 50)
      }
      refresh()
    })
    return () => { offUpdated(); offProgress(); offComplete() }
  }, [scope, projectId])

  const handleReindex = async (id: string) => {
    setReindexing(id)
    try {
      await window.api.knowledge.sources.reindex(id)
    } catch (err) {
      console.error('reindex failed', err)
      setReindexing(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this source and its indexed chunks? This cannot be undone.')) return
    await window.api.knowledge.sources.delete(id)
    refresh()
  }

  const toggleEnabled = async (s: KnowledgeSourceRow) => {
    await window.api.knowledge.sources.update(s.id, { enabled: !s.enabled })
    refresh()
  }

  const enabledSources = sources.filter((s) => s.enabled)
  const reindexAll = async () => {
    for (const s of enabledSources) {
      try { await window.api.knowledge.sources.reindex(s.id) }
      catch (err) { console.error('reindex failed', s.id, err) }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {sources.length === 0
            ? 'No sources yet.'
            : `${sources.length} source${sources.length === 1 ? '' : 's'} · ${sources.reduce((s, x) => s + x.totalChunks, 0)} chunks`}
        </p>
        <div className="flex items-center gap-2">
          {enabledSources.length > 0 && (
            <Button size="sm" variant="outline" onClick={reindexAll} title="Re-index every enabled source">
              <RefreshCw size={11} /> Re-index all
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={11} /> Add source
          </Button>
        </div>
      </div>

      {sources.length === 0 && (
        <div className="rounded-md border border-dashed border-white/10 p-4 text-center">
          <Database size={20} className="text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-500">
            Add an Obsidian vault, a folder of notes, or PDFs to make them searchable in chat.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {sources.map((s) => {
          const Icon = TYPE_META[s.type]?.icon ?? Database
          const prog = progress[s.id]
          const isRe = reindexing === s.id || s.status === 'indexing'
          return (
            <li key={s.id} className="rounded-md border border-white/10 bg-white/3 p-3">
              <div className="flex items-start gap-2">
                <Icon size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200 truncate">{s.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-600">{TYPE_META[s.type]?.label ?? s.type}</span>
                    {!s.enabled && <span className="text-[10px] text-amber-400">disabled</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {s.type === 'url'
                      ? ((s.config as unknown as { url?: string }).url ?? '—')
                      : (s.config?.path ?? '—')}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                    <span>{s.totalChunks} chunks</span>
                    {s.lastIndexedAt && <span>· last indexed {relativeTime(s.lastIndexedAt)}</span>}
                  </div>
                  {prog && (
                    <p className="text-[11px] text-indigo-400 mt-1">
                      Indexing {prog.current}/{prog.total} — <span className="font-mono">{prog.file.split('/').slice(-2).join('/')}</span>
                    </p>
                  )}
                  {s.status === 'error' && s.errorMessage && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} /> {s.errorMessage}
                    </p>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input type="checkbox" checked={s.enabled} onChange={() => toggleEnabled(s)} className="sr-only peer" />
                  <div className="w-7 h-4 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform peer-checked:after:translate-x-3" />
                </label>
                <button
                  onClick={() => setEditing(s)}
                  className="text-slate-500 hover:text-indigo-300 cursor-pointer"
                  title="Edit source"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => handleReindex(s.id)}
                  disabled={isRe}
                  className="text-slate-500 hover:text-indigo-300 disabled:opacity-50 cursor-pointer"
                  title="Re-index this source"
                >
                  {isRe ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-slate-500 hover:text-red-400 cursor-pointer"
                  title="Delete source"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {showAdd && (
        <SourceModal
          scope={scope}
          projectId={projectId ?? null}
          onClose={() => setShowAdd(false)}
          onSaved={async (id, isNew) => {
            setShowAdd(false)
            await refresh()
            if (isNew) handleReindex(id)
          }}
        />
      )}

      {editing && (
        <SourceModal
          scope={scope}
          projectId={projectId ?? null}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null)
            await refresh()
            handleReindex(id)
          }}
        />
      )}
    </div>
  )
}

function SourceModal({
  scope, projectId, existing, onClose, onSaved
}: {
  scope: Scope
  projectId: string | null
  existing?: KnowledgeSourceRow
  onClose: () => void
  onSaved: (id: string, isNew: boolean) => void
}) {
  const isEdit = !!existing
  const [type, setType] = useState<SourceType>(existing?.type ?? 'obsidian')
  const [name, setName] = useState(existing?.name ?? '')
  const [path, setPath] = useState(
    existing
      ? (existing.type === 'url' ? (existing.config.url ?? '') : (existing.config.path ?? ''))
      : ''
  )
  const [busy, setBusy] = useState(false)
  const meta = TYPE_META[type]

  const pickPath = async () => {
    if (meta.pickKind === 'url') return // URL is typed, not picked
    const p = meta.pickKind === 'directory'
      ? await window.api.dialog.pickDirectory({ title: `Select ${meta.label}` })
      : await window.api.dialog.pickFile({
          title: `Select ${meta.label}`,
          filters: type === 'pdf' ? [{ name: 'PDF', extensions: ['pdf'] }] : undefined
        })
    if (p) {
      setPath(p)
      if (!name) setName(p.split('/').pop() || meta.defaultName)
    }
  }

  const handleSave = async () => {
    if (!path.trim() || !name.trim()) return
    if (type === 'url') {
      try { new URL(path.trim()) }
      catch {
        alert('Please enter a valid URL (including http:// or https://).')
        return
      }
    }
    setBusy(true)
    try {
      const config = type === 'url' ? { url: path.trim() } : { path: path.trim() }
      if (isEdit && existing) {
        await window.api.knowledge.sources.update(existing.id, {
          name: name.trim(),
          config
        })
        onSaved(existing.id, false)
      } else {
        const created = await window.api.knowledge.sources.create({
          name: name.trim(),
          scope,
          projectId: scope === 'project' ? projectId : undefined,
          type,
          config,
          enabled: true
        })
        onSaved(created.id, true)
      }
    } catch (err) {
      alert(`Failed to save source: ${(err as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#0d0d14] border border-white/10 rounded-lg p-5 w-[520px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-slate-200 mb-3">{isEdit ? 'Edit knowledge source' : 'Add knowledge source'}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Type {isEdit && <span className="text-slate-600">· locked when editing</span>}</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_META) as SourceType[]).map((t) => {
                const m = TYPE_META[t]
                const Icon = m.icon
                const disabled = isEdit && t !== type
                return (
                  <button
                    key={t}
                    onClick={() => { if (!isEdit) { setType(t); setPath('') } }}
                    disabled={disabled}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${
                      type === t
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                        : 'border-white/10 text-slate-400 hover:border-white/20'
                    } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Icon size={12} /> <span className="truncate">{m.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-600 mt-1">{meta.helper}</p>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={meta.defaultName}
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              {meta.pickKind === 'url' ? 'URL' : meta.pickKind === 'directory' ? 'Folder' : 'File'}
            </label>
            {meta.pickKind === 'url' ? (
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
              />
            ) : (
              <div className="flex items-center gap-2">
                <code className="text-[11px] text-slate-400 font-mono bg-white/5 border border-white/10 rounded px-2 py-1.5 flex-1 truncate">
                  {path || 'Not selected'}
                </code>
                <Button size="sm" variant="outline" onClick={pickPath}>
                  <FolderOpen size={11} /> Pick…
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={busy || !path || !name}>
            {busy
              ? <Loader2 size={11} className="animate-spin" />
              : isEdit ? <Pencil size={11} /> : <Plus size={11} />}
            {busy ? 'Saving…' : isEdit ? 'Save & Re-index' : 'Add & Index'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}
