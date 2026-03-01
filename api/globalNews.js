/**
 * api/globalNews.js — Vercel serverless function
 *
 * Fetches 5 major international RSS feeds in parallel, parses XML to JSON,
 * geo-tags each article via a keyword-to-region centroid lookup, and returns
 * a unified array sorted by pubDate desc (max 40 items).
 *
 * Cache: 3-minute in-memory cache (s-maxage=180).
 */

import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'

// ── RSS feeds ─────────────────────────────────────────────────────────────────

const FEEDS = [
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',               source: 'Al Jazeera' },
    { url: 'http://rss.cnn.com/rss/edition_world.rss',                source: 'CNN' },
    { url: 'https://feeds.reuters.com/Reuters/worldNews',             source: 'Reuters' },
    { url: 'https://moxie.foxnews.com/google-publisher/world.xml',    source: 'Fox News' },
    { url: 'http://feeds.bbci.co.uk/news/world/rss.xml',              source: 'BBC' },
]

// ── Geo-region keyword → centroid lookup ─────────────────────────────────────

const GEO_REGIONS = {
    'iraq':          { lat: 33.0,  lng: 44.4,  name: 'Iraq' },
    'kurdistan':     { lat: 36.2,  lng: 44.0,  name: 'Kurdistan' },
    'erbil':         { lat: 36.19, lng: 44.01, name: 'Erbil' },
    'baghdad':       { lat: 33.34, lng: 44.40, name: 'Baghdad' },
    'mosul':         { lat: 36.34, lng: 43.13, name: 'Mosul' },
    'basra':         { lat: 30.51, lng: 47.78, name: 'Basra' },
    'syria':         { lat: 34.8,  lng: 38.9,  name: 'Syria' },
    'damascus':      { lat: 33.51, lng: 36.29, name: 'Damascus' },
    'aleppo':        { lat: 36.20, lng: 37.16, name: 'Aleppo' },
    'iran':          { lat: 32.4,  lng: 53.7,  name: 'Iran' },
    'tehran':        { lat: 35.69, lng: 51.39, name: 'Tehran' },
    'turkey':        { lat: 38.9,  lng: 35.2,  name: 'Turkey' },
    'ankara':        { lat: 39.93, lng: 32.86, name: 'Ankara' },
    'istanbul':      { lat: 41.01, lng: 28.95, name: 'Istanbul' },
    'israel':        { lat: 31.5,  lng: 34.8,  name: 'Israel' },
    'tel aviv':      { lat: 32.08, lng: 34.78, name: 'Tel Aviv' },
    'gaza':          { lat: 31.35, lng: 34.45, name: 'Gaza' },
    'palestine':     { lat: 31.95, lng: 35.23, name: 'Palestine' },
    'west bank':     { lat: 32.00, lng: 35.25, name: 'West Bank' },
    'lebanon':       { lat: 33.9,  lng: 35.5,  name: 'Lebanon' },
    'beirut':        { lat: 33.89, lng: 35.50, name: 'Beirut' },
    'jordan':        { lat: 31.0,  lng: 36.0,  name: 'Jordan' },
    'saudi':         { lat: 23.9,  lng: 45.1,  name: 'Saudi Arabia' },
    'riyadh':        { lat: 24.69, lng: 46.72, name: 'Riyadh' },
    'egypt':         { lat: 26.8,  lng: 30.8,  name: 'Egypt' },
    'cairo':         { lat: 30.06, lng: 31.25, name: 'Cairo' },
    'yemen':         { lat: 15.6,  lng: 48.5,  name: 'Yemen' },
    'sanaa':         { lat: 15.37, lng: 44.19, name: "Sana'a" },
    'ukraine':       { lat: 48.4,  lng: 31.2,  name: 'Ukraine' },
    'kyiv':          { lat: 50.45, lng: 30.52, name: 'Kyiv' },
    'russia':        { lat: 55.8,  lng: 37.6,  name: 'Russia' },
    'moscow':        { lat: 55.75, lng: 37.62, name: 'Moscow' },
    'afghanistan':   { lat: 33.9,  lng: 67.7,  name: 'Afghanistan' },
    'kabul':         { lat: 34.52, lng: 69.18, name: 'Kabul' },
    'pakistan':      { lat: 30.4,  lng: 69.3,  name: 'Pakistan' },
    'islamabad':     { lat: 33.72, lng: 73.06, name: 'Islamabad' },
    'libya':         { lat: 26.3,  lng: 17.2,  name: 'Libya' },
    'sudan':         { lat: 12.9,  lng: 30.2,  name: 'Sudan' },
    'somalia':       { lat: 5.2,   lng: 46.2,  name: 'Somalia' },
    'ethiopia':      { lat: 9.1,   lng: 40.5,  name: 'Ethiopia' },
    'china':         { lat: 35.9,  lng: 104.2, name: 'China' },
    'beijing':       { lat: 39.91, lng: 116.39,name: 'Beijing' },
    'north korea':   { lat: 40.3,  lng: 127.5, name: 'North Korea' },
    'taiwan':        { lat: 23.7,  lng: 121.0, name: 'Taiwan' },
    'venezuela':     { lat: 6.4,   lng: -66.6, name: 'Venezuela' },
    'colombia':      { lat: 4.6,   lng: -74.1, name: 'Colombia' },
    'haiti':         { lat: 18.9,  lng: -72.3, name: 'Haiti' },
    'myanmar':       { lat: 19.7,  lng: 96.1,  name: 'Myanmar' },
    'bangladesh':    { lat: 23.7,  lng: 90.4,  name: 'Bangladesh' },
    'nigeria':       { lat: 9.1,   lng: 8.7,   name: 'Nigeria' },
    'mali':          { lat: 17.6,  lng: -4.0,  name: 'Mali' },
    'niger':         { lat: 17.6,  lng: 8.1,   name: 'Niger' },
}

