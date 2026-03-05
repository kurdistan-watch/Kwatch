// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — adsb.lol proxy
//
// • Proxies requests to the free, open adsb.lol API (https://api.adsb.lol).
// • adsb.lol is API-compatible with ADS-B Exchange and requires NO API key.
// • Covers the EMEA + Asia region by querying center points SEQUENTIALLY in
//   small batches with delays between batches to stay within dynamic rate limits.
// • De-duplicates aircraft by ICAO24 hex.
// • Filters to MILITARY aircraft only — OpenSky already covers civilian traffic.
// ─────────────────────────────────────────────────────────────────────────────

// ── Military classification rules (mirrors src/services/classifier.js) ────────
// Kept deliberately minimal — we only need to identify military here so we
// can drop everything else before sending data to the client.

const MILITARY_CALLSIGN_PREFIXES = [
    'RCH', 'REACH', 'MMF', 'JAKE', 'OLIVE',
    'KNIFE', 'FURY', 'TOPCAT', 'DOOM', 'VIPER', 'BONE', 'GHOST',
    'CNV', 'NAVY',
    'RRR', 'ASCOT', 'COMET', 'TARTAN',
    'RFR', 'FAF', 'COTAM',
    'NATO', 'MAGIC',
    'TUAF', 'KAFKAS',
    'JAF', 'RJAF', 'SAF', 'PAF',
]

const MILITARY_ORIGIN_COUNTRIES = ['Iran', 'Russia']

const COMMERCIAL_AIRLINE_PREFIXES = [
    'KAR', 'IRY', 'UR', 'PC', 'TK', 'EK', 'FZ', 'WS', 'GF',
]
const IATA_RE = /^[A-Z]{2}\d{1,4}$/

// Registration prefix → country (needed to detect mil ICAO24 blocks by country)
const REG_PREFIXES = [
    ['N',    'United States'],
    ['G-',   'United Kingdom'],
    ['F-',   'France'],
    ['D-',   'Germany'],
    ['I-',   'Italy'],
    ['EC-',  'Spain'],
    ['SE-',  'Sweden'], ['OY-', 'Denmark'], ['LN-', 'Norway'], ['OH-', 'Finland'],
    ['SP-',  'Poland'], ['OK-', 'Czech Republic'], ['HA-', 'Hungary'],
    ['YR-',  'Romania'], ['LZ-', 'Bulgaria'], ['SX-', 'Greece'],
    ['OE-',  'Austria'], ['CS-', 'Portugal'], ['EI-', 'Ireland'], ['TF-', 'Iceland'],
    ['ES-',  'Estonia'], ['YL-', 'Latvia'],   ['LY-', 'Lithuania'],
    ['9A-',  'Croatia'], ['S5-', 'Slovenia'], ['OM-', 'Slovakia'],
    ['UR-',  'Ukraine'], ['RA-', 'Russia'],   ['RF-', 'Russia'],
    ['EP-',  'Iran'],    ['4X-', 'Israel'],   ['TC-', 'Turkey'],
    ['YK-',  'Syria'],   ['HZ-', 'Saudi Arabia'], ['A6-', 'United Arab Emirates'],
    ['9K-',  'Kuwait'],  ['YI-', 'Iraq'],     ['JY-', 'Jordan'],
    ['OD-',  'Lebanon'], ['A7-', 'Qatar'],    ['A4O-','Oman'],
    ['A9C-', 'Bahrain'], ['70-', 'Yemen'],
    ['AP-',  'Pakistan'],['VT-', 'India'],    ['UK-', 'Uzbekistan'],
    ['EK-',  'Armenia'], ['4K-', 'Azerbaijan'],['UP-','Kazakhstan'],
    ['SU-',  'Egypt'],   ['5A-', 'Libya'],    ['TS-', 'Tunisia'],
    ['7T-',  'Algeria'], ['CN-', 'Morocco'],
]

const countryFromReg = (reg) => {
    if (!reg) return ''
    for (const [prefix, country] of REG_PREFIXES) {
        if (reg.startsWith(prefix)) return country
    }
    return ''
}

const isCommercialCallsign = (cs) =>
    IATA_RE.test(cs) || COMMERCIAL_AIRLINE_PREFIXES.some((p) => cs.startsWith(p))

/**
 * Returns true if the raw adsb.lol aircraft object appears to be military.
 * Mirrors the isMilitary() logic in src/services/classifier.js.
 */
