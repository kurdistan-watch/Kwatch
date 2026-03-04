// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — OpenSky-compatible proxy backed by adsb.lol
//
// OpenSky Network blocks requests from Vercel's AWS infrastructure (fetch failed).
// This function uses adsb.lol — a free, open, no-auth API that works from all
// server IPs — and converts its response into the OpenSky state-vector format
// that the client (src/services/opensky.js) already understands.
//
// OpenSky state-vector field order (what the client expects):
//   [0]  icao24          string
//   [1]  callsign        string
//   [2]  origin_country  string
//   [3]  time_position   number|null
//   [4]  last_contact    number
//   [5]  longitude       number|null
//   [6]  latitude        number|null
//   [7]  baro_altitude   number|null  (metres)
//   [8]  on_ground       boolean
//   [9]  velocity        number|null  (m/s)
//   [10] true_track      number|null  (degrees)
//   [11] vertical_rate   number|null  (m/s)
//   [12] sensors         null
//   [13] geo_altitude    number|null  (metres)
//   [14] squawk          string|null
//   [15] spi             boolean
//   [16] position_source number
// ─────────────────────────────────────────────────────────────────────────────

// ── Registration prefix → country ────────────────────────────────────────────
const REG_PREFIXES = [
    ['N',    'United States'],
    ['G-',   'United Kingdom'],
    ['F-',   'France'],
    ['D-',   'Germany'],
    ['I-',   'Italy'],
    ['EC-',  'Spain'],
    ['PH-',  'Netherlands'],
    ['OO-',  'Belgium'],
    ['HB-',  'Switzerland'],
    ['SE-',  'Sweden'],   ['OY-', 'Denmark'],  ['LN-', 'Norway'],   ['OH-', 'Finland'],
    ['SP-',  'Poland'],   ['OK-', 'Czech Republic'], ['HA-', 'Hungary'],
    ['YR-',  'Romania'],  ['LZ-', 'Bulgaria'], ['SX-', 'Greece'],
    ['CS-',  'Portugal'], ['OE-', 'Austria'],  ['EI-', 'Ireland'],  ['TF-', 'Iceland'],
    ['ES-',  'Estonia'],  ['YL-', 'Latvia'],   ['LY-', 'Lithuania'],
    ['9A-',  'Croatia'],  ['S5-', 'Slovenia'], ['OM-', 'Slovakia'],
    ['UR-',  'Ukraine'],  ['RA-', 'Russia'],   ['RF-', 'Russia'],
    ['EP-',  'Iran'],     ['4X-', 'Israel'],   ['TC-', 'Turkey'],
    ['YK-',  'Syria'],    ['HZ-', 'Saudi Arabia'], ['A6-', 'United Arab Emirates'],
    ['9K-',  'Kuwait'],   ['YI-', 'Iraq'],     ['JY-', 'Jordan'],
    ['OD-',  'Lebanon'],  ['A7-', 'Qatar'],    ['A4O-','Oman'],
    ['A9C-', 'Bahrain'],  ['70-', 'Yemen'],
    ['AP-',  'Pakistan'], ['VT-', 'India'],    ['UK-', 'Uzbekistan'],
    ['EK-',  'Armenia'],  ['4K-', 'Azerbaijan'], ['UP-', 'Kazakhstan'],
    ['SU-',  'Egypt'],    ['5A-', 'Libya'],    ['TS-', 'Tunisia'],
    ['7T-',  'Algeria'],  ['CN-', 'Morocco'],
    ['B-',   'China'],    ['JA-', 'Japan'],    ['HL-', 'South Korea'],
    ['VN-',  'Vietnam'],  ['HS-', 'Thailand'], ['9M-', 'Malaysia'],
    ['PK-',  'Indonesia'],['4R-', 'Sri Lanka'],
]

function countryFromReg(reg) {
    if (!reg) return 'Unknown'
    for (const [prefix, country] of REG_PREFIXES) {
        if (reg.startsWith(prefix)) return country
    }
    return 'Unknown'
}

const KT_TO_MS = 0.514444  // knots → m/s
const FT_TO_M  = 0.3048    // feet  → metres

/**
 * Converts a single adsb.lol aircraft object to an OpenSky state-vector array.
 */
