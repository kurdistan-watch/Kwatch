// ─────────────────────────────────────────────────────────────────────────────
// Geo-Matcher — maps news article text to geographic coordinates
//
// Pure function: takes rawText, returns { lat, lng, locationName } or null.
// Matching follows a strict priority order: Tier 1 → Tier 2 → Tier 3.
// First match wins.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tier 1 — Kurdistan Region Cities & Districts ─────────────────────────────
const TIER_1 = [
    { patterns: ['erbil', 'hewlêr'],                  lat: 36.191, lng: 44.009, locationName: 'Erbil' },
    { patterns: ['sulaymaniyah', 'slemani'],           lat: 35.557, lng: 45.435, locationName: 'Sulaymaniyah' },
    { patterns: ['duhok'],                             lat: 36.867, lng: 42.986, locationName: 'Duhok' },
    { patterns: ['halabja'],                           lat: 35.177, lng: 45.986, locationName: 'Halabja' },
    { patterns: ['zakho'],                             lat: 37.143, lng: 42.685, locationName: 'Zakho' },
    { patterns: ['amadiyah', 'amadiya'],               lat: 37.092, lng: 43.487, locationName: 'Amadiyah' },
    { patterns: ['sinjar', 'shingal'],                 lat: 36.319, lng: 41.867, locationName: 'Sinjar' },
    { patterns: ['kirkuk', 'kerkuk'],                  lat: 35.468, lng: 44.392, locationName: 'Kirkuk' },
    { patterns: ['mosul'],                             lat: 36.340, lng: 43.130, locationName: 'Mosul' },
    { patterns: ['makhmur'],                           lat: 35.775, lng: 43.589, locationName: 'Makhmur' },
]

// ── Tier 2 — Neighboring Countries / Regions ─────────────────────────────────
const TIER_2 = [
    { patterns: ['iran', 'iranian'],                   lat: 33.686, lng: 46.200, locationName: 'Iran' },
    { patterns: ['tehran'],                            lat: 35.689, lng: 51.388, locationName: 'Tehran' },
    { patterns: ['turkey', 'turkish', 'ankara'],       lat: 39.925, lng: 32.836, locationName: 'Turkey' },
    { patterns: ['istanbul'],                          lat: 41.015, lng: 28.978, locationName: 'Istanbul' },
    { patterns: ['baghdad'],                           lat: 33.315, lng: 44.366, locationName: 'Baghdad' },
    { patterns: ['syria', 'syrian'],                   lat: 34.802, lng: 38.996, locationName: 'Syria' },
    { patterns: ['israel', 'israeli'],                 lat: 31.046, lng: 34.851, locationName: 'Israel' },
    { patterns: ['russia', 'russian'],                 lat: 55.751, lng: 37.615, locationName: 'Moscow' },
    { patterns: ['united states', 'pentagon', 'washington'], lat: 38.889, lng: -77.050, locationName: 'Washington DC' },
]

// ── Tier 3 — Thematic fallback ───────────────────────────────────────────────
const TIER_3 = [
    { patterns: ['oil', 'petroleum', 'opec'],          lat: 35.468, lng: 44.392, locationName: 'Kirkuk (Oil)' },
    { patterns: ['parliament', 'krg', 'prime minister'], lat: 36.191, lng: 44.009, locationName: 'Erbil (KRG)' },
    { patterns: ['peshmerga'],                         lat: 36.191, lng: 44.009, locationName: 'Erbil (KRG HQ)' },
    { patterns: ['pkk', 'kandil'],                     lat: 37.050, lng: 44.650, locationName: 'Kandil Mountains' },
    { patterns: ['irgc', 'revolutionary guard'],       lat: 33.686, lng: 46.200, locationName: 'Iran (IRGC)' },
]

// Combined ordered tiers — first match wins
const ALL_TIERS = [...TIER_1, ...TIER_2, ...TIER_3]

// Pre-build a single regex per entry for fast matching
const COMPILED = ALL_TIERS.map((entry) => ({
    ...entry,
    regex: new RegExp(`\\b(?:${entry.patterns.join('|')})\\b`, 'i'),
}))

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Matches raw article text against a tiered keyword dictionary and returns
 * the geographic coordinates of the first match, or null if nothing matches.
 *
 * @param {string} rawText  Combined title + description text.
 * @returns {{ lat: number, lng: number, locationName: string } | null}
 */
export const matchGeoLocation = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return null

    for (const entry of COMPILED) {
        if (entry.regex.test(rawText)) {
            return {
                lat: entry.lat,
                lng: entry.lng,
                locationName: entry.locationName,
            }
        }
    }

    return null
}