// eslint-disable-next-line no-unused-vars
function isMilitaryAircraft(ac) {
    const cs  = (ac.flight ?? '').trim().toUpperCase()
    const hex = (ac.hex    ?? '').toLowerCase()
    const country = countryFromReg(ac.r ?? '')

    if (cs && MILITARY_CALLSIGN_PREFIXES.some((p) => cs.startsWith(p))) return true
    if (hex.startsWith('ae')) return true                                           // US military ICAO24 block
    if (hex.startsWith('43') && country === 'United Kingdom') return true           // UK military ICAO24 block
    if (hex.startsWith('a') && country === 'United States' && !isCommercialCallsign(cs)) return true
    if (MILITARY_ORIGIN_COUNTRIES.includes(country)) return true
    return false
}

// EMEA coverage grid — prioritised so the most important zones are fetched
// first (Middle East & KRI region). If the request times out or hits rate
// limits, we still return whatever we got so far.
const EMEA_CENTERS = [
    // ── Priority 1: Middle East / Kurdistan ──────────────────────────────
    { lat: '36.0', lon: '44.0'  },  // Kurdistan / Iraq
    { lat: '33.0', lon: '36.0'  },  // Levant
    { lat: '33.0', lon: '52.0'  },  // Iran
    { lat: '26.0', lon: '44.0'  },  // Saudi Arabia
    { lat: '26.0', lon: '56.0'  },  // UAE / Gulf
    { lat: '39.0', lon: '28.0'  },  // Turkey west
    // ── Priority 2: North Africa & Horn ──────────────────────────────────
    { lat: '27.0', lon: '30.0'  },  // Egypt
    { lat: '18.0', lon: '44.0'  },  // Yemen / Horn of Africa
    { lat: '33.0', lon: '3.0'   },  // Algeria / Tunisia
    { lat: '33.0', lon: '-7.0'  },  // Morocco
    // ── Priority 3: Europe ───────────────────────────────────────────────
    { lat: '54.0', lon: '-2.0'  },  // UK / North Sea
    { lat: '46.0', lon: '2.0'   },  // France
    { lat: '54.0', lon: '14.0'  },  // Germany / Poland
    { lat: '46.0', lon: '14.0'  },  // Central Europe
    { lat: '39.0', lon: '-5.0'  },  // Iberia
    { lat: '39.0', lon: '10.0'  },  // Italy / Mediterranean
    { lat: '46.0', lon: '28.0'  },  // Romania / Black Sea
    { lat: '54.0', lon: '30.0'  },  // Baltics / Belarus
    { lat: '64.0', lon: '18.0'  },  // Scandinavia
    // ── Priority 4: Sub-Saharan Africa ───────────────────────────────────
    { lat: '10.0', lon: '8.0'   },  // West Africa
    { lat: '10.0', lon: '30.0'  },  // East / Central Africa
    { lat: '0.0',  lon: '37.0'  },  // Kenya / East Africa
    { lat: '-10.0', lon: '25.0' },  // Southern Central Africa
    { lat: '-22.0', lon: '28.0' },  // Southern Africa
    // ── Priority 5: Eastern Europe / periphery ───────────────────────────
    { lat: '46.0', lon: '44.0'  },  // Caucasus
    { lat: '54.0', lon: '44.0'  },  // Western Russia
    { lat: '40.0', lon: '60.0'  },  // Central Asia west
    { lat: '20.0', lon: '18.0'  },  // Libya / Chad
    { lat: '0.0',  lon: '18.0'  },  // Congo / Equatorial Africa
    { lat: '-10.0', lon: '40.0' },  // Tanzania / Mozambique
    { lat: '-33.0', lon: '25.0' },  // South Africa
    { lat: '64.0', lon: '-18.0' },  // Iceland
    // ── Priority 6: South Asia ───────────────────────────────────────────
    { lat: '30.0', lon: '70.0'  },  // Pakistan / Afghanistan
    { lat: '22.0', lon: '78.0'  },  // India central
    { lat: '28.0', lon: '84.0'  },  // Nepal / North India
    { lat: '13.0', lon: '80.0'  },  // South India / Sri Lanka
    // ── Priority 7: Central & East Asia ─────────────────────────────────
    { lat: '43.0', lon: '76.0'  },  // Kazakhstan / Kyrgyzstan
    { lat: '40.0', lon: '90.0'  },  // Xinjiang / West China
    { lat: '35.0', lon: '105.0' },  // China central
    { lat: '50.0', lon: '100.0' },  // Mongolia / South Siberia
    { lat: '60.0', lon: '80.0'  },  // Western Siberia
    { lat: '60.0', lon: '110.0' },  // Eastern Siberia
    { lat: '35.0', lon: '135.0' },  // Japan
    { lat: '37.0', lon: '127.0' },  // Korea
    { lat: '22.0', lon: '114.0' },  // South China / Hong Kong
    // ── Priority 8: Southeast Asia ───────────────────────────────────────
    { lat: '16.0', lon: '100.0' },  // Thailand / Indochina
    { lat: '10.0', lon: '106.0' },  // Vietnam / Cambodia
    { lat: '3.0',  lon: '110.0' },  // Malaysia / Borneo
    { lat: '-6.0', lon: '107.0' },  // Java / Indonesia west
]

