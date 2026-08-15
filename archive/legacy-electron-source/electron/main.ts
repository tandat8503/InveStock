import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initializeDb, closeDb } from './db/connection'
import { registerAllIpcHandlers } from './ipc'
import { runAutoBackupIfNeeded } from './services/autoBackupService'

const isolatedUserData = process.env['FEED_INVENTORY_USER_DATA']
if (isolatedUserData) app.setPath('userData', isolatedUserData)

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Feed Inventory Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      // Security: contextIsolation ON, nodeIntegration OFF
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

void app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.feedstore.inventorymanager')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  try {
  initializeDb()
  } catch (err) {
    console.error('Failed to initialize database:', err)
    app.quit()
    return
  }

  // Register all IPC handlers
  registerAllIpcHandlers(ipcMain)

  createWindow()
  void runAutoBackupIfNeeded()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDb()
})
