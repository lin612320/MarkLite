// 墨笔 — Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')

const DEV_URL = process.env.MARKLITE_DEV_URL || null
const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] },
  { name: '所有文件', extensions: ['*'] }
]
const MD_EXTS = ['.md', '.markdown', '.mdown', '.txt']

let mainWindow = null
/** 冷启动时命令行带来的文件，等窗口加载完再投递 */
let pendingFile = null

app.setAppUserModelId('com.marklite.editor')

/**
 * 从命令行参数中挑出第一个 Markdown 文件路径。
 * 打包后： [MarkLite.exe, <file>]
 * 开发时： [electron, ., <file>]（开关参数与 "." 需跳过）
 */
function fileFromArgv(argv) {
  if (!Array.isArray(argv)) return null
  for (const raw of argv.slice(1)) {
    if (typeof raw !== 'string' || !raw) continue
    if (raw.startsWith('-')) continue
    if (raw === '.') continue
    const lower = raw.toLowerCase()
    if (!MD_EXTS.some((ext) => lower.endsWith(ext))) continue
    try {
      if (fsSync.statSync(raw).isFile()) return raw
    } catch {
      /* 路径不存在，继续找下一个 */
    }
  }
  return null
}

/** 把文件内容投递给渲染进程 */
function deliverFile(filePath) {
  if (!filePath) return false
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingFile = filePath
    return false
  }
  try {
    const text = fsSync.readFileSync(filePath, 'utf8')
    mainWindow.webContents.send('open-file', { path: filePath, text })
    return true
  } catch (err) {
    dialog.showErrorBox('无法打开文件', `${filePath}\n\n${err.message}`)
    return false
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 页面脚本执行完毕后再投递命令行文件，避免监听尚未注册
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingFile) {
      const target = pendingFile
      pendingFile = null
      deliverFile(target)
    }
  })

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // 外部链接交给系统浏览器，不在应用内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
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

// 单实例：双击第二个 md 时复用已开窗口，而不是再起一个进程
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = fileFromArgv(argv)
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      if (file) deliverFile(file)
    } else {
      if (file) pendingFile = file
      createWindow()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    // 冷启动：命令行可能已经带了文件
    pendingFile = fileFromArgv(process.argv)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
