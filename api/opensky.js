// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — OpenSky Network proxy
//
// • Accepts the same query-params the client already sends (lamin, lomin, etc.)
// • Handles OAuth2 client_credentials token fetch server-side so credentials
//   never leave the backend.
// • Caches the Bearer token in module-level vars (shared across warm invocations).
// • Returns the raw OpenSky JSON to the client with a short Cache-Control header
//   so Vercel's CDN absorbs duplicate requests within the same 10s window.
// ─────────────────────────────────────────────────────────────────────────────

// ── Token cache (lives for the lifetime of the warm Lambda instance) ─────────
let _cachedToken = null
let _tokenExpiry = 0 // Unix ms
let _tokenPromise = null // in-flight fetch — prevents concurrent token requests

/**
 * Fetches (or returns cached) OAuth2 Bearer token from OpenSky's Keycloak.
 * Falls back to null (anonymous access) if credentials are missing or the
 * token request fails.
 */
async function getAccessToken() {
    const clientId = process.env.OPENSKY_USERNAME
    const clientSecret = process.env.OPENSKY_PASSWORD

    if (!clientId || !clientSecret) return null

    // Return cached token if still valid (30s safety buffer)
    if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken

    // If a fetch is already in-flight, wait for it — don't issue a second request
    if (_tokenPromise) return _tokenPromise

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
    })

    _tokenPromise = (async () => {
        try {
            const resp = await fetch(
                'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString(),
                }
            )

            if (!resp.ok) {
                console.error(`[api/opensky] Token fetch failed: HTTP ${resp.status}`)
                return null
            }

            const data = await resp.json()
            _cachedToken = data.access_token
            _tokenExpiry = Date.now() + (data.expires_in - 30) * 1000
            console.info(`[api/opensky] Token obtained — expires in ${data.expires_in}s`)
            return _cachedToken
        } catch (err) {
            console.error('[api/opensky] Token fetch error:', err.message)
            return null
        } finally {
            _tokenPromise = null // allow re-fetch on next expiry
        }
    })()

    return _tokenPromise
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
        const token = await getAccessToken()
        if (token) headers['Authorization'] = `Bearer ${token}`

        const upstream = await fetch(openskyUrl, { headers })

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
        console.error('[api/opensky] Handler error:', err.message)
        return res.status(502).json({ error: 'Failed to reach OpenSky Network', detail: err.message })
    }
}
