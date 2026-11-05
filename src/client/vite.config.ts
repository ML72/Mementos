import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Puts Google Tag Manager in production builds only, so `npm run dev` doesn't count as traffic
const googleTagManager: Plugin = {
  name: 'google-tag-manager',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'script',
      attrs: { async: true, src: 'https://www.googletagmanager.com/gtm.js?id=GTM-TJ7HT245' },
      injectTo: 'head-prepend'
    },
    { tag: 'script', attrs: { async: true, src: '/gtm_init.js' }, injectTo: 'head-prepend' }
  ]
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), googleTagManager],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[LOCAL DEVELOPMENT] Sending Request to Proxy Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[LOCAL DEVELOPMENT] Received Response from Proxy Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  }
})