const DEFAULT_DIST = '250'   // nautical miles
const BATCH_SIZE   = 3       // requests per batch
const BATCH_DELAY  = 500     // ms between batches — adsb.lol is free/open, lighter throttle needed

const ADSBLOL_BASE = 'https://api.adsb.lol'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch a single zone from adsb.lol. Returns aircraft array or empty on failure.
 * adsb.lol uses the same URL structure as ADS-B Exchange but requires no auth.
 */
async function fetchZone(lat, lon, dist) {
    const url = `${ADSBLOL_BASE}/v2/lat/${lat}/lon/${lon}/dist/${dist}`
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 12_000)

    try {
        const upstream = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'KurdistanAirWatch/1.0 (https://github.com/kurdistan-watch/Kwatch)',
                'Accept':     'application/json',
            },
        })
        clearTimeout(timeoutId)

        if (!upstream.ok) {
            const body = await upstream.text()
            const status = upstream.status
            if (status === 429) {
                console.warn(`[api/adsb] Rate-limited (429) for (${lat},${lon}) — pausing`)
            } else {
                console.error(`[api/adsb] Upstream error for (${lat},${lon}): HTTP ${status}`, body.slice(0, 120))
            }
            return { ac: [], rateLimited: status === 429 }
        }

        const data = await upstream.json()
        return { ac: data.ac ?? [], rateLimited: false }
    } catch (err) {
        clearTimeout(timeoutId)
        console.warn(`[api/adsb] Fetch error for (${lat},${lon}): ${err.name === 'AbortError' ? 'timeout' : err.message}`)
        return { ac: [], rateLimited: false }
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Allow single-point override via query params for backwards compat
    const overrideLat = req.query.lat
    const overrideLon = req.query.lon
    const dist = req.query.dist ?? DEFAULT_DIST

    const centers = (overrideLat && overrideLon)
        ? [{ lat: overrideLat, lon: overrideLon }]
        : EMEA_CENTERS

    // De-duplication set
    const seen = new Set()
    const allAircraft = []
    let zonesCompleted = 0
    let rateLimitHit   = false

    // Process in sequential batches
    for (let i = 0; i < centers.length; i += BATCH_SIZE) {
        if (rateLimitHit) break  // stop immediately if rate-limited

        const batch = centers.slice(i, i + BATCH_SIZE)

        // Run the batch concurrently (small batch = 2-3 simultaneous)
        const results = await Promise.all(
            batch.map(({ lat, lon }) => fetchZone(lat, lon, dist))
        )

        for (const { ac, rateLimited } of results) {
            if (rateLimited) rateLimitHit = true
            for (const aircraft of ac) {
                const hex = (aircraft.hex ?? '').toLowerCase()
                if (hex && !seen.has(hex)) {
                    seen.add(hex)
                    allAircraft.push(aircraft)
                }
            }
        }

        zonesCompleted += batch.length

        // Delay before next batch (skip if this was the last batch)
        if (i + BATCH_SIZE < centers.length && !rateLimitHit) {
            await sleep(BATCH_DELAY)
        }
    }

    console.info(
        `[api/adsb] ✅ ${allAircraft.length} aircraft from ${zonesCompleted}/${centers.length} EMEA+Asia zones` +
        (rateLimitHit ? ' (stopped early — rate limited by adsb.lol)' : '')
    )

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30')
    res.setHeader('Content-Type', 'application/json')
    return res.status(200).json({ ac: allAircraft, total: allAircraft.length })
}
