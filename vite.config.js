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
            // Proxy OAuth2 token endpoint — must be listed FIRST and use a
            // distinct prefix so it doesn't collide with /api/opensky below.
            '/auth/opensky': {
                target: 'https://auth.opensky-network.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/auth\/opensky/, ''),
                secure: true,
            },
            // Proxy OpenSky REST API calls
            '/api/opensky': {
                target: 'https://opensky-network.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/opensky/, '/api'),
                secure: true,
            },
            // Proxy Planespotters photo API — avoids browser CORS block
            '/api/planespotters': {
                target: 'https://api.planespotters.net',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/planespotters/, ''),
                secure: true,
            },
        },
    },
})