// Sorted by keyword length descending so multi-word phrases ("north korea",
// "west bank", "tel aviv") are matched before their constituent words.
const GEO_KEYS = Object.keys(GEO_REGIONS).sort((a, b) => b.length - a.length)

/**
 * Returns the first matching geo-region for the given text blob, or null.
 * @param {string} text  Combined title + description
 * @returns {{ lat, lng, name }|null}
 */
function resolveGeoRegion(text) {
    const lower = text.toLowerCase()
    for (const key of GEO_KEYS) {
        if (lower.includes(key)) return GEO_REGIONS[key]
    }
    return null
}

// ── Breaking-news detection ───────────────────────────────────────────────────

const BREAKING_KEYWORDS = ['breaking', 'urgent', 'alert', 'flash', 'developing', 'just in']

/**
 * Returns true if the RSS item should be classified as a breaking/urgent story.
 *
 * Two-tier check:
 *  1. <category> tags — the most reliable signal; handles string, array, CDATA
 *     and attribute-object variants that fast-xml-parser may produce.
 *  2. Conservative title-prefix heuristic — matches "Breaking: …", "URGENT - …"
 *     etc. to catch items that lack category metadata.
 *
 * @param {object} rawItem  The raw parsed RSS item object
 * @param {string} title    The already-extracted plain title string
 * @returns {boolean}
 */
function detectBreaking(rawItem, title) {
    // 1. Category tags
    const cats = [].concat(rawItem.category ?? []).map((c) => {
        if (typeof c === 'string') return c.toLowerCase()
        if (c?.__cdata) return String(c.__cdata).toLowerCase()
        if (c?.['#text']) return String(c['#text']).toLowerCase()
        return ''
    })
    if (cats.some((cat) => BREAKING_KEYWORDS.some((kw) => cat.includes(kw)))) return true

    // 2. Title-prefix heuristic (conservative — prefix only)
    const t = title.toLowerCase().trimStart()
    return BREAKING_KEYWORDS.some(
        (kw) => t.startsWith(kw + ':') || t.startsWith(kw + ' -') || t.startsWith('[' + kw)
    )
}

// ── XML parser (fast-xml-parser v5) ──────────────────────────────────────────

const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: '__cdata',
    processEntities: true,
    trimValues: true,
})

/**
 * Extract a plain string from a value that may be a raw string, a CDATA
 * wrapper ({ __cdata: '...' }), or an object with mixed content.
 * @param {*} val
 * @returns {string}
 */
function toString(val) {
    if (!val) return ''
    if (typeof val === 'string') return val
    if (typeof val === 'object') {
        if (val.__cdata) return String(val.__cdata)
        // fast-xml-parser sometimes returns { '#text': '...', __cdata: '...' }
        if (val['#text']) return String(val['#text'])
    }
    return String(val)
}

/**
 * Fetch and parse one RSS feed.
 * @param {{ url: string, source: string }} feed
 * @returns {Promise<Array>}  Array of raw article objects (may be empty on error)
 */
async function fetchFeed({ url, source }) {
    const res = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'KurdistanAirWatch/1.0 RSS Reader' },
        // Follow redirects (http → https)
        maxRedirects: 5,
    })

    const parsed = parser.parse(res.data)

    // RSS 2.0 → rss.channel.item
    const rawItems = [].concat(parsed?.rss?.channel?.item ?? [])

    return rawItems.map((item) => {
        const title       = toString(item.title)
        const description = toString(item.description)
        const link        = toString(item.link || item.guid)
        const pubDateRaw  = toString(item.pubDate)

        const pubDate = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString()

        const searchText = `${title} ${description}`
        const geoRegion  = resolveGeoRegion(searchText)

        return {
            id:          crypto.randomUUID(),
            source,
            title,
            description,
            link,
            pubDate,
            geoRegion,    // { lat, lng, name } | null
            isBreaking:   detectBreaking(item, title),
        }
    })
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let cacheData   = null
let cacheExpiry = 0
const CACHE_TTL_MS = 3 * 60 * 1000 // 3 minutes

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')

    // Serve cache if still fresh
    if (cacheData && Date.now() < cacheExpiry) {
        return res.status(200).json(cacheData)
    }

    try {
        // Fetch all feeds in parallel; surviving results kept even if some fail
        const results = await Promise.allSettled(FEEDS.map(fetchFeed))

        const allItems = []
        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                allItems.push(...result.value)
            } else {
                console.error(`[globalNews] ❌ Feed "${FEEDS[i].source}" failed:`, result.reason?.message)
            }
        })

        // Sort by pubDate descending, keep max 40
        allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        const items = allItems.slice(0, 40)

        cacheData   = items
        cacheExpiry = Date.now() + CACHE_TTL_MS

        return res.status(200).json(items)
    } catch (err) {
        console.error('[globalNews] ❌ Unexpected error:', err.message)

        // Serve stale cache on error if available
        if (cacheData) {
            return res.status(200).json(cacheData)
        }

        return res.status(500).json({ error: 'Failed to fetch global news' })
    }
}