function toStateVector(ac) {
    const altBaro  = ac.alt_baro  != null && ac.alt_baro  !== 'ground' ? ac.alt_baro  * FT_TO_M : null
    const altGeom  = ac.alt_geom != null                               ? ac.alt_geom  * FT_TO_M : null
    const velocity = ac.gs       != null                               ? ac.gs        * KT_TO_MS : null
    const vertRate = ac.geom_rate != null                              ? ac.geom_rate * FT_TO_M / 60 : null
    const onGround = ac.alt_baro === 'ground' || ac.on_ground === true

    return [
        (ac.hex    ?? '').toLowerCase(),   // [0]  icao24
        (ac.flight ?? '').trim(),          // [1]  callsign
        countryFromReg(ac.r ?? ''),        // [2]  origin_country
        ac.seen_pos  ?? null,              // [3]  time_position
        ac.seen      ?? 0,                 // [4]  last_contact
        ac.lon       ?? null,              // [5]  longitude
        ac.lat       ?? null,              // [6]  latitude
        altBaro,                           // [7]  baro_altitude (m)
        onGround,                          // [8]  on_ground
        velocity,                          // [9]  velocity (m/s)
        ac.track     ?? null,              // [10] true_track
        vertRate,                          // [11] vertical_rate (m/s)
        null,                              // [12] sensors
        altGeom,                           // [13] geo_altitude (m)
        ac.squawk    ?? null,              // [14] squawk
        false,                             // [15] spi
        0,                                 // [16] position_source
    ]
}

// ── Zone grid — EMEA + Asia civilian coverage ─────────────────────────────────
const ZONES = [
    // Priority 1 — KRI / Middle East
    { lat: '36.0', lon: '44.0' }, { lat: '33.0', lon: '36.0' },
    { lat: '33.0', lon: '52.0' }, { lat: '26.0', lon: '44.0' },
    { lat: '26.0', lon: '56.0' }, { lat: '39.0', lon: '35.0' },
    // Priority 2 — Europe
    { lat: '54.0', lon: '-2.0' }, { lat: '46.0', lon: '2.0'  },
    { lat: '54.0', lon: '14.0' }, { lat: '46.0', lon: '14.0' },
    { lat: '39.0', lon: '-5.0' }, { lat: '39.0', lon: '10.0' },
    { lat: '46.0', lon: '28.0' }, { lat: '54.0', lon: '30.0' },
    { lat: '64.0', lon: '18.0' },
    // Priority 3 — North Africa
    { lat: '27.0', lon: '30.0' }, { lat: '33.0', lon: '3.0'  },
    { lat: '33.0', lon: '-7.0' },
    // Priority 4 — South & East Asia
    { lat: '30.0', lon: '70.0' }, { lat: '22.0', lon: '78.0' },
    { lat: '35.0', lon: '105.0'}, { lat: '35.0', lon: '135.0'},
    { lat: '37.0', lon: '127.0'}, { lat: '16.0', lon: '100.0'},
]

const BATCH_SIZE   = 4
const BATCH_DELAY  = 400   // ms between batches
const ZONE_DIST    = '250' // nautical miles radius per zone
const ADSBLOL_BASE = 'https://api.adsb.lol'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchZone(lat, lon) {
    const url = `${ADSBLOL_BASE}/v2/lat/${lat}/lon/${lon}/dist/${ZONE_DIST}`
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10_000)
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept':     'application/json',
                'User-Agent': 'KurdistanAirWatch/1.0 (https://github.com/kurdistan-watch/Kwatch)',
            },
        })
        clearTimeout(timeoutId)
        if (!resp.ok) return []
        const data = await resp.json()
        return data.ac ?? []
    } catch {
        clearTimeout(timeoutId)
        return []
    }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const seen   = new Set()
        const states = []

        for (let i = 0; i < ZONES.length; i += BATCH_SIZE) {
            const batch   = ZONES.slice(i, i + BATCH_SIZE)
            const results = await Promise.all(batch.map(({ lat, lon }) => fetchZone(lat, lon)))

            for (const ac of results.flat()) {
                const hex = (ac.hex ?? '').toLowerCase()
                if (!hex || seen.has(hex) || ac.lat == null || ac.lon == null) continue
                seen.add(hex)
                states.push(toStateVector(ac))
            }

            if (i + BATCH_SIZE < ZONES.length) await sleep(BATCH_DELAY)
        }

        console.info(`[api/opensky] ✅ ${states.length} aircraft from ${ZONES.length} zones via adsb.lol`)

        // Return in the same shape the client's opensky.js service expects
        res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
        res.setHeader('Content-Type', 'application/json')
        return res.status(200).json({ time: Math.floor(Date.now() / 1000), states })

    } catch (err) {
        console.error('[api/opensky] Handler error:', err.message)
        return res.status(502).json({ error: 'Failed to fetch aircraft data', detail: err.message })
    }
}
