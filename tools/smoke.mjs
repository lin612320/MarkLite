/**
 * 墨笔 — 浏览器冒烟检查（CDP）
 * 用法：node tools/smoke.mjs [http://localhost:1420/]
 *
 * 只做验证，不改动应用。依赖已启动的 headless Edge（--remote-debugging-port=9222）。
 */

const PORT = Number(process.env.CDP_PORT || 9222)
const expectUrl = process.argv[2] || 'http://localhost:1420/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const pages = list.filter((t) => t.type === 'page')
      // 优先按窗口标题定位（Electron 与浏览器都能命中）
      const byTitle = pages.find((t) => (t.title || '').includes('墨笔'))
      if (byTitle) return byTitle
      const byUrl = pages.find((t) => (t.url || '').startsWith(expectUrl.slice(0, 21)))
      if (byUrl) return byUrl
    } catch {
      /* CDP 未就绪 */
    }
    await sleep(500)
  }
  throw new Error(`找不到目标页面 target（port ${PORT}）`)
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  const consoleErrors = []
  const exceptions = []
  const failedRequests = []

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''))
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      failedRequests.push(`${msg.params.entry.source}: ${msg.params.entry.text} ${msg.params.entry.url || ''}`)
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 30000)
    })

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({ ws, send, consoleErrors, exceptions, failedRequests }))
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')))
  })
}

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.result?.exceptionDetails) {
    throw new Error('evaluate 异常: ' + JSON.stringify(res.result.exceptionDetails))
  }
  return res.result?.result?.value
}

const results = []
const check = (name, pass, detail, evidence) => {
  results.push({ name, pass, detail, evidence })
}

const main = async () => {
  const page = await findPage()
  const { send, consoleErrors, exceptions, failedRequests } = await connect(page.webSocketDebuggerUrl)

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')

  // 重新加载，收集本次加载的完整错误面（沿用页面自身 URL，兼容 file:// 与 http://）
  const reloadUrl = process.argv[2] || page.url || expectUrl
  await send('Page.navigate', { url: reloadUrl })
  await sleep(4000)

  // 0. 桌面桥接与宿主判定一致
  const bridge = await evaluate(
    send,
    `(() => ({ host: document.body.dataset.host, hasBridge: !!window.marklite, isDesktop: window.marklite ? window.marklite.isDesktop : null }))()`
  )
  const expectHost = page.url.startsWith('file:') ? 'electron' : 'browser'
  check(
    '桌面桥接与宿主判定一致',
    bridge && bridge.host === expectHost && (expectHost !== 'electron' || bridge.hasBridge === true),
    JSON.stringify(bridge)
  )

  // 0b. 文件读写 IPC 真实落盘（绕过对话框，直接验通道与权限）
  if (bridge && bridge.host === 'electron') {
    const probe = 'D:/Tools/tmp/marklite-io-test.md'
    const io = await evaluate(
      send,
      `(async () => {
        const content = '# IO 测试\\n\\n写入时间戳: ' + Date.now()
        await window.marklite.writeFile(${JSON.stringify(probe)}, content)
        const back = await window.marklite.readFile(${JSON.stringify(probe)})
        return { match: back === content, bytes: back.length, sample: back.slice(0, 20) }
      })()`
    )
    check('文件写入/读回 IPC 通道可用', io && io.match === true, JSON.stringify(io))
  }

  // 1. 编辑器挂载
  const mounted = await evaluate(send, `!!document.querySelector('#vditor .vditor-ir')`)
  check('Vditor IR 编辑器已挂载', mounted === true, `#vditor .vditor-ir → ${mounted}`)

  // 2. Markdown 真的被渲染（不是纯文本）。IR 模式的 h1 内含可编辑 marker，
  //    因此只断言标题元素存在且含标题文本。
  const heading = await evaluate(
    send,
    `(() => { const h = document.querySelector('.vditor-ir .vditor-reset h1'); return h ? { tag: h.tagName, text: h.textContent.trim() } : null })()`
  )
  check(
    'Markdown 渲染为 <h1>',
    !!heading && heading.tag === 'H1' && heading.text.includes('欢迎使用墨笔'),
    JSON.stringify(heading)
  )

  // 3. 表格 / 任务列表 / 代码块
  const rich = await evaluate(
    send,
    `(() => { const r = document.querySelector('.vditor-ir .vditor-reset'); return r ? { table: !!r.querySelector('table'), task: !!r.querySelector('input[type=checkbox]'), code: !!r.querySelector('pre code, .vditor-ir__marker--pre') } : null })()`
  )
  check('表格/任务列表/代码块均渲染', rich && rich.table && rich.task && rich.code, JSON.stringify(rich))

  // 4. 大纲面板
  const outline = await evaluate(send, `!!document.querySelector('.vditor-outline')`)
  check('右侧大纲面板存在', outline === true, `vditor-outline → ${outline}`)

  // 5. 状态栏字数统计（有值即代表 input 通路工作）
  const meta = await evaluate(send, `document.getElementById('status-meta').textContent`)
  check('状态栏字数统计', /\d+ 词/.test(meta || ''), `status-meta → ${JSON.stringify(meta)}`)

  // 6. 主题切换
  const themeBefore = await evaluate(send, `document.body.classList.contains('dark')`)
  const themeAfter = await evaluate(
    send,
    `(() => { document.getElementById('btn-theme').click(); return { dark: document.body.classList.contains('dark'), vditorDark: !!document.querySelector('.vditor--dark'), label: document.getElementById('btn-theme').textContent } })()`
  )
  check(
    '暗色主题切换生效',
    themeAfter.dark !== themeBefore && themeAfter.vditorDark === themeAfter.dark,
    `before=${themeBefore} after=${JSON.stringify(themeAfter)}`
  )
  await evaluate(send, `document.getElementById('btn-theme').click()`)

  // 7. 编辑后标记为脏（未保存提示）——用 CDP 真实键入，走 input 回调路径
  const nameBefore = await evaluate(send, `document.getElementById('doc-name').textContent`)
  await evaluate(send, `(() => { document.querySelector('.vditor-ir .vditor-reset').focus(); return true })()`)
  await send('Input.insertText', { text: '编辑测试' })
  await sleep(800)
  const nameAfter = await evaluate(send, `document.getElementById('doc-name').textContent`)
  check(
    '编辑后出现未保存标记 ●',
    nameAfter.startsWith('●'),
    `before=${nameBefore} → after=${JSON.stringify(nameAfter)}`
  )

  // 8. 截图（视觉证据）
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs/promises')
  const shotPath = 'D:\\Tools\\tmp\\marklite-smoke.png'
  await fs.writeFile(shotPath, Buffer.from(shot.result.data, 'base64'))
  check('截图已保存', true, shotPath)

  // 9. 错误面
  check('无未捕获异常', exceptions.length === 0, `exceptions=${exceptions.length}`, exceptions.join('\n'))
  check('无 console.error', consoleErrors.length === 0, `consoleErrors=${consoleErrors.length}`, consoleErrors.join('\n'))
  check('无加载失败资源', failedRequests.length === 0, `logErrors=${failedRequests.length}`, failedRequests.join('\n'))

  // 输出
  const failed = results.filter((r) => !r.pass)
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.name} — ${r.detail}`)
    if (!r.pass && r.evidence) console.log(`     证据: ${String(r.evidence).slice(0, 400)}`)
  }
  console.log(`\n汇总: ${results.length - failed.length}/${results.length} 通过`)

  send('Runtime.disable').catch(() => {})
  return failed.length === 0 ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('冒烟脚本失败:', err)
    process.exit(2)
  })
