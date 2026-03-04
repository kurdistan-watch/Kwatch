import axios from 'axios'

// ─────────────────────────────────────────────────────────────────────────────
// adsb.js — adsb.lol client service
//
// Fetches live aircraft from our /api/adsb serverless proxy (which proxies
// the free, open adsb.lol API) and normalises the response into the same
// flight object shape that the rest of the app expects (same as opensky.js).
// adsb.lol is API-compatible with ADS-B Exchange and requires NO API key.
// ─────────────────────────────────────────────────────────────────────────────

const api = axios.create({ timeout: 15_000 })

const BASE_URL = '/api/adsb'

// ── Registration prefix → country (for EMEA countries) ───────────────────────
// adsb.lol provides the aircraft registration (e.g. "G-ABCD") but not
// the origin country. We derive country from the registration prefix for the
// countries relevant to classification and alert logic.
const REG_PREFIXES = [
    // Americas (watchlist)
    ['N',    'United States'],
    // Europe
    ['G-',   'United Kingdom'],
    ['F-',   'France'],
    ['D-',   'Germany'],
    ['I-',   'Italy'],
    ['EC-',  'Spain'],
    ['PH-',  'Netherlands'],
    ['OO-',  'Belgium'],
    ['HB-',  'Switzerland'],
    ['SE-',  'Sweden'],
    ['OY-',  'Denmark'],
    ['LN-',  'Norway'],
    ['OH-',  'Finland'],
    ['SP-',  'Poland'],
    ['OK-',  'Czech Republic'],
    ['HA-',  'Hungary'],
    ['YR-',  'Romania'],
    ['LZ-',  'Bulgaria'],
    ['SX-',  'Greece'],
    ['CS-',  'Portugal'],
    ['OE-',  'Austria'],
    ['EI-',  'Ireland'],
    ['TF-',  'Iceland'],
    ['ES-',  'Estonia'],
    ['YL-',  'Latvia'],
    ['LY-',  'Lithuania'],
    ['9H-',  'Malta'],
    ['9A-',  'Croatia'],
    ['S5-',  'Slovenia'],
    ['OM-',  'Slovakia'],
    ['Z3-',  'North Macedonia'],
    ['UR-',  'Ukraine'],
    ['RA-',  'Russia'],
    ['RF-',  'Russia'],
    // Middle East
    ['EP-',  'Iran'],
    ['4X-',  'Israel'],
    ['TC-',  'Turkey'],
    ['YK-',  'Syria'],
    ['HZ-',  'Saudi Arabia'],
    ['A6-',  'United Arab Emirates'],
    ['9K-',  'Kuwait'],
    ['YI-',  'Iraq'],
    ['JY-',  'Jordan'],
    ['OD-',  'Lebanon'],
    ['A7-',  'Qatar'],
    ['A4O-', 'Oman'],
    ['A9C-', 'Bahrain'],
    ['70-',  'Yemen'],
    // Central & South Asia
    ['AP-',  'Pakistan'],
    ['VT-',  'India'],
    ['UK-',  'Uzbekistan'],
    ['EK-',  'Armenia'],
    ['4K-',  'Azerbaijan'],
    ['UP-',  'Kazakhstan'],
    ['UN-',  'Kazakhstan'],
    ['EY-',  'Tajikistan'],
    ['EX-',  'Kyrgyzstan'],
    ['EZ-',  'Turkmenistan'],
    ['YA-',  'Afghanistan'],
    // Africa
    ['SU-',  'Egypt'],
    ['5A-',  'Libya'],
    ['TS-',  'Tunisia'],
    ['7T-',  'Algeria'],
    ['CN-',  'Morocco'],
    ['5N-',  'Nigeria'],
    ['5H-',  'Tanzania'],
    ['5Y-',  'Kenya'],
    ['5X-',  'Uganda'],
    ['ET-',  'Ethiopia'],
    ['6O-',  'Somalia'],
    ['ZS-',  'South Africa'],
    ['Z-',   'Zimbabwe'],
    ['9J-',  'Zambia'],
    ['TJ-',  'Cameroon'],
    ['D2-',  'Angola'],
    ['9G-',  'Ghana'],
    ['6V-',  'Senegal'],
    ['TU-',  'Ivory Coast'],
]

const countryFromRegistration = (reg) => {
    if (!reg) return ''
    for (const [prefix, country] of REG_PREFIXES) {
        if (reg.startsWith(prefix)) return country
    }
    return ''
}

// ── Module-level last-known state cache ───────────────────────────────────────
let _lastKnownFlights = []

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Converts a raw adsb.lol aircraft object into the app's flight shape.
 * adsb.lol (like ADS-B Exchange) reports alt_baro in feet and gs in knots.
 *
 * @param {Object} ac  Single aircraft entry from the adsb.lol response.
 * @returns {Object}
 */
const normalise = (ac) => {
    // alt_baro is a number (feet) when airborne, or the string "ground"
    const onGround = typeof ac.alt_baro === 'string'
    const altitude = onGround ? null : (ac.alt_baro ?? null)

    // seen = seconds since last message; convert to Unix epoch for classifier
    const lastContact = Math.floor(Date.now() / 1000) - (ac.seen ?? 0)

    return {
        icao24:        (ac.hex ?? '').toLowerCase(),
        callsign:      (ac.flight ?? '').trim(),
        latitude:      ac.lat  ?? null,
        longitude:     ac.lon  ?? null,
        altitude,
        velocity:      ac.gs   ?? null,   // ground speed in knots
        heading:       ac.track ?? 0,
        verticalRate:  typeof ac.baro_rate === 'number' ? ac.baro_rate : 0,
        onGround,
        lastContact,
        originCountry: countryFromRegistration(ac.r),
        source:        'adsb',
    }
}

// ── Retry helper ──────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const withRetry = async (fn, retries = 2, delay = 1000) => {
    try {
        return await fn()
    } catch (err) {
        if (err?.response?.status === 429) throw err
        if (retries <= 0) throw err
        await sleep(delay)
        return withRetry(fn, retries - 1, delay * 2)
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches live aircraft from adsb.lol for the EMEA region via our /api/adsb proxy.
 * Returns the last-known list on any error so the UI never goes blank.
 *
 * @returns {Promise<Array>} Normalised, airborne-only flight objects.
 */
export const fetchFlightsADSB = async () => {
    try {
        console.info('[adsb] Fetching flights from adsb.lol')

        const data = await withRetry(async () => {
            const resp = await api.get(BASE_URL)
            console.info(`[adsb] API response: HTTP ${resp.status}, aircraft: ${resp.data?.ac?.length ?? 'null'}`)
            return resp.data
        })

        const aircraft = data?.ac ?? []

        const flights = aircraft
            .map(normalise)
            .filter(
                (f) =>
                    f.latitude  != null &&
                    f.longitude != null &&
                    !f.onGround
            )

        console.info(`[adsb] ✅ Airborne flights received: ${flights.length}`)
        _lastKnownFlights = flights
        return flights
    } catch (err) {
        if (err?.response?.status === 503) {
            // Proxy returned 503 (unexpected since adsb.lol needs no key)
            console.info('[adsb] Proxy unavailable (503), skipping adsb.lol source')
            return []
        }
        console.error('[adsb] ❌ Fetch failed:', err?.response?.status, err.message)
        return _lastKnownFlights
    }
}
