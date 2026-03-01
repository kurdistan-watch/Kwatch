// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Planespotters.net CORS proxy
//
// The client requests paths like:
//   /api/planespotters/pub/photos/hex/a1b2c3
//
// vercel.json rewrites /api/planespotters/:path* → /api/planespotters
// The captured :path* segments arrive in req.query.path as an array.
//
// This function forwards the path to https://api.planespotters.net/...
//
// Aircraft photos rarely change, so the response is cached aggressively.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // req.query.path is an array from the vercel.json rewrite capture, e.g. ["pub","photos","hex","a1b2c3"]
        const pathSegments = req.query.path
        const forwardPath = Array.isArray(pathSegments) ? pathSegments.join('/') : (pathSegments ?? '')

        if (!forwardPath) {
            return res.status(400).json({ error: 'Missing path parameter' })
        }

        const targetUrl = `https://api.planespotters.net/${forwardPath}`

        const upstream = await fetch(targetUrl, {
            headers: { Accept: 'application/json' },
        })

        if (!upstream.ok) {
            const status = upstream.status
            const body = await upstream.text()
            console.error(`[api/planespotters] Upstream error: HTTP ${status}`, body.slice(0, 200))
            return res.status(status).json({ error: `Planespotters returned HTTP ${status}` })
        }

        const data = await upstream.json()

        // Photos don't change often — cache aggressively
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
        res.setHeader('Content-Type', 'application/json')
        return res.status(200).json(data)
    } catch (err) {
        console.error('[api/planespotters] Handler error:', err.message)
        return res.status(502).json({ error: 'Failed to reach Planespotters API', detail: err.message })
    }
}
