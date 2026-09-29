import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 部署到 GitHub Pages 的项目页时，资源路径需要带上仓库名前缀。
 * 例如仓库是 https://github.com/xxx/our-days ，就执行：
 *   VITE_BASE=/our-days/ npm run build
 * 本地开发 / 用户主页仓库（xxx.github.io）保持默认 '/' 即可。
 */
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2022',
    // 不内联图片，交给 HTTP 缓存
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
})
