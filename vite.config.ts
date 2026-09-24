import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // 让 Vite 忽略 Rust 源码目录（由 cargo 自己监听）
      ignored: ['**/src-tauri/**']
    }
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: !!process.env.TAURI_DEBUG
  }
})
