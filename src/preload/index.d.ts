import { ElectronAPI } from '@electron-toolkit/preload'
import type { Agent, Project, Workflow, WorkflowRun, UsageSummary, CLIHealth } from '../shared/types'

export type KnowledgeSourceType = 'obsidian' | 'folder' | 'pdf' | 'pdfFolder' | 'url' | 'codebase'

export interface KnowledgeSourceRow {
  id: string
  name: string
  scope: 'global' | 'project'
  projectId: string | null
  type: KnowledgeSourceType
  // Path-based sources use `path`; URL sources use `url`.
  config: { path?: string; url?: string; extensions?: string[] }
  enabled: boolean
  status: string
  errorMessage: string | null
  totalChunks: number
  lastIndexedAt: number | null
  createdAt: number
  updatedAt: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      agents: {
        create: (config: unknown) => Promise<Agent>
        list: () => Promise<Agent[]>
        get: (id: string) => Promise<Agent | null>
        update: (id: string, updates: Partial<Agent>) => Promise<void>
        delete: (id: string) => Promise<void>
        startSession: (agentId: string) => Promise<string>
        killSession: (agentId: string) => Promise<void>
        sendInput: (sessionId: string, input: string) => Promise<void>
        resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>
        runHeadless: (agentId: string, prompt: string) => Promise<{ content: string; costUsd: number }>
        getBuffer: (sessionId: string) => Promise<string>
        readMemory: (agentId: string) => Promise<{ path: string; content: string } | null>
        writeMemory: (agentId: string, content: string) => Promise<void>
        roots: (agentId: string) => Promise<{ label: string; path: string }[]>
        listFiles: (agentId: string, rootPath: string, subPath?: string) =>
          Promise<{ name: string; path: string; isDir: boolean; size?: number; mtime?: number }[]>
        readFile: (agentId: string, rootPath: string, relPath: string) =>
          Promise<{ path: string; content: string; size: number; truncated: boolean }>
        writeFile: (agentId: string, rootPath: string, relPath: string, content: string) => Promise<void>
      }
      projects: {
        list: () => Promise<Project[]>
        create: (config: unknown) => Promise<Project>
        delete: (id: string) => Promise<void>
      }
      workflows: {
        list: () => Promise<Workflow[]>
        get: (id: string) => Promise<Workflow | null>
        create: (config: unknown) => Promise<Workflow>
        update: (id: string, updates: unknown) => Promise<void>
        delete: (id: string) => Promise<void>
        run: (workflowId: string, initialInput?: string) => Promise<string>
        runState: (runId: string) => Promise<{ status: string; stepStates: Record<string, unknown> } | null>
        runs: { list: (workflowId?: string) => Promise<WorkflowRun[]> }
        nextFire: (cronExpr: string) => Promise<number | null>
        lastRun: (workflowId: string) => Promise<WorkflowRun | null>
        resolveApproval: (runId: string, stepId: string, approved: boolean) => Promise<boolean>
        resumeFrom: (runId: string, fromStepId: string, initialInput?: string) => Promise<void>
      }
      usage: {
        summary: (sinceMs?: number) => Promise<UsageSummary>
        history: (days?: number) => Promise<{ date: string; claude: number; gemini: number; claudeCost: number; geminiCost: number }[]>
      }
      messages: {
        send: (payload: {
          fromAgentId: string | null
          toAgentId: string | null
          content: string
          contentType?: string
          priority?: string
          workflowRunId?: string
        }) => Promise<unknown>
        list: (filter?: { toAgentId?: string; fromAgentId?: string; workflowRunId?: string; limit?: number }) => Promise<unknown[]>
        unreadCounts: () => Promise<Record<string, number>>
        markRead: (id: string) => Promise<void>
      }
      cli: { health: () => Promise<CLIHealth> }
      updater: {
        check: () => Promise<unknown>
        install: () => Promise<void>
        openReleases: () => Promise<void>
        status: () => Promise<{ phase: string; currentVersion: string; dev?: boolean }>
      }
      aios: { bridgePort: () => Promise<number> }
      dialog: {
        pickDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
        pickFile: (opts?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
      }
      settings: {
        all: () => Promise<Record<string, string>>
        set: (key: string, value: string) => Promise<void>
      }
      knowledge: {
        stats: () => Promise<{
          totalChunks: number
          totalSources: number
          enabledSources: number
          hasApiKey: boolean
          embeddingModel: string
          watcherCount: number
        }>
        sources: {
          list: (filter?: { scope?: 'global' | 'project'; projectId?: string | null }) => Promise<KnowledgeSourceRow[]>
          get: (id: string) => Promise<KnowledgeSourceRow | null>
          create: (input: {
            name: string
            scope: 'global' | 'project'
            projectId?: string | null
            type: KnowledgeSourceType
            config: { path?: string; url?: string; extensions?: string[] }
            enabled?: boolean
          }) => Promise<KnowledgeSourceRow>
          update: (id: string, updates: { name?: string; config?: { path?: string; url?: string; extensions?: string[] }; enabled?: boolean }) => Promise<void>
          delete: (id: string) => Promise<void>
          reindex: (id: string) => Promise<{ indexed: number; skipped: number; failed: number }>
        }
        retrieve: (query: string, opts?: {
          k?: number
          sourceIds?: string[]
          globalScope?: boolean
          projectId?: string | null
        }) => Promise<Array<{
          id: string
          sourceId: string | null
          sourceName: string | null
          sourceType: string | null
          kind: string
          path: string
          title: string | null
          headerChain: string[]
          content: string
          score: number
        }>>
        chunks: {
          byIds: (ids: string[]) => Promise<Array<{
            id: string; sourceId: string | null; sourceName: string | null; sourceType: string | null;
            path: string; title: string | null; headerChain: string[]; content: string
          }>>
          search: (query: string, opts?: { projectId?: string | null; limit?: number }) => Promise<Array<{
            id: string; sourceId: string | null; sourceName: string | null; sourceType: string | null;
            path: string; title: string | null; headerChain: string[]
          }>>
        }
        startWatchers: () => Promise<{ count: number }>
        stopWatchers: () => Promise<{ count: number }>
      }
      chat: {
        list: () => Promise<Array<{
          id: string; title: string; projectId: string | null; defaultModel: string;
          defaultAgentId: string | null; claudeSessionId: string | null;
          pinnedSourceIds: string | null;
          createdAt: number; updatedAt: number; lastMessageAt: number | null
        }>>
        get: (id: string) => Promise<{
          conversation: {
            id: string; title: string; projectId: string | null; defaultModel: string;
            defaultAgentId: string | null; claudeSessionId: string | null;
            pinnedSourceIds: string | null;
            createdAt: number; updatedAt: number; lastMessageAt: number | null
          }
          messages: Array<{
            id: string; conversationId: string; role: string; agentId: string | null;
            content: string; sources: string | null;
            inputTokens: number; outputTokens: number; costUsd: number; createdAt: number
          }>
        } | null>
        create: (input?: { projectId?: string | null; defaultModel?: string; defaultAgentId?: string | null; title?: string }) =>
          Promise<{ id: string; title: string; projectId: string | null; defaultModel: string; defaultAgentId: string | null; claudeSessionId: string | null; createdAt: number; updatedAt: number; lastMessageAt: number | null }>
        update: (id: string, updates: { title?: string; projectId?: string | null; defaultModel?: string; defaultAgentId?: string | null; pinnedSourceIds?: string[] }) => Promise<void>
        delete: (id: string) => Promise<void>
        send: (conversationId: string, content: string) => Promise<void>
        fork: (sourceId: string, untilMessageId: string) => Promise<{ id: string }>
        saveToVault: (conversationId: string) => Promise<{ path: string } | null>
      }
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void
      off: (channel: string, listener: (...args: unknown[]) => void) => void
    }
  }
}
