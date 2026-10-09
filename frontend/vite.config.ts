import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, type ProxyOptions } from 'vite'

type ProxyServer = Parameters<NonNullable<ProxyOptions['configure']>>[0]

// Dev on the laptop only: HTTPS with the mkcert certs when they exist, API proxied to FastAPI.
// Phone testing uses the production build served by FastAPI on :8443.
const key = '../certs/gupai-key.pem'
const cert = '../certs/gupai.pem'
const https = existsSync(key) && existsSync(cert) ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https,
    // The backend requires Origin == its own host on mutations, so rewrite it for dev only.
    proxy: Object.fromEntries(['/api', '/pair'].map(p => [p, {
      target: 'https://localhost:8443', secure: false,
      configure: (proxy: ProxyServer) => proxy.on('proxyReq', req => req.setHeader('origin', 'https://localhost:8443')),
    }])),
  },
})
