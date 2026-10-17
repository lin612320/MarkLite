/**
 * 把 Vditor 的分发资源同步到 public/vditor/dist。
 *
 * 这些资源（KaTeX、Mermaid、highlight.js、lute 等）体积约 22 MB，
 * 属于第三方构建产物，因此不入库；由 npm 的 predev / prebuild 钩子生成。
 */
import { cp, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'node_modules/vditor/dist')
const dest = resolve(root, 'public/vditor/dist')

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(src))) {
    console.error('❌ 找不到 node_modules/vditor/dist，请先执行 npm install')
    process.exit(1)
  }
  // 目标已存在则跳过复制，避免每次启动都搬 22 MB
  if (await exists(dest)) {
    console.log('✅ Vditor 资源已就绪，跳过同步')
    return
  }
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log('✅ 已同步 Vditor 资源到 public/vditor/dist')
}

main().catch((err) => {
  console.error('❌ 同步 Vditor 资源失败:', err)
  process.exit(1)
})
