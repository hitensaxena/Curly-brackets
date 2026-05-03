import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import * as pty from 'node-pty'
import { Provider } from '@shared/types'
import { NormalizedEvent, HeadlessResult } from './ClaudeAdapter'

const GEMINI_PATH = process.env.GEMINI_PATH || '/opt/homebrew/bin/gemini'

export const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 }
}

export class GeminiPTYSession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null
  public readonly sessionId: string

  constructor(sessionId: string) {
    super()
    this.sessionId = sessionId
  }

  start(model: string, cwd: string, extraDirs?: string[], extraEnv?: Record<string, string>): void {
    const args: string[] = ['--model', model]
    if (extraDirs && extraDirs.length > 0) {
      args.push('--include-directories', extraDirs.join(','))
    }
    this.ptyProcess = pty.spawn(GEMINI_PATH, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', ...extraEnv }
    })

    this.ptyProcess.onData((data) => this.emit('data', data))
    this.ptyProcess.onExit(({ exitCode }) => this.emit('exit', exitCode))
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

export class GeminiAdapter extends EventEmitter {
  async runHeadless(
    sessionId: string,
    prompt: string,
    model: string
  ): Promise<HeadlessResult> {
    return new Promise((resolve, reject) => {
      const args = ['--model', model, '-p', prompt]
      const proc = spawn(GEMINI_PATH, args, { env: { ...process.env } })

      const events: NormalizedEvent[] = []
      let contentBuffer = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        contentBuffer += text
        const event: NormalizedEvent = {
          type: 'content',
          provider: 'gemini' as Provider,
          sessionId,
          timestamp: Date.now(),
          data: { delta: text }
        }
        events.push(event)
        this.emit('event', event)
      })

      proc.on('close', (code) => {
        if (code !== 0 && contentBuffer === '') {
          reject(new Error(`Gemini CLI exited with code ${code}`))
        } else {
          const inputTokens = 0
          const outputTokens = Math.ceil(contentBuffer.length / 4)
          const costUsd = this.estimateCost(inputTokens, outputTokens, model)
          resolve({ content: contentBuffer, inputTokens, outputTokens, costUsd, events })
        }
      })

      proc.on('error', reject)
    })
  }

  spawnSession(sessionId: string): GeminiPTYSession {
    return new GeminiPTYSession(sessionId)
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing = GEMINI_PRICING[model] || GEMINI_PRICING['gemini-2.5-flash']
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  }

  async healthCheck(): Promise<{ available: boolean; version?: string; path: string }> {
    return new Promise((resolve) => {
      const proc = spawn(GEMINI_PATH, ['--version'])
      let version = ''
      proc.stdout.on('data', (d: Buffer) => (version += d.toString()))
      proc.on('close', (code) => {
        resolve({ available: code === 0, version: version.trim(), path: GEMINI_PATH })
      })
      proc.on('error', () => resolve({ available: false, path: GEMINI_PATH }))
    })
  }
}
