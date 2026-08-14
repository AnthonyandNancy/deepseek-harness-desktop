import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { startDshService } from './dsh-service.js'
import { createWindowOptions } from './window-options.js'

const APP_NAME = 'DeepSeek Harness'

let mainWindow
let service
let serviceUrl

app.setName(APP_NAME)

function createWindow(url) {
  if (process.platform === 'win32') Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow(createWindowOptions())

  if (process.platform === 'win32') {
    mainWindow.setMenu(null)
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()
    if (currentUrl && new URL(url).origin !== new URL(currentUrl).origin) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })

  void mainWindow.loadURL(url)
}

async function launch() {
  service = startDshService({
    electronExecutable: process.execPath,
    environment: {
      ...process.env,
      NODE_OPTIONS: '',
      DSH_DESKTOP: '1',
    },
  })

  try {
    serviceUrl = await service.ready
    createWindow(serviceUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} failed to start`,
      message: 'DeepSeek Harness could not start.',
      detail: message,
    })
    app.quit()
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(launch)
}

app.on('activate', () => {
  if (!mainWindow && serviceUrl) createWindow(serviceUrl)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  service?.stop()
})
