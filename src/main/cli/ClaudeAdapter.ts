import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import * as pty from 'node-pty'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { Provider } from '@shared/types'

export interface PTYUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export function encodeClaudeProjectPath(cwd: string): string {
  return cwd.replace(/[/\s]/g, '-')
}

export function readClaudeSessionUsage(cwd: string, sessionId: string): PTYUsage | null {
  const encoded = encodeClaudeProjectPath(cwd)
  const file = join(process.env.HOME || '', '.claude', 'projects', encoded, `${sessionId}.jsonl`)
  if (!existsSync(file)) return null

  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0

  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      const usage = obj?.message?.usage
      if (usage) {
        inputTokens += usage.input_tokens || 0
        outputTokens += usage.output_tokens || 0
        cacheReadTokens += usage.cache_read_input_tokens || 0
        cacheCreationTokens += usage.cache_creation_input_tokens || 0
      }
    } catch {
      // skip malformed lines
    }
  }

  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens === 0) return null
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
}

const CLAUDE_PATH = process.env.CLAUDE_PATH || '/Users/hitensaxena/.local/bin/claude'

export const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 }
}

export interface NormalizedEvent {
  type: 'content' | 'tool_use' | 'tool_result' | 'usage' | 'complete' | 'error' | 'raw'
  provider: Provider
  sessionId: string
  timestamp: number
  data: Record<string, unknown>
}

export interface HeadlessResult {
  content: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  events: NormalizedEvent[]
}

export class PTYSession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null
  public readonly sessionId: string

  constructor(sessionId: string) {
    super()
    this.sessionId = sessionId
  }

  start(systemPrompt: string, model: string, cwd: string, extraDirs?: string[], extraEnv?: Record<string, string>): void {
    const args: string[] = [
      '--model', model,
      '--session-id', this.sessionId
    ]
    if (systemPrompt && systemPrompt.trim()) {
      args.push('--append-system-prompt', systemPrompt)
    }
    if (extraDirs && extraDirs.length > 0) {
      args.push('--add-dir', ...extraDirs)
    }

    this.ptyProcess = pty.spawn(CLAUDE_PATH, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', ...extraEnv }
    })

    this.ptyProcess.onData((data) => {
      this.emit('data', data)
    })

    this.ptyProcess.onExit(({ exitCode }) => {
      this.emit('exit', exitCode)
    })
  }

  write(data: string): void {
    this.ptyProcess?.write(data)
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess?.resize(cols, rows)
  }

  kill(): void {
    this.ptyProcess?.kill()
    this.ptyProcess = null
  }
}

export class ClaudeAdapter extends EventEmitter {
  async runHeadless(
    sessionId: string,
    prompt: string,
    model: string,
    options?: {
      systemPrompt?: string
      cwd?: string
      extraDirs?: string[]
      onContent?: (delta: string) => void
      mcpConfigPath?: string
      allowedTools?: string[]
      extraEnv?: Record<string, string>
    }
  ): Promise<HeadlessResult> {
    return new Promise((resolve, reject) => {
      const args = [
        '-p',
        prompt,
        '--model',
        model,
        '--output-format',
        'stream-json',
        '--verbose'
      ]
      if (options?.systemPrompt && options.systemPrompt.trim()) {
        args.push('--append-system-prompt', options.systemPrompt)
      }
      if (options?.extraDirs && options.extraDirs.length > 0) {
        args.push('--add-dir', ...options.extraDirs)
      }
      if (options?.mcpConfigPath) {
        args.push('--mcp-config', options.mcpConfigPath)
      }
      if (options?.allowedTools && options.allowedTools.length > 0) {
        args.push('--allowed-tools', ...options.allowedTools)
      }

      const proc = spawn(CLAUDE_PATH, args, {
        env: { ...process.env, ...(options?.extraEnv ?? {}) },
        cwd: options?.cwd
      })

      const events: NormalizedEvent[] = []
      let contentBuffer = ''
      let inputTokens = 0
      let outputTokens = 0
      let costUsd = 0

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          const event = this.parseLine(sessionId, line)
          if (!event) continue

          events.push(event)
          this.emit('event', event)

          if (event.type === 'content') {
            const delta = (event.data.delta as string) || ''
            contentBuffer += delta
            if (delta) options?.onContent?.(delta)
          } else if (event.type === 'usage') {
            inputTokens = (event.data.input_tokens as number) || 0
            outputTokens = (event.data.output_tokens as number) || 0
            costUsd = this.estimateCost(inputTokens, outputTokens, model)
          }
        }
      })

      proc.on('close', (code) => {
        if (code !== 0 && contentBuffer === '') {
          reject(new Error(`Claude CLI exited with code ${code}`))
        } else {
          resolve({ content: contentBuffer, inputTokens, outputTokens, costUsd, events })
        }
      })

      proc.on('error', reject)
    })
  }

  spawnSession(sessionId: string): PTYSession {
    return new PTYSession(sessionId)
  }

  parseLine(sessionId: string, line: string): NormalizedEvent | null {
    try {
      const parsed = JSON.parse(line)
      const base = { provider: 'claude' as Provider, sessionId, timestamp: Date.now() }

      if (parsed.type === 'assistant' && parsed.message?.content) {
        const content = parsed.message.content
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { text: string }) => b.text)
          .join('')
        return { ...base, type: 'content', data: { delta: content } }
      }
      if (parsed.type === 'result' && parsed.usage) {
        return {
          ...base,
          type: 'usage',
          data: {
            input_tokens: parsed.usage.input_tokens || 0,
            output_tokens: parsed.usage.output_tokens || 0,
            cache_read_tokens: parsed.usage.cache_read_input_tokens || 0
          }
        }
      }
      return { ...base, type: 'raw', data: parsed }
    } catch {
      return null
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING['claude-sonnet-4-6']
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  }

  async healthCheck(): Promise<{ available: boolean; version?: string; path: string }> {
    return new Promise((resolve) => {
      const proc = spawn(CLAUDE_PATH, ['--version'])
      let version = ''
      proc.stdout.on('data', (d: Buffer) => (version += d.toString()))
      proc.on('close', (code) => {
        resolve({ available: code === 0, version: version.trim(), path: CLAUDE_PATH })
      })
      proc.on('error', () => resolve({ available: false, path: CLAUDE_PATH }))
    })
  }
}
