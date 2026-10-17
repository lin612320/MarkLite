import Vditor from 'vditor'

/**
 * 墨笔 — 免费本地 Markdown 编辑器
 * 只使用 Vditor（MIT）与 Electron / Tauri 2 公开 API，
 * 未包含任何第三方商业软件代码。
 */

const WELCOME = `# 欢迎使用墨笔

一个**免费、离线可用**的 Markdown 编辑器，打字即渲染。

## 常用操作

| 操作 | 快捷键 |
| --- | --- |
| 打开文件 | \`Ctrl+O\` |
| 保存 | \`Ctrl+S\` |
| 另存为 | \`Ctrl+Shift+S\` |

## 支持的语法

- [x] 任务列表
- [x] 表格、代码块、脚注
- [x] 数学公式：$E = mc^2$
- [ ] 你的下一个想法

\`\`\`js
function hello(name) {
  return \`你好，\${name}\`
}
\`\`\`

> 写下去，就对了。
`

/* ------------------------------ 桌面能力探测 ------------------------------ */

const DESKTOP = (() => {
  if (window.marklite && window.marklite.isDesktop) return 'electron'
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) return 'tauri'
  return 'browser'
})()

let tauriApi = null
async function getTauri() {
  if (!tauriApi) {
    const [core, dialog] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/plugin-dialog')
    ])
    tauriApi = { invoke: core.invoke, open: dialog.open, save: dialog.save }
  }
  return tauriApi
}

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }
]

/** 弹出打开对话框并读取文本；取消返回 null */
async function pickAndReadFile() {
  if (DESKTOP === 'electron') {
    const path = await window.marklite.openFile()
    if (!path) return null
    const text = await window.marklite.readFile(path)
    return { path, text }
  }
  if (DESKTOP === 'tauri') {
    const api = await getTauri()
    const path = await api.open({ multiple: false, directory: false, filters: MD_FILTERS })
    if (!path) return null
    const text = await api.invoke('read_text_file', { path })
    return { path, text }
  }
  // 浏览器：<input type=file>
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
    input.onchange = async () => {
      const file = input.files && input.files[0]
      if (!file) return resolve(null)
      resolve({ path: file.name, text: await file.text() })
    }
    input.click()
  })
}

/** 写入指定路径；浏览器模式退化为下载 */
async function writeToPath(path, text, forceDialog) {
  if (DESKTOP === 'electron') {
    const target = forceDialog || !path ? await window.marklite.saveDialog(path || '未命名.md') : path
    if (!target) return null
    await window.marklite.writeFile(target, text)
    return target
  }
  if (DESKTOP === 'tauri') {
    const api = await getTauri()
    let target = path
    if (forceDialog || !target) {
      target = await api.save({ defaultPath: path || '未命名.md', filters: MD_FILTERS })
      if (!target) return null
    }
    await api.invoke('write_text_file', { path: target, contents: text })
    return target
  }
  // 浏览器：触发下载
  const name = String(path || '未命名.md').split(/[\\/]/).pop()
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}

/* ------------------------------ 编辑器状态 ------------------------------ */

let vditor = null
let editorReady = false
let currentPath = null
let dirty = false
let ignoreMutation = false
let metaTimer = null

const docNameEl = document.getElementById('doc-name')
const statusMsgEl = document.getElementById('status-msg')
const statusMetaEl = document.getElementById('status-meta')
const themeBtn = document.getElementById('btn-theme')

const baseName = (p) => String(p).split(/[\\/]/).pop()

function updateTitle() {
  const name = currentPath ? baseName(currentPath) : '未命名.md'
  docNameEl.textContent = (dirty ? '● ' : '') + name
  document.title = `${dirty ? '● ' : ''}${name} — 墨笔`
}

function setStatus(msg, kind = '') {
  statusMsgEl.textContent = msg
  statusMsgEl.className = kind
}

