import { contextBridge, ipcRenderer } from 'electron'

const api = {
  agents: {
    create: (config: unknown) => ipcRenderer.invoke('agents:create', config),
    list: () => ipcRenderer.invoke('agents:list'),
    get: (id: string) => ipcRenderer.invoke('agents:get', id),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('agents:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('agents:delete', id),
    startSession: (agentId: string) => ipcRenderer.invoke('agents:startSession', agentId),
    killSession: (agentId: string) => ipcRenderer.invoke('agents:killSession', agentId),
    sendInput: (sessionId: string, input: string) => ipcRenderer.invoke('agents:sendInput', sessionId, input),
    resizeSession: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke('agents:resizeSession', sessionId, cols, rows),
    runHeadless: (agentId: string, prompt: string) => ipcRenderer.invoke('agents:runHeadless', agentId, prompt),
    getBuffer: (sessionId: string) => ipcRenderer.invoke('agents:getBuffer', sessionId),
    readMemory: (agentId: string) => ipcRenderer.invoke('agents:readMemory', agentId),
    writeMemory: (agentId: string, content: string) => ipcRenderer.invoke('agents:writeMemory', agentId, content),
    roots: (agentId: string) => ipcRenderer.invoke('agents:roots', agentId),
    listFiles: (agentId: string, rootPath: string, subPath?: string) =>
      ipcRenderer.invoke('agents:listFiles', agentId, rootPath, subPath),
    readFile: (agentId: string, rootPath: string, relPath: string) =>
      ipcRenderer.invoke('agents:readFile', agentId, rootPath, relPath),
    writeFile: (agentId: string, rootPath: string, relPath: string, content: string) =>
      ipcRenderer.invoke('agents:writeFile', agentId, rootPath, relPath, content)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (config: unknown) => ipcRenderer.invoke('projects:create', config),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id)
  },
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list'),
    get: (id: string) => ipcRenderer.invoke('workflows:get', id),
    create: (config: unknown) => ipcRenderer.invoke('workflows:create', config),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('workflows:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('workflows:delete', id),
    run: (workflowId: string, initialInput?: string) => ipcRenderer.invoke('workflows:run', workflowId, initialInput),
    runState: (runId: string) => ipcRenderer.invoke('workflows:run:state', runId),
    runs: {
      list: (workflowId?: string) => ipcRenderer.invoke('workflows:runs:list', workflowId)
    },
    nextFire: (cronExpr: string) => ipcRenderer.invoke('workflows:nextFire', cronExpr),
    lastRun: (workflowId: string) => ipcRenderer.invoke('workflows:lastRun', workflowId),
    resolveApproval: (runId: string, stepId: string, approved: boolean) =>
      ipcRenderer.invoke('workflows:approval:resolve', runId, stepId, approved),
    resumeFrom: (runId: string, fromStepId: string, initialInput?: string) =>
      ipcRenderer.invoke('workflows:resumeFrom', runId, fromStepId, initialInput)
  },
  usage: {
    summary: (sinceMs?: number) => ipcRenderer.invoke('usage:summary', sinceMs),
    history: (days?: number) => ipcRenderer.invoke('usage:history', days)
  },
  messages: {
    send: (payload: unknown) => ipcRenderer.invoke('messages:send', payload),
    list: (filter?: unknown) => ipcRenderer.invoke('messages:list', filter),
    unreadCounts: () => ipcRenderer.invoke('messages:unreadCounts'),
    markRead: (id: string) => ipcRenderer.invoke('messages:markRead', id)
  },
  cli: {
    health: () => ipcRenderer.invoke('cli:health')
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    openReleases: () => ipcRenderer.invoke('updater:openReleases'),
    status: () => ipcRenderer.invoke('updater:status')
  },
  aios: {
    bridgePort: () => ipcRenderer.invoke('aios:bridgePort')
  },
  dialog: {
    pickDirectory: (opts?: { title?: string; defaultPath?: string }) => ipcRenderer.invoke('dialog:pickDirectory', opts),
    pickFile: (opts?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:pickFile', opts)
  },
  settings: {
    all: () => ipcRenderer.invoke('settings:all'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  knowledge: {
    stats: () => ipcRenderer.invoke('knowledge:stats'),
    sources: {
      list: (filter?: { scope?: 'global' | 'project'; projectId?: string | null }) =>
        ipcRenderer.invoke('knowledge:sources:list', filter),
      get: (id: string) => ipcRenderer.invoke('knowledge:sources:get', id),
      create: (input: unknown) => ipcRenderer.invoke('knowledge:sources:create', input),
      update: (id: string, updates: unknown) => ipcRenderer.invoke('knowledge:sources:update', id, updates),
      delete: (id: string) => ipcRenderer.invoke('knowledge:sources:delete', id),
      reindex: (id: string) => ipcRenderer.invoke('knowledge:sources:reindex', id)
    },
    retrieve: (query: string, opts?: unknown) => ipcRenderer.invoke('knowledge:retrieve', query, opts),
    chunks: {
      byIds: (ids: string[]) => ipcRenderer.invoke('knowledge:chunks:byIds', ids),
      search: (query: string, opts?: { projectId?: string | null; limit?: number }) =>
        ipcRenderer.invoke('knowledge:chunks:search', query, opts)
    },
    startWatchers: () => ipcRenderer.invoke('knowledge:startWatchers'),
    stopWatchers: () => ipcRenderer.invoke('knowledge:stopWatchers')
  },
  chat: {
    list: () => ipcRenderer.invoke('chat:list'),
    get: (id: string) => ipcRenderer.invoke('chat:get', id),
    create: (input?: { projectId?: string | null; defaultModel?: string; defaultAgentId?: string | null; title?: string }) =>
      ipcRenderer.invoke('chat:create', input),
    update: (id: string, updates: { title?: string; projectId?: string | null; defaultModel?: string; defaultAgentId?: string | null }) =>
      ipcRenderer.invoke('chat:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('chat:delete', id),
    send: (conversationId: string, content: string) => ipcRenderer.invoke('chat:send', conversationId, content),
    fork: (sourceId: string, untilMessageId: string) => ipcRenderer.invoke('chat:fork', sourceId, untilMessageId),
    saveToVault: (conversationId: string) => ipcRenderer.invoke('chat:saveToVault', conversationId)
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const subscription = (_: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  off: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    console.error(err)
  }
} else {
  // @ts-ignore
  window.api = api
}
