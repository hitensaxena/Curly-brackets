/**
 * Holds the path to the generated MCP config file. Set once at app startup by
 * `installMcpConfig()`. Other modules read it via `getMcpConfigPath()`.
 */
import { app } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'

let configPath: string | null = null

export function installMcpConfig(): string {
  const binDir = join(app.getPath('userData'), 'bin')
  const path = join(app.getPath('userData'), 'aios-mcp.json')
  const config = {
    mcpServers: {
      aios: {
        command: 'node',
        args: [join(binDir, 'aios-mcp.js')]
        // AIOS_BRIDGE_PORT is injected at spawn time by ChatManager, not here.
      }
    }
  }
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8')
  configPath = path
  return path
}

export function getMcpConfigPath(): string | null {
  return configPath
}
