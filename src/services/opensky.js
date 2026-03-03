import axios from 'axios'

// ─── Axios instance ──────────────────────────────────────────────────────────
// In production, requests hit Vercel serverless functions at /api/opensky and
// /api/planespotters. In dev, Vite's dev-server proxy forwards these to the
// real upstream APIs. Auth is handled server-side in both cases.
const api = axios.create({ timeout: 15_000 })

// ─── Constants ────────────────────────────────────────────────────────────────

// In production this hits the Vercel serverless function (api/opensky.js).
// In dev this hits Vite's proxy → https://opensky-network.org/api/states/all.
const BASE_URL = '/api/opensky'

/**
 * EMEA (Europe, Middle East & Africa) bounding box
 * Covers: All of Europe (incl. Scandinavia & Iceland), North Africa,
 *         Sub-Saharan Africa, Arabian Peninsula, Levant, Turkey,
 *         Iran, Gulf states, Central Asia borders
 *   lat: -35°S (South Africa) → 72°N (Northern Scandinavia)
 *   lon: -25°W (Iceland / W. Africa) → 63°E (Pakistan border)
 */
const BBOX = {
    lamin: -35.0,
    lomin: -25.0,
    lamax: 72.0,
    lomax: 63.0,
}

const M_TO_FT = 3.28084
const MS_TO_KT = 1.94384
const FT_PER_MIN = 196.85 // m/s → ft/min

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000 // 1 s → 2 s → 4 s

// ─── OpenSky state-vector field indices ───────────────────────────────────────
// https://openskynetwork.github.io/opensky-api/rest.html#response
const F = {
    ICAO24: 0,
    CALLSIGN: 1,
    ORIGIN_COUNTRY: 2,
    LAST_CONTACT: 4,
    LONGITUDE: 5,
    LATITUDE: 6,
    BARO_ALT: 7,
    ON_GROUND: 8,
    VELOCITY: 9,
    HEADING: 10,
    VERT_RATE: 11,
}

// ─── Module-level last-known state cache ──────────────────────────────────────
let _lastKnownFlights = []

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Converts a raw OpenSky state-vector array into a clean flight object.
 * @param {Array} sv  Single state-vector entry from the API response.
 * @returns {Object}
 */
const normalise = (sv) => ({
    icao24: sv[F.ICAO24] ?? '',
    callsign: (sv[F.CALLSIGN] ?? '').trim(),
    latitude: sv[F.LATITUDE],
    longitude: sv[F.LONGITUDE],
    altitude: sv[F.BARO_ALT] != null ? sv[F.BARO_ALT] * M_TO_FT : null,
    velocity: sv[F.VELOCITY] != null ? sv[F.VELOCITY] * MS_TO_KT : null,
    heading: sv[F.HEADING] ?? 0,
    verticalRate: sv[F.VERT_RATE] != null ? sv[F.VERT_RATE] * FT_PER_MIN : 0,
    onGround: sv[F.ON_GROUND] ?? false,
    lastContact: sv[F.LAST_CONTACT] ?? 0,
    originCountry: sv[F.ORIGIN_COUNTRY] ?? '',
})

// ─── Retry helper ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wraps an async factory with exponential-backoff retry logic.
 * @param {() => Promise<T>} fn        Async function to retry.
 * @param {number}           retries   Maximum attempts remaining.
 * @param {number}           delay     Current delay in ms.
 * @returns {Promise<T>}
 */
const withRetry = async (fn, retries = MAX_RETRIES, delay = BASE_DELAY_MS) => {
    try {
        return await fn()
    } catch (err) {
        // Never retry a 429 — it wastes quota and extends the ban window
        if (err?.response?.status === 429) throw err
        if (retries <= 0) throw err
        console.warn(
            `[opensky] Request failed – retrying in ${delay}ms ` +
                `(${retries} attempt(s) left). Reason: ${err.message}`
        )
        await sleep(delay)
        return withRetry(fn, retries - 1, delay * 2)
    }
}

// Timestamp until which we should not re-attempt (rate-limit cooldown)
let _rateLimitedUntil = 0
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000 // 2 minutes (authenticated API recovers quickly)

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches live flight states for the EMEA bounding box.
 * On any unrecoverable error the last known flight array is returned so the
 * UI never goes blank.
 *
 * @returns {Promise<Array>} Normalised, filtered flight objects.
 */
export const fetchFlights = async () => {
    // Respect rate-limit cooldown — return cached data without hitting the API
    if (Date.now() < _rateLimitedUntil) {
        const remainingSec = Math.ceil((_rateLimitedUntil - Date.now()) / 1000)
        console.warn(`[opensky] Rate-limited. Resuming in ${remainingSec}s.`)
        return _lastKnownFlights
    }

    try {
        // Auth is handled server-side by the Vercel serverless function (api/opensky.js).
        // In dev mode, Vite's proxy forwards to OpenSky directly (no auth in dev).
        console.info(`[opensky] Fetching flights — url: ${BASE_URL}`)

        const data = await withRetry(async () => {
            const resp = await api.get(BASE_URL, {
                params: BBOX,
            })
            console.info(`[opensky] API response: HTTP ${resp.status}, states: ${resp.data?.states?.length ?? 'null'}`)
            return resp.data
        })

        const states = data?.states ?? []
        console.info(`[opensky] Raw states: ${states.length}`)

        const flights = states
            .map(normalise)
            .filter(
                (f) =>
                    f.latitude != null &&
                    f.longitude != null &&
                    !f.onGround
            )

        console.info(`[opensky] ✅ Airborne flights after filter: ${flights.length}`)
        _lastKnownFlights = flights
        return flights
    } catch (err) {
        if (err?.response?.status === 429) {
            _rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
            console.warn('[opensky] 429 received — pausing requests for 10 minutes.')
        } else {
            console.error('[opensky] ❌ All retries exhausted:', err?.response?.status, err.message)
        }
        return _lastKnownFlights
    }
}

// ─── Aircraft photo (Planespotters.net) ───────────────────────────────────────

/** In-memory cache: icao24 → { src, link, photographer } | null */
const _photoCache = new Map()

/**
 * Fetches the best available photo for an aircraft by ICAO24 hex.
 * Uses the free Planespotters.net public photo API (no key required).
 * Results are cached in memory for the lifetime of the page.
 *
 * @param {string} icao24 — hex string (any case)
 * @returns {Promise<{ src: string, link: string, photographer: string } | null>}
 */
export const fetchAircraftPhoto = async (icao24) => {
    if (!icao24) return null
    const key = icao24.toLowerCase()

    if (_photoCache.has(key)) return _photoCache.get(key)

    try {
        const res = await fetch(`/api/planespotters/pub/photos/hex/${key}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const photo = data?.photos?.[0] ?? null
        const result = photo
            ? {
                  src:          photo.thumbnail_large?.src ?? photo.thumbnail?.src,
                  link:         photo.link,
                  photographer: photo.photographer,
              }
            : null
        _photoCache.set(key, result)
        return result
    } catch (e) {
        console.warn('[photo] Failed to fetch photo for', icao24, e.message)
        _photoCache.set(key, null)
        return null
    }
}
