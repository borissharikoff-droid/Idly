import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import log from './logger'
import { IPC_CHANNELS } from '../shared/ipcChannels'

/**
 * Initialise auto-updater.
 *
 * electron-updater will check for updates published as GitHub Releases
 * (configured via `publish` in electron-builder.yml).
 *
 * Flow:
 *   1. App starts → checks for update
 *   2. If update available → downloads it silently
 *   3. Notifies the renderer that a restart is needed
 *   4. On next quit the update is installed automatically
 */
export function initAutoUpdater(win: BrowserWindow): void {
  // Custom logger: 404 is expected until a GitHub Release with latest.yml exists — log as warn, not error
  const msgStr = (m: unknown) => (m instanceof Error ? m.message : String(m))
  const is404 = (m: unknown) => msgStr(m).includes('404')
  autoUpdater.logger = {
    info: (m: string) => log.info(m),
    warn: (m: string) => log.warn(m),
    error: (m: unknown) => (is404(m) ? log.warn('[updater] No release (404). Check publish.repo in electron-builder config.') : log.error(msgStr(m))),
  }

  // Don't auto-download — let us control the flow
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version)
    win.webContents.send(IPC_CHANNELS.updater.status, { status: 'downloading', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] App is up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[updater] Download: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] Update downloaded:', info.version)
    // Tell renderer to show countdown banner
    win.webContents.send(IPC_CHANNELS.updater.status, { status: 'ready', version: info.version })
    // Auto-install after 30 seconds if user doesn't act
    setTimeout(() => {
      log.info('[updater] Auto-installing update after countdown')
      autoUpdater.quitAndInstall(false, true)
    }, 30_000)
  })

  autoUpdater.on('error', (err: Error & { code?: string }) => {
    const is404 = err.message?.includes('404') || err.code === 'ERR_HTTP_RESPONSE_CODE_FAILURE'
    if (is404) {
      log.warn('[updater] No update server or release (404). Check publish.repo in electron-builder config.')
    } else {
      log.error('[updater] Error:', err.message)
    }
  })

  // Check immediately on launch, then every 30 minutes
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 30 * 60 * 1000)
}
