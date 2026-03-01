import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), svgr()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    // Pre-bundle Leaflet so Vite doesn't choke on its CJS/ESM mixed exports
    // in production builds — prevents "global is not defined" and icon errors.
    optimizeDeps: {
        include: ['leaflet'],
    },
    server: {
        proxy: {
            // In dev mode, proxy /api/opensky to the real OpenSky REST endpoint.
            // In production, Vercel serverless function handles this route.
            '/api/opensky': {
                target: 'https://opensky-network.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/opensky/, '/api/states/all'),
                secure: true,
            },
            // Proxy Planespotters photo API — avoids browser CORS block
            '/api/planespotters': {
                target: 'https://api.planespotters.net',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/planespotters/, ''),
                secure: true,
            },
            // /api/news and /api/flash are handled by Vercel serverless functions
            // (api/news.js, api/flash.js) via `vercel dev`. No Vite proxy needed.
        },
    },
})
