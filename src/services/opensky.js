// ─────────────────────────────────────────────────────────────────────────────
// opensky.js — Aircraft photo lookup via the Planespotters.net proxy
//
// The Vercel serverless function at /api/planespotters proxies requests to
// https://api.planespotters.net to avoid CORS issues in the browser.
//
// Returns: { src, link, photographer } | null
// ─────────────────────────────────────────────────────────────────────────────

const photoCache = new Map()

/**
 * Fetch an aircraft photo by ICAO24 hex code.
 * Results are in-memory cached per session so repeated card opens are instant.
 *
 * @param {string} icao24 - lowercase hex ICAO24 address
 * @returns {Promise<{src: string, link: string, photographer: string} | null>}
 */
export async function fetchAircraftPhoto(icao24) {
    if (!icao24) return null

    const key = icao24.toLowerCase()
    if (photoCache.has(key)) return photoCache.get(key)

    try {
        const res = await fetch(`/api/planespotters/pub/photos/hex/${key}`)
        if (!res.ok) {
            photoCache.set(key, null)
            return null
        }

        const data = await res.json()
        const photo = data?.photos?.[0]
        if (!photo) {
            photoCache.set(key, null)
            return null
        }

        const result = {
            src:          photo.thumbnail_large?.src ?? photo.thumbnail?.src ?? null,
            link:         photo.link ?? `https://www.planespotters.net/photo/${photo.id}`,
            photographer: photo.photographer ?? 'Unknown',
        }

        photoCache.set(key, result)
        return result
    } catch {
        photoCache.set(key, null)
        return null
    }
}
