// 墨笔 — 预加载脚本：只暴露必要的文件能力，不暴露 Node 环境
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('marklite', {
  isDesktop: true,
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('dialog:open'),
  saveDialog: (defaultPath) => ipcRenderer.invoke('dialog:save', defaultPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath, contents) => ipcRenderer.invoke('fs:write', filePath, contents)
})
