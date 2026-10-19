# 更新日志

本文件格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-10-17

### 新增

- **文件关联**：NSIS 安装包注册 `.md` / `.markdown` / `.mdown`，双击直接在墨笔中打开
- **命令行参数**：`MarkLite.exe <file.md>` 可指定要打开的文件
- **单实例**：应用运行中再次双击文件时复用现有窗口，不再产生第二个进程
- **未保存保护**：打开新文件前确认，避免覆盖未保存内容

### 修复

- 冷启动时命令行带来的文件可能早于编辑器初始化（Vditor `after` 未触发），改为排队等待就绪后再落地
- 编辑器初始化完成前调用 `setTheme` 抛 `Cannot read properties of undefined` 的问题

### 变更

- Vditor 离线资源（约 22 MB）改为由 `postinstall` / `predev` / `prebuild` 钩子从 `node_modules` 同步，不再入库

## [1.0.0] - 2026-10-17

### 新增

- 首个可用版本：Vditor 即时渲染、GFM 语法、KaTeX 公式、右侧大纲、字数统计
- `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` 文件操作，未保存 `●` 标记
- 亮色 / 暗色主题切换，选择本地记忆
- 完全离线：KaTeX、Mermaid、highlight.js 全部内置，零 CDN 请求
- `tools/smoke.mjs`：CDP 冒烟回归脚本，打包产物实测 13 项通过
