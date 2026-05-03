import {
  Home, Bot, Workflow, FolderOpen, BarChart3, MessageSquare,
  Settings, ChevronLeft, ChevronRight, Cpu
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

type Page = 'home' | 'chat' | 'agents' | 'workflows' | 'projects' | 'command-center' | 'settings'

const navItems: { id: Page; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'home', label: 'Home', icon: Home },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'command-center', label: 'Command Center', icon: BarChart3 },
]

export function Sidebar() {
  const { currentPage, sidebarCollapsed, navigate, toggleSidebar } = useAppStore()

  return (
    <div
      className={`flex flex-col h-full bg-[#0d0d14] border-r border-white/5 transition-all duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 px-3 pt-12 pb-6 ${sidebarCollapsed ? 'justify-center' : ''}`}>
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <Cpu size={14} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-xs font-bold text-white leading-tight">AI OS</div>
            <div className="text-[10px] text-slate-500 leading-tight">Workstation</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = currentPage === id
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={16} className={active ? 'text-indigo-400' : ''} />
              {!sidebarCollapsed && <span>{label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-0.5">
        <button
          onClick={() => navigate('settings')}
          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer ${sidebarCollapsed ? 'justify-center' : ''}`}
          title={sidebarCollapsed ? 'Settings' : undefined}
        >
          <Settings size={16} />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>

        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center py-2 text-slate-600 hover:text-slate-400 transition-colors cursor-pointer"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </div>
  )
}
