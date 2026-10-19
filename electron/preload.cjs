// 墨笔 — 预加载脚本：只暴露必要的文件能力，不暴露 Node 环境
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('marklite', {
  isDesktop: true,
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('dialog:open'),
  saveDialog: (defaultPath) => ipcRenderer.invoke('dialog:save', defaultPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath, contents) => ipcRenderer.invoke('fs:write', filePath, contents),
  /**
   * 订阅「从命令行 / 文件关联打开文件」事件，返回取消订阅函数。
   */
  onOpenFile: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('open-file', listener)
    return () => ipcRenderer.removeListener('open-file', listener)
  }
})
