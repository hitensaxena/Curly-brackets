import { app, shell, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb } from './db'
import { registerHandlers } from './ipc/handlers'
import { resetStaleAgents } from './agents/AgentManager'
import { startAiosBridge } from './messaging/AiosBridge'
import { AIOS_CLI_SOURCE } from './messaging/aiosCliScript'
import { AIOS_MCP_SERVER_SOURCE } from './messaging/aiosMcpServerScript'
import { installMcpConfig } from './messaging/mcpConfig'
import { loadAllSchedules } from './workflows/WorkflowScheduler'
import { startAllWatchers } from './knowledge/KnowledgeManager'
import { initAutoUpdater } from './AutoUpdater'

function installAiosCli(): void {
  const binDir = join(app.getPath('userData'), 'bin')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(join(binDir, 'aios'), AIOS_CLI_SOURCE, 'utf-8')
  chmodSync(join(binDir, 'aios'), 0o755)
  writeFileSync(join(binDir, 'aios-mcp.js'), AIOS_MCP_SERVER_SOURCE, 'utf-8')
  chmodSync(join(binDir, 'aios-mcp.js'), 0o755)
}

// ── Window state persistence ─────────────────────────────────────────────────
interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}
const WINDOW_STATE_FILE = () => join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(WINDOW_STATE_FILE(), 'utf-8')
    const parsed = JSON.parse(raw) as WindowState
    // Validate the saved bounds still fit on a connected display before restoring
    const display = screen.getDisplayMatching({
      x: parsed.x ?? 0, y: parsed.y ?? 0,
      width: parsed.width, height: parsed.height
    })
    const w = Math.max(900, Math.min(parsed.width, display.workArea.width))
    const h = Math.max(600, Math.min(parsed.height, display.workArea.height))
    return { width: w, height: h, x: parsed.x, y: parsed.y, isMaximized: parsed.isMaximized }
  } catch {
    return { width: 1400, height: 900 }
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const isMaximized = win.isMaximized()
  // When maximized, persist the previous "normal" bounds so unmaximizing restores them
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
  const state: WindowState = { ...bounds, isMaximized }
  try { writeFileSync(WINDOW_STATE_FILE(), JSON.stringify(state, null, 2), 'utf-8') }
  catch (err) { console.error('[window] failed to persist state:', err) }
}

function createWindow(): void {
  const saved = loadWindowState()
  const mainWindow = new BrowserWindow({
    title: 'Curly Brackets',
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#02141a',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (saved.isMaximized) mainWindow.maximize()

  // Persist on resize / move (debounced) and on close
  let saveTimer: NodeJS.Timeout | null = null
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 500)
  }
  mainWindow.on('resize', scheduleSave)
  mainWindow.on('move', scheduleSave)
  mainWindow.on('maximize', scheduleSave)
  mainWindow.on('unmaximize', scheduleSave)
  mainWindow.on('close', () => saveWindowState(mainWindow))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('ai.mintrix.curly-brackets')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb()
  resetStaleAgents()
  installAiosCli()
  installMcpConfig()
  void startAiosBridge()
  registerHandlers()
  loadAllSchedules()
  try { startAllWatchers() } catch (err) { console.error('[knowledge] watchers failed to start:', err) }
  initAutoUpdater()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
