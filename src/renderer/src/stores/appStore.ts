import { create } from 'zustand'
import { CLIHealth, UsageSummary, Notification } from '@shared/types'

type Page = 'home' | 'chat' | 'agents' | 'workflows' | 'projects' | 'command-center' | 'settings'

interface AppStore {
  currentPage: Page
  sidebarCollapsed: boolean
  cliHealth: CLIHealth | null
  todaySummary: UsageSummary | null
  notifications: Notification[]
  unreadCount: number

  navigate: (page: Page) => void
  toggleSidebar: () => void
  setCliHealth: (health: CLIHealth) => void
  setTodaySummary: (summary: UsageSummary) => void
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markAllRead: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  currentPage: 'chat',
  sidebarCollapsed: false,
  cliHealth: null,
  todaySummary: null,
  notifications: [],
  unreadCount: 0,

  navigate: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCliHealth: (cliHealth) => set({ cliHealth }),
  setTodaySummary: (todaySummary) => set({ todaySummary }),

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      read: false
    }
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1
    }))
  },

  markAllRead: () => set((s) => ({
    notifications: s.notifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0
  }))
}))
