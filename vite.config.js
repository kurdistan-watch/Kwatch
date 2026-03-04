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
            // Proxy Planespotters photo API — avoids browser CORS block
            '/api/planespotters': {
                target: 'https://api.planespotters.net',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/planespotters/, ''),
                secure: true,
            },
            // /api/news, /api/flash, /api/adsb etc. are handled by `vercel dev`
        },
    },
})
