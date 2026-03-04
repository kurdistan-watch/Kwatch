// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — OpenSky Network proxy
//
// • Accepts the same query-params the client already sends (lamin, lomin, etc.)
// • Uses HTTP Basic Auth (username:password) — simpler and more reliable from
//   Vercel's infrastructure than OAuth2 client_credentials token exchange.
// • Returns the raw OpenSky JSON to the client with a short Cache-Control header
//   so Vercel's CDN absorbs duplicate requests within the same 10s window.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a Basic Auth header value from env credentials, or null if missing.
 * OpenSky supports HTTP Basic Auth directly on the REST API — no token
 * exchange needed, and it works reliably from all server IPs including Vercel.
 */
function getBasicAuthHeader() {
    const username = process.env.OPENSKY_USERNAME
    const password = process.env.OPENSKY_PASSWORD

    if (!username || !password) {
        console.warn('[api/opensky] Missing credentials — OPENSKY_USERNAME or OPENSKY_PASSWORD not set. Falling back to anonymous.')
        return null
    }

    const encoded = Buffer.from(`${username}:${password}`).toString('base64')
    console.info(`[api/opensky] Using Basic Auth for user: ${username}`)
    return `Basic ${encoded}`
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    // Only allow GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Forward query params from the client (lamin, lomin, lamax, lomax, etc.)
        const params = new URLSearchParams(req.query)
        const openskyUrl = `https://opensky-network.org/api/states/all?${params.toString()}`

        // Build request headers
        const headers = { Accept: 'application/json' }
        const basicAuth = getBasicAuthHeader()
        if (basicAuth) {
            headers['Authorization'] = basicAuth
            console.info('[api/opensky] Sending authenticated request (Basic Auth)')
        } else {
            console.warn('[api/opensky] Sending ANONYMOUS request — no credentials available')
        }

        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), 25_000)

        const upstream = await fetch(openskyUrl, { headers, signal: controller.signal })
        clearTimeout(timeoutId)

        if (!upstream.ok) {
            // Forward rate-limit status to the client so it can back off
            const status = upstream.status
            const body = await upstream.text()
            console.error(`[api/opensky] Upstream error: HTTP ${status}`, body.slice(0, 200))
            return res.status(status).json({ error: `OpenSky returned HTTP ${status}`, detail: body.slice(0, 500) })
        }

        const data = await upstream.json()

        // Short-lived CDN cache — OpenSky data updates every ~10s
        res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
        res.setHeader('Content-Type', 'application/json')
        return res.status(200).json(data)
    } catch (err) {
        console.error('[api/opensky] Handler error:', err.name === 'AbortError' ? 'fetch timed out after 25 s' : err.message)
        return res.status(502).json({ error: 'Failed to reach OpenSky Network', detail: err.name === 'AbortError' ? 'upstream timeout' : err.message })
    }
}
