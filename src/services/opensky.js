import axios from 'axios'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://opensky-network.org/api/states/all'

/** Kurdistan region + buffer bounding box */
const BBOX = {
    lamin: 35.0,
    lomin: 42.0,
    lamax: 37.5,
    lomax: 46.5,
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

// ─── Axios instance ───────────────────────────────────────────────────────────

const _buildAuthHeader = () => {
    const user = import.meta.env.VITE_OPENSKY_USERNAME
    const pass = import.meta.env.VITE_OPENSKY_PASSWORD
    if (user && pass) {
        const encoded = btoa(`${user}:${pass}`)
        return { Authorization: `Basic ${encoded}` }
    }
    return {}
}

const api = axios.create({
    baseURL: 'https://opensky-network.org/api',
    timeout: 10_000,
})

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
        if (retries <= 0) throw err
        console.warn(
            `[opensky] Request failed – retrying in ${delay}ms ` +
                `(${retries} attempt(s) left). Reason: ${err.message}`
        )
        await sleep(delay)
        return withRetry(fn, retries - 1, delay * 2)
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches live flight states for the Kurdistan bounding box.
 * On any unrecoverable error the last known flight array is returned so the
 * UI never goes blank.
 *
 * @returns {Promise<Array>} Normalised, filtered flight objects.
 */
export const fetchFlights = async () => {
    try {
        const data = await withRetry(async () => {
            const resp = await axios.get(BASE_URL, {
                params: BBOX,
                headers: _buildAuthHeader(),
                timeout: 10_000,
            })
            return resp.data
        })

        const states = data?.states ?? []

        const flights = states
            .map(normalise)
            .filter(
                (f) =>
                    f.latitude != null &&
                    f.longitude != null &&
                    !f.onGround
            )

        _lastKnownFlights = flights
        return flights
    } catch (err) {
        console.error('[opensky] All retries exhausted – returning last known state.', err)
        return _lastKnownFlights
    }
}

export default api
