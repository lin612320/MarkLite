# 墨笔（MarkLite）

免费、离线可用的本地 Markdown 编辑器，**打字即渲染**，对标 Typora 的使用体验。

> **独立性声明**：本项目是独立实现，不包含 Typora 的任何代码、资源或逆向产物，也不涉及任何授权绕过。所见即所得能力来自 MIT 许可的 [Vditor](https://github.com/Vanessa219/vditor)，桌面外壳来自 Electron。

## 已实现功能

| 能力 | 说明 |
| --- | --- |
| 即时渲染 | Vditor IR 模式，输入 Markdown 时同步渲染，保留语法标记便于编辑 |
| 语法覆盖 | GFM 表格、任务列表、代码块高亮、引用、脚注、KaTeX 数学公式 |
| 大纲面板 | 右侧标题大纲，随文档实时更新 |
| 字数统计 | 词数 / 字符数 / 行数 |
| 打开与保存 | `Ctrl+O` 打开、`Ctrl+S` 保存、`Ctrl+Shift+S` 另存为，原生系统对话框 |
| 双击打开 | 安装包注册 `.md` / `.markdown` / `.mdown` 关联，双击直接在墨笔中打开 |
| 单实例 | 运行中再次双击文件复用现有窗口，不产生第二个进程 |
| 未保存提示 | 标题栏显示 `●` 标记；打开新文件前会确认，避免覆盖 |
| 主题切换 | 亮色 / 暗色，选择记忆在 `localStorage` |
| 完全离线 | KaTeX、Mermaid、highlight.js 等全部随应用打包，不请求任何 CDN |

## 安装与文件关联

要让双击 `.md` 直接用墨笔打开，必须使用 **NSIS 安装包**（`MarkLite Setup x.y.z.exe`）。portable 版不写注册表，无法注册关联。

安装程序写入的关联：

```text
HKCU\Software\Classes\.md        → Markdown
HKCU\Software\Classes\Markdown   → "...\MarkLite.exe" "%1"
```

### 双击后仍被别的程序接管怎么办

Windows 10/11 用 `UserChoice`（Win11 另有 `UserChoiceLatest`）记录用户首选程序，优先级**高于**安装程序写入的 `HKCU\Software\Classes`。常见抢占者：联想「超级文本编辑器」、Typora、VSCode、Trae 等。

方式一，手动指定（推荐，最稳妥）：

右键任一 `.md` 文件 → 打开方式 → 选择其他应用 → 选「墨笔」→ 勾选「始终使用此应用」。

方式二，命令行清理（会丢掉其他程序的原有关联，先备份）：

```powershell
reg export 'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md' "$env:USERPROFILE\Desktop\md-backup.reg" /y

Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoiceLatest' -Recurse -Force -ErrorAction SilentlyContinue

# 重启资源管理器，让 Shell 重新读取关联
Stop-Process -Name explorer -Force; Start-Process explorer.exe
```

> 实测注意：portable 版运行时会解压到临时目录再启动，若曾手动把 portable 的 exe 设为打开方式，注册表里会留下 `Applications\MarkLite-1.0.0-portable.exe` 条目，抢占关联。换成安装版并清掉 `UserChoice` / `UserChoiceLatest` 后即恢复。

## 技术栈

- 前端：Vite 8 + Vditor 4.0（MIT）
- 外壳：Electron 44（`contextIsolation` 开启，`nodeIntegration` 关闭，`sandbox` 开启）
- 文件能力：主进程 `ipcMain.handle` 提供的窄接口，preload 只暴露 6 个方法（含 `onOpenFile` 事件订阅）

> 仓库同时保留了 Tauri 2 的配置（`src-tauri/`），但本机缺少 MSVC 链接器，`tauri build` 无法链接。装上 Visual Studio C++ 生成工具后可直接复用；也可以先卸载 Electron 外壳。

## 目录结构

```text
MarkLite/
├─ electron/           Electron 主进程与 preload
│  ├─ main.cjs         窗口、IPC、文件读写
│  └─ preload.cjs      contextBridge 暴露的窄接口
├─ src/                前端源码
│  ├─ main.js          编辑器逻辑与三端适配（Electron / Tauri / 浏览器）
│  └─ style.css        界面样式与主题变量
├─ public/vditor/      Vditor 离线资源（构建时复制进 dist）
├─ tools/smoke.mjs     CDP 冒烟回归脚本
├─ src-tauri/          Tauri 2 配置（当前未启用）
└─ release/            打包产物
```

## 常用命令

```bash
npm install            # 安装依赖（postinstall 自动同步 Vditor 离线资源）
npm run dev            # 浏览器开发模式，http://localhost:1420
npm run start          # 构建前端并用 Electron 打开
npm run dist           # 打包免安装 exe（输出到 release/）
npm run smoke          # 对运行中的应用跑冒烟检查
```

> **Windows 打包报 `EPERM: operation not permitted, rename`**：这是 Defender 的受控文件夹访问锁住了 `win-unpacked` 目录。把输出目录临时改到别的盘即可：
>
> ```bash
> npm run dist -- --config.directories.output=D:/tmp/marklite-release
> ```

### 冒烟检查用法

脚本通过 CDP 连接正在运行的应用，需要应用以调试端口启动：

```bash
# 桌面版
node_modules\.bin\electron.exe . --remote-debugging-port=9333
$env:CDP_PORT='9333'; npm run smoke

# 打包后的 exe
.\release\MarkLite-1.0.0-portable.exe --remote-debugging-port=9444
$env:CDP_PORT='9444'; npm run smoke
```

## 验证记录

在打包产物 `MarkLite-1.0.0-portable.exe` 上实测 **13 项全部通过**：

- 桌面桥接与宿主判定一致（`window.marklite.isDesktop`）
- 文件写入 / 读回 IPC 通道可用（中文 UTF-8 内容逐字节一致）
- Vditor IR 编辑器挂载、Markdown 渲染为 `<h1>`
- 表格 / 任务列表 / 代码块渲染
- 大纲面板、字数统计
- 暗色主题切换（`body.dark` 与 `.vditor--dark` 同步）
- 编辑后出现未保存标记 `●`
- 无未捕获异常、无 `console.error`、无加载失败资源

## 已知限制

- 关闭窗口时的未保存拦截依赖 `beforeunload`，在 Electron 中的实际行为**未验证**。
- 图片粘贴上传未配置；Vditor 的上传能力保持关闭状态。
- 无 PDF / Word / HTML 导出，工具栏未放导出入口。
- 无多标签页、无文件树侧栏、无 YAML front matter 面板。
- portable exe 启动时会解压到临时目录，首次启动比安装版慢几秒。

## 安全边界

- 渲染进程 `sandbox: true`、`nodeIntegration: false`，无法直接访问文件系统。
- 主进程只暴露 `dialog:open`、`dialog:save`、`fs:read`、`fs:write` 四个 IPC 通道。
- 外部链接交给系统浏览器打开，应用内不发起到外部的导航。

## 许可

MIT。
