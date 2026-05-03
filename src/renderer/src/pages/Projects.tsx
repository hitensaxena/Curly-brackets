import { useState, useEffect } from 'react'
import { Plus, FolderOpen, Trash2, FolderSearch, ChevronDown, ChevronRight, Database } from 'lucide-react'
import { Project } from '@shared/types'
import { Button } from '../components/ui/button'
import { SourcesManager } from '../components/knowledge/SourcesManager'

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => setProjects(await window.api.projects.list())
  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    await window.api.projects.delete(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Projects</h1>
          <p className="text-xs text-slate-500 mt-0.5">Organize agents and workflows by project</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={13} /> New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
            <FolderOpen size={28} className="text-indigo-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-300 mb-1">No projects yet</h3>
          <p className="text-sm text-slate-500 mb-4">Create a project to organize your agents and workflows</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create Project
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onDelete={() => handleDelete(p.id)} />
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={load} />}
    </div>
  )
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border border-white/5 bg-white/2 hover:border-white/10 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 cursor-pointer text-left flex-1 min-w-0"
          >
            {expanded ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
            <FolderOpen size={16} className="text-indigo-400 flex-shrink-0" />
            <h3 className="text-sm font-medium text-slate-200 truncate">{project.name}</h3>
          </button>
          <button onClick={onDelete} className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer ml-2">
            <Trash2 size={13} />
          </button>
        </div>
        {project.description && <p className="text-xs text-slate-500 ml-7">{project.description}</p>}
        {project.repoPath && (
          <p className="text-xs text-slate-600 mt-2 ml-7 font-mono truncate">{project.repoPath}</p>
        )}
      </div>

      {expanded && (
        <div className="border-t border-white/5 p-4 bg-black/20">
          <div className="flex items-center gap-2 mb-2">
            <Database size={12} className="text-indigo-400" />
            <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Knowledge sources</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Sources scoped to this project. Chats bound to this project see global sources + these.
          </p>
          <SourcesManager scope="project" projectId={project.id} />
        </div>
      )}
    </div>
  )
}

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await window.api.projects.create({ name, description, repoPath: repoPath || null, tags: '[]', contextMdPath: null })
    onCreate()
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13131a] border border-white/10 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">Create Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors cursor-pointer text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Name *</label>
            <input className={INPUT} placeholder="My Project" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Description</label>
            <textarea className={`${INPUT} resize-none`} rows={2} placeholder="What is this project about?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Repository Path</label>
            <div className="flex gap-2">
              <input
                className={`${INPUT} flex-1 font-mono`}
                placeholder="/Users/you/projects/my-app"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
              />
              <button
                type="button"
                onClick={async () => {
                  const path = await window.api.dialog.pickDirectory({
                    title: 'Select project directory',
                    defaultPath: repoPath || undefined
                  })
                  if (path) setRepoPath(path)
                }}
                className="px-3 py-2 rounded-md border border-white/10 text-xs text-slate-300 hover:bg-white/5 cursor-pointer flex items-center gap-1.5"
              >
                <FolderSearch size={12} /> Browse
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              Agents bound to this project will run with this dir as cwd, so they can edit your real files.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !name.trim()}>{loading ? 'Creating...' : 'Create'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

const INPUT = 'w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/50 placeholder:text-slate-600'
