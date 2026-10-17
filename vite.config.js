import { defineConfig } from 'vite'

// Tauri 要求固定端口，且不要把 Rust 侧产物纳入监听
export default defineConfig({
  // 相对路径：Electron 用 file:// 加载 dist/index.html 时必须
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    // WebView2 基于 Edge，可直接用较新的语法
    target: 'chrome110',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000
  }
})
