// 墨笔 — Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const DEV_URL = process.env.MARKLITE_DEV_URL || null
const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] },
  { name: '所有文件', extensions: ['*'] }
]

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 500,
    title: '墨笔',
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // 外部链接交给系统浏览器，不在应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

/* ------------------------------ IPC ------------------------------ */

ipcMain.handle('dialog:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: MD_FILTERS
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:save', async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    title: '保存 Markdown 文件',
    defaultPath: defaultPath || '未命名.md',
    filters: MD_FILTERS
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle('fs:read', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) throw new Error('无效的文件路径')
  return fs.readFile(filePath, 'utf8')
})

ipcMain.handle('fs:write', async (_event, filePath, contents) => {
  if (typeof filePath !== 'string' || !filePath) throw new Error('无效的文件路径')
  if (typeof contents !== 'string') throw new Error('内容必须是文本')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, contents, 'utf8')
  return true
})

/* ------------------------------ 生命周期 ------------------------------ */

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
