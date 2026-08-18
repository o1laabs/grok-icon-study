import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

function serveReplica(): Plugin {
  const root = fileURLToPath(new URL('./replica', import.meta.url))
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.md': 'text/markdown; charset=utf-8'
  }
  return {
    name: 'serve-replica',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/replica/')) {
          next()
          return
        }
        const rel = decodeURIComponent(req.url.slice('/replica/'.length).split('?')[0] || '')
        const file = path.resolve(root, rel)
        if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
        res.end(fs.readFileSync(file))
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), serveReplica()],
  server: { port: 5191 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  }
})
