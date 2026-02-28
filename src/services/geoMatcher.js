// ─────────────────────────────────────────────────────────────────────────────
// Geo-Matcher — maps news article text to geographic coordinates
//
// All location data lives in /public/locations.json (editable without
// touching code). This module contains only the matching logic:
//
//   1. Fetch & compile the location dictionary once on first use.
//   2. Strip Rudaw's standard dateline ("ERBIL, Kurdistan Region -")
//      from the description so it doesn't override the actual subject.
//   3. Match the TITLE first (most specific location signal).
//   4. If no title hit, match the stripped description.
//   5. Fall back to full rawText.
//
// Tiers are matched in JSON order (T1 → T5). First hit wins.
// ─────────────────────────────────────────────────────────────────────────────

// ── Compiled entries cache ───────────────────────────────────────────────────
let _compiled = null   // Array<{ regex, lat, lng, locationName }>
let _loadPromise = null // single in-flight fetch

/**
 * Fetch /locations.json and compile every entry's patterns into a single
 * word-boundary regex. Runs once — subsequent calls return the cached result.
 */
const ensureLoaded = async () => {
    if (_compiled) return _compiled
    if (_loadPromise) return _loadPromise

    _loadPromise = (async () => {
        try {
            const res = await fetch('/locations.json')
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()

            const entries = []
            for (const tier of data.tiers ?? []) {
                for (const loc of tier.locations ?? []) {
                    entries.push({
                        regex: new RegExp(
                            `\\b(?:${loc.patterns.join('|')})\\b`,
                            'i',
                        ),
                        lat: loc.lat,
                        lng: loc.lng,
                        locationName: loc.locationName,
                    })
                }
            }

            _compiled = entries
            console.info(
                `[geoMatcher] Loaded ${entries.length} location entries from locations.json`,
            )
            return _compiled
        } catch (err) {
            console.error('[geoMatcher] Failed to load locations.json:', err)
            _loadPromise = null // allow retry on next call
            return []
        }
    })()

    return _loadPromise
}

// ── Dateline stripping ───────────────────────────────────────────────────────
// Rudaw articles almost always start with "ERBIL, Kurdistan Region —" or
// similar dateline. This tells us where the newsroom is, not what the
// article is about, so we strip it before matching the description.
const DATELINE_RE = /^[A-Z]{3,},?\s+Kurdistan\s+Region\s*[-–—]\s*/i

const stripDateline = (text) => (text ?? '').replace(DATELINE_RE, '')

// ── Internal scanner ─────────────────────────────────────────────────────────

const scanText = (text, entries) => {
    for (const entry of entries) {
        if (entry.regex.test(text)) {
            return {
                lat: entry.lat,
                lng: entry.lng,
                locationName: entry.locationName,
            }
        }
    }
    return null
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the location dictionary. Call this early (e.g. in a useEffect)
 * so the data is ready before the first article arrives.
 * Safe to call multiple times — only fetches once.
 */
export const preloadLocations = () => ensureLoaded()

/**
 * Matches an article to geographic coordinates with a title-first strategy.
 *
 *   1. Scan the **title** against all tiers.
 *   2. Scan the **description** with its dateline stripped.
 *   3. Fall back to full rawText.
 *
 * Returns synchronously if locations are already loaded, otherwise returns
 * null (call preloadLocations() first to avoid this).
 *
 * @param {string}  rawText      Combined title + description text.
 * @param {string}  [title]      Article title alone.
 * @param {string}  [description] Article description alone.
 * @returns {{ lat: number, lng: number, locationName: string } | null}
 */
export const matchGeoLocation = (rawText, title, description) => {
    if (!rawText || typeof rawText !== 'string') return null
    if (!_compiled) return null // not loaded yet — caller should preload

    // Pass 1 — title only (most specific signal)
    if (title) {
        const hit = scanText(title, _compiled)
        if (hit) return hit
    }

    // Pass 2 — description with dateline stripped
    if (description) {
        const hit = scanText(stripDateline(description), _compiled)
        if (hit) return hit
    }

    // Pass 3 — full rawText fallback
    return scanText(rawText, _compiled)
}