function computeMeta(value) {
  const chars = [...value].length
  const lines = value ? value.split('\n').length : 0
  const words = (value.match(/[\u4e00-\u9fa5]|[A-Za-z0-9_'-]+/g) || []).length
  return `${words} 词 · ${chars} 字符 · ${lines} 行`
}

function scheduleMeta() {
  clearTimeout(metaTimer)
  metaTimer = setTimeout(() => {
    if (editorReady) statusMetaEl.textContent = computeMeta(vditor.getValue())
  }, 200)
}

function markDirty() {
  if (dirty) return
  dirty = true
  updateTitle()
}

function markClean() {
  dirty = false
  updateTitle()
}

/** 写入内容并抑制「变脏」判定（用于打开文件、初始化） */
function setEditorValue(text) {
  ignoreMutation = true
  vditor.setValue(text)
  statusMetaEl.textContent = computeMeta(text)
  setTimeout(() => {
    ignoreMutation = false
  }, 400)
  markClean()
}

/**
 * input 回调覆盖键入路径；MutationObserver 兜底粘贴、拖拽、撤销等
 * 不经过 input 回调的变更路径（实测 execCommand 插入即属此类）。
 */
function watchChanges() {
  const root = document.querySelector('.vditor-ir .vditor-reset, .vditor-wysiwyg .vditor-reset')
  if (!root) return
  new MutationObserver(() => {
    if (ignoreMutation || !editorReady) return
    markDirty()
    scheduleMeta()
  }).observe(root, { childList: true, subtree: true, characterData: true })
}

/* ------------------------------ 命令 ------------------------------ */

async function openFile() {
  try {
    const picked = await pickAndReadFile()
    if (!picked) return
    setEditorValue(picked.text)
    currentPath = picked.path
    updateTitle()
    setStatus(DESKTOP === 'browser' ? '已打开（浏览器模式，不能写回磁盘）' : '已打开', 'saved')
  } catch (err) {
    console.error('[墨笔] 打开失败', err)
    setStatus(`打开失败：${err && err.message ? err.message : err}`, 'error')
  }
}

async function saveFile(forceDialog = false) {
  try {
    const text = vditor.getValue()
    const target = await writeToPath(currentPath, text, forceDialog)
    if (!target) return false
    currentPath = target
    markClean()
    setStatus(DESKTOP === 'browser' ? '已导出下载（浏览器模式）' : '已保存', 'saved')
    return true
  } catch (err) {
    console.error('[墨笔] 保存失败', err)
    setStatus(`保存失败：${err && err.message ? err.message : err}`, 'error')
    return false
  }
}

/* ------------------------------ 主题 ------------------------------ */

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark)
  themeBtn.textContent = dark ? '亮色' : '暗色'
  // setTheme 依赖编辑器内部实例，初始化完成前调用会抛错
  if (editorReady) {
    try {
      vditor.setTheme(dark ? 'dark' : 'classic')
    } catch (err) {
      console.warn('[墨笔] 主题应用失败', err)
    }
  }
  try {
    localStorage.setItem('marklite-theme', dark ? 'dark' : 'light')
  } catch {
    /* 忽略存储异常 */
  }
}

/* ------------------------------ 初始化 ------------------------------ */

function createEditor() {
  vditor = new Vditor('vditor', {
    mode: 'ir',
    height: '100%',
    cdn: './vditor',
    lang: 'zh_CN',
    cache: { enable: false },
    value: WELCOME,
    placeholder: '开始书写…',
    outline: { enable: true, position: 'right' },
    counter: { enable: true, type: 'markdown' },
    toolbarConfig: { pin: true },
    toolbar: [
      'headings', 'bold', 'italic', 'strike', '|',
      'list', 'ordered-list', 'check', '|',
      'quote', 'line', 'code', 'inline-code', '|',
      'link', 'table', '|',
      'undo', 'redo', '|',
      'outline', 'fullscreen'
    ],
    input: () => {
      markDirty()
      scheduleMeta()
    },
    after: () => {
      editorReady = true
      ignoreMutation = true
      applyTheme(document.body.classList.contains('dark'))
      statusMetaEl.textContent = computeMeta(vditor.getValue())
      markClean()
      watchChanges()
      setStatus(DESKTOP === 'browser' ? '就绪（浏览器模式）' : '就绪')
      setTimeout(() => {
        ignoreMutation = false
      }, 500)
    }
  })
}

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey
    if (!ctrl) return
    const key = e.key.toLowerCase()
    if (key === 's') {
      e.preventDefault()
      saveFile(e.shiftKey)
    } else if (key === 'o') {
      e.preventDefault()
      openFile()
    }
  })
}

// 关闭前提醒未保存内容
window.addEventListener('beforeunload', (e) => {
  if (!dirty) return
  e.preventDefault()
  e.returnValue = ''
})

function boot() {
  document.getElementById('btn-open').addEventListener('click', () => openFile())
  document.getElementById('btn-save').addEventListener('click', () => saveFile(false))
  document.getElementById('btn-save-as').addEventListener('click', () => saveFile(true))

  let dark = false
  try {
    dark = localStorage.getItem('marklite-theme') === 'dark'
  } catch {
    dark = false
  }
  themeBtn.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('dark'))
  })

  document.body.classList.toggle('dark', dark)
  themeBtn.textContent = dark ? '亮色' : '暗色'
  document.body.dataset.host = DESKTOP

  createEditor()
  bindShortcuts()
}

boot()
