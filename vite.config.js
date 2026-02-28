import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), svgr()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
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
            // /api/news is handled by the Vercel serverless function (api/news.js)
            // via `vercel dev`. No Vite proxy needed — the function does
            // XML fetch + parse + JSON response internally.
        },
    },
})
