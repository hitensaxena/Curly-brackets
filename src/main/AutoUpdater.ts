import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'

/**
 * Auto-update wiring for Curly Brackets.
 *
 * Updates are pulled from GitHub Releases (configured in electron-builder.yml).
 * The user gets a non-modal banner when an update is available, with download
 * progress, then a "Restart to install" button when it's downloaded.
 *
 * In dev mode (`is.dev`), this module is a no-op — autoUpdater would crash
 * trying to read app-update.yml, which only exists in packaged builds.
 */

let initialised = false

function broadcastToAll(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

export function initAutoUpdater(): void {
  if (initialised) return
  initialised = true

  // Skip in dev — there's no app-update.yml on disk
  if (!app.isPackaged) {
    console.log('[updater] skipped (dev mode)')
    registerNoOpHandlers()
    return
  }

  autoUpdater.autoDownload = true       // download in background as soon as we find one
  autoUpdater.autoInstallOnAppQuit = true // safety-net: install on next quit even if user dismissed the banner
  autoUpdater.allowPrerelease = false   // ignore -beta tags by default
  autoUpdater.logger = {
    info: (m) => console.log('[updater]', m),
    warn: (m) => console.warn('[updater]', m),
    error: (m) => console.error('[updater]', m),
    debug: () => { /* drop */ }
  } as unknown as typeof autoUpdater.logger

  autoUpdater.on('checking-for-update', () => {
    broadcastToAll('updater:status', { phase: 'checking' })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[updater] update available:', info.version)
    broadcastToAll('updater:status', {
      phase: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate
    })
  })
  autoUpdater.on('update-not-available', () => {
    broadcastToAll('updater:status', { phase: 'none' })
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err)
    broadcastToAll('updater:status', { phase: 'error', error: String(err?.message ?? err) })
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    broadcastToAll('updater:status', {
      phase: 'downloading',
      percent: Math.round(p.percent),
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[updater] downloaded:', info.version)
    broadcastToAll('updater:status', {
      phase: 'ready',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  })

  // Renderer → main commands
  ipcMain.handle('updater:check', async () => autoUpdater.checkForUpdates().catch((e) => ({ error: String(e?.message ?? e) })))
  ipcMain.handle('updater:install', () => {
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })
  ipcMain.handle('updater:openReleases', () => {
    shell.openExternal('https://github.com/hitensaxena/Curly-brackets/releases')
  })
  ipcMain.handle('updater:status', async () => ({
    phase: 'idle',
    currentVersion: app.getVersion()
  }))

  // First check 10 seconds after launch (let the UI settle), then every 4 hours
  setTimeout(() => { autoUpdater.checkForUpdates().catch((e) => console.error('[updater] initial check failed:', e)) }, 10_000)
  setInterval(() => { autoUpdater.checkForUpdates().catch(() => { /* ignore */ }) }, 4 * 60 * 60 * 1000)
}

function registerNoOpHandlers(): void {
  ipcMain.handle('updater:check', () => ({ skipped: 'dev mode' }))
  ipcMain.handle('updater:install', () => { /* no-op */ })
  ipcMain.handle('updater:openReleases', () => {
    shell.openExternal('https://github.com/hitensaxena/Curly-brackets/releases')
  })
  ipcMain.handle('updater:status', async () => ({ phase: 'idle', currentVersion: app.getVersion(), dev: true }))
}
