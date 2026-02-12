import 'dotenv/config'
import { app, BrowserWindow, Tray, nativeImage, Notification, Menu } from 'electron'
import path from 'path'
import { registerIpcHandlers, setMainWindow, setNotificationSender } from './ipc'
import { startSmartNotifications, stopSmartNotifications } from './notifications'
import { closeDatabase } from './database'
import { initAutoUpdater } from './updater'
import log from './logger'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function getIconPath(): string {
  if (isDev) {
    return path.join(process.cwd(), 'assets', 'icon.png')
  }
  // In production, assets are in resources/assets (extraResources)
  return path.join(process.resourcesPath, 'assets', 'icon.png')
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath())
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Idly')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Idly',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit, I\'m done',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function showNativeNotification(title: string, body: string) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, icon: getIconPath() })
  n.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  n.show()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 700,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    backgroundColor: '#11111b',
    show: false,
    resizable: false,
  })

  const devServerUrl = 'http://localhost:5173'
  if (isDev) {
    mainWindow.loadURL(devServerUrl).catch(() => {})
    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -6 || errorDescription?.includes('REFUSED')) {
        mainWindow?.webContents.loadURL(
          'data:text/html;charset=utf-8,' +
          encodeURIComponent(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Idly</title></head>
<body style="margin:0;min-height:100vh;background:#11111b;color:#a1a1aa;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">
  <div style="text-align:center;max-width:320px">
    <p style="font-size:48px;margin:0 0 16px">🔌</p>
    <h1 style="color:#fff;font-size:18px;margin:0 0 8px">Connection Failed</h1>
    <p style="font-size:13px;margin:0 0 20px;line-height:1.5">Dev server is not running. Start it from the project folder:</p>
    <code style="display:block;background:#1e1e2e;padding:12px 16px;border-radius:8px;font-size:12px;margin-bottom:20px;text-align:left;color:#00ff88">npm run electron:dev</code>
    <button onclick="window.location.href='${devServerUrl}'" style="background:#00ff88;color:#111;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">Retry</button>
  </div>
</body></html>`)
        )
      }
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Start auto-updater after window is visible (production only)
    if (!isDev && mainWindow) initAutoUpdater(mainWindow)
  })
  mainWindow.on('close', (e) => {
    if (tray && !isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    setMainWindow(null)
    mainWindow = null
  })
  setMainWindow(mainWindow)
  startSmartNotifications(mainWindow)
}


// Prevent GPU cache errors on Windows (permission / lock issues)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-cache')

app.whenReady().then(() => {
  log.info('Idly starting up', { isDev, platform: process.platform })
  setNotificationSender(showNativeNotification)
  registerIpcHandlers()
  createWindow()
  if (process.platform === 'win32') createTray()
  log.info('Idly ready')
})

app.on('window-all-closed', () => {
  if (tray) tray.destroy()
  tray = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  log.info('Idly shutting down')
  isQuitting = true
  stopSmartNotifications()
  closeDatabase()
  log.info('Database closed, goodbye')
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
