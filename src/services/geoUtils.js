// ─────────────────────────────────────────────────────────────────────────────
// geoUtils.js — Point-in-polygon test against the KRI main boundary
//
// KRIGeo.json is a GeoJSON Feature whose geometry is a LineString tracing
// the Kurdistan Region of Iraq border. We treat the coordinate array as a
// closed polygon ring and run a standard ray-casting test.
//
// Coordinates in KRIGeo.json are [longitude, latitude] (standard GeoJSON).
// Flights from OpenSky are stored as { latitude, longitude }.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Array<[number, number]> | null}  [[lon, lat], …] */
let _kriRing = null

/** Promise that resolves once the ring is loaded (or null if it failed). */
let _loadPromise = null

/**
 * Fetch and cache the KRI boundary polygon ring.
 * Safe to call many times — only ever fires one network request.
 * @returns {Promise<Array<[number, number]> | null>}
 */
export const loadKRIBoundary = () => {
    if (_loadPromise) return _loadPromise

    _loadPromise = fetch('/KRIGeo.json')
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.json()
        })
        .then((geojson) => {
            const coords = geojson?.geometry?.coordinates
            if (!Array.isArray(coords) || coords.length < 3) {
                throw new Error('KRIGeo.json has no usable coordinate array')
            }
            // Ensure the ring is closed (first === last)
            const ring = [...coords]
            const first = ring[0]
            const last  = ring[ring.length - 1]
            if (first[0] !== last[0] || first[1] !== last[1]) {
                ring.push([first[0], first[1]])
            }
            _kriRing = ring
            console.info(`[geoUtils] KRI boundary loaded — ${ring.length} vertices`)
            return ring
        })
        .catch((err) => {
            console.error('[geoUtils] Failed to load KRI boundary:', err)
            _loadPromise = null // allow a future retry
            return null
        })

    return _loadPromise
}

/**
 * Ray-casting point-in-polygon test (Jordan curve theorem).
 * Runs entirely in memory — O(n) on the ring size.
 *
 * @param {number} lat   Aircraft latitude  (degrees N)
 * @param {number} lon   Aircraft longitude (degrees E)
 * @returns {boolean}    true if the point is inside the KRI polygon
 */
export const isInsideKRI = (lat, lon) => {
    if (!_kriRing || lat == null || lon == null) return false

    // GeoJSON ring vertices are [lon, lat]
    let inside = false
    const n = _kriRing.length

    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = _kriRing[i][0]; const yi = _kriRing[i][1]
        const xj = _kriRing[j][0]; const yj = _kriRing[j][1]

        // Test ray going rightward from (lon, lat)
        const intersect =
            yi > lat !== yj > lat &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi

        if (intersect) inside = !inside
    }

    return inside
}

/**
 * Returns true if the KRI boundary has been successfully loaded.
 */
export const isKRIBoundaryReady = () => _kriRing !== null
