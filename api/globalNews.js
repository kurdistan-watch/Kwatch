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
    { url: 'https://moxie.foxnews.com/google-publisher/world.xml',    source: 'Fox News' },
    { url: 'http://feeds.bbci.co.uk/news/world/rss.xml',              source: 'BBC' },
    { url: 'https://rss.dw.com/xml/rss-en-world',                     source: 'DW News' },
    { url: 'https://feeds.npr.org/1004/rss.xml',                      source: 'NPR' },
]

// ── Geo-region keyword → centroid lookup ─────────────────────────────────────

const GEO_REGIONS = {
    'iraq':          { lat: 33.0,  lng: 44.4,  name: 'Iraq' },
    'iraqi':         { lat: 33.0,  lng: 44.4,  name: 'Iraq' },
    'kurdistan':     { lat: 36.2,  lng: 44.0,  name: 'Kurdistan' },
    'kurdish':       { lat: 36.2,  lng: 44.0,  name: 'Kurdistan' },
    'erbil':         { lat: 36.19, lng: 44.01, name: 'Erbil' },
    'sulaymaniyah':  { lat: 35.56, lng: 45.43, name: 'Sulaymaniyah' },
    'slemani':       { lat: 35.56, lng: 45.43, name: 'Sulaymaniyah' },
    'kirkuk':        { lat: 35.47, lng: 44.39, name: 'Kirkuk' },
    'mosul':         { lat: 36.34, lng: 43.13, name: 'Mosul' },
    'basra':         { lat: 30.51, lng: 47.78, name: 'Basra' },
    'baghdad':       { lat: 33.34, lng: 44.40, name: 'Baghdad' },
    'fallujah':      { lat: 33.35, lng: 43.78, name: 'Fallujah' },
    'peshmerga':     { lat: 36.19, lng: 44.01, name: 'Erbil (Peshmerga)' },
    'pkk':           { lat: 36.53, lng: 45.15, name: 'Qandil (PKK)' },
    'öcalan':        { lat: 36.53, lng: 45.15, name: 'Qandil (PKK)' },
    'ocalan':        { lat: 36.53, lng: 45.15, name: 'Qandil (PKK)' },
    'sinjar':        { lat: 36.32, lng: 41.87, name: 'Sinjar' },
    'syria':         { lat: 34.8,  lng: 38.9,  name: 'Syria' },
    'syrian':        { lat: 34.8,  lng: 38.9,  name: 'Syria' },
    'damascus':      { lat: 33.51, lng: 36.29, name: 'Damascus' },
    'aleppo':        { lat: 36.20, lng: 37.16, name: 'Aleppo' },
    'idlib':         { lat: 35.93, lng: 36.63, name: 'Idlib' },
    'kobani':        { lat: 36.89, lng: 38.36, name: 'Kobani' },
    'rojava':        { lat: 36.80, lng: 41.00, name: 'Rojava' },
    'iran':          { lat: 32.4,  lng: 53.7,  name: 'Iran' },
    'iranian':       { lat: 32.4,  lng: 53.7,  name: 'Iran' },
    'tehran':        { lat: 35.69, lng: 51.39, name: 'Tehran' },
    'irgc':          { lat: 35.69, lng: 51.39, name: 'Tehran (IRGC)' },
    'turkey':        { lat: 38.9,  lng: 35.2,  name: 'Turkey' },
    'turkish':       { lat: 38.9,  lng: 35.2,  name: 'Turkey' },
    'ankara':        { lat: 39.93, lng: 32.86, name: 'Ankara' },
    'istanbul':      { lat: 41.01, lng: 28.95, name: 'Istanbul' },
    'israel':        { lat: 31.5,  lng: 34.8,  name: 'Israel' },
    'israeli':       { lat: 31.5,  lng: 34.8,  name: 'Israel' },
    'tel aviv':      { lat: 32.08, lng: 34.78, name: 'Tel Aviv' },
    'jerusalem':     { lat: 31.77, lng: 35.22, name: 'Jerusalem' },
    'gaza':          { lat: 31.35, lng: 34.45, name: 'Gaza' },
    'rafah':         { lat: 31.28, lng: 34.25, name: 'Rafah' },
    'west bank':     { lat: 32.00, lng: 35.25, name: 'West Bank' },
    'ramallah':      { lat: 31.90, lng: 35.20, name: 'Ramallah' },
    'palestine':     { lat: 31.95, lng: 35.23, name: 'Palestine' },
    'palestinian':   { lat: 31.95, lng: 35.23, name: 'Palestine' },
    'hamas':         { lat: 31.35, lng: 34.45, name: 'Gaza (Hamas)' },
    'hezbollah':     { lat: 33.89, lng: 35.50, name: 'Beirut (Hezbollah)' },
    'lebanon':       { lat: 33.9,  lng: 35.5,  name: 'Lebanon' },
    'lebanese':      { lat: 33.9,  lng: 35.5,  name: 'Lebanon' },
    'beirut':        { lat: 33.89, lng: 35.50, name: 'Beirut' },
    'jordan':        { lat: 31.0,  lng: 36.0,  name: 'Jordan' },
    'amman':         { lat: 31.95, lng: 35.93, name: 'Amman' },
    'saudi':         { lat: 23.9,  lng: 45.1,  name: 'Saudi Arabia' },
    'riyadh':        { lat: 24.69, lng: 46.72, name: 'Riyadh' },
    'egypt':         { lat: 26.8,  lng: 30.8,  name: 'Egypt' },
    'egyptian':      { lat: 26.8,  lng: 30.8,  name: 'Egypt' },
    'cairo':         { lat: 30.06, lng: 31.25, name: 'Cairo' },
    'yemen':         { lat: 15.6,  lng: 48.5,  name: 'Yemen' },
    'yemeni':        { lat: 15.6,  lng: 48.5,  name: 'Yemen' },
    'houthi':        { lat: 15.37, lng: 44.19, name: "Sana'a (Houthi)" },
    'sanaa':         { lat: 15.37, lng: 44.19, name: "Sana'a" },
    'ukraine':       { lat: 48.4,  lng: 31.2,  name: 'Ukraine' },
    'ukrainian':     { lat: 48.4,  lng: 31.2,  name: 'Ukraine' },
    'kyiv':          { lat: 50.45, lng: 30.52, name: 'Kyiv' },
    'kiev':          { lat: 50.45, lng: 30.52, name: 'Kyiv' },
    'kharkiv':       { lat: 49.99, lng: 36.23, name: 'Kharkiv' },
    'zaporizhzhia':  { lat: 47.84, lng: 35.14, name: 'Zaporizhzhia' },
    'kherson':       { lat: 46.64, lng: 32.62, name: 'Kherson' },
    'odesa':         { lat: 46.48, lng: 30.72, name: 'Odesa' },
    'crimea':        { lat: 45.29, lng: 34.03, name: 'Crimea' },
    'russia':        { lat: 55.8,  lng: 37.6,  name: 'Russia' },
    'russian':       { lat: 55.8,  lng: 37.6,  name: 'Russia' },
    'kremlin':       { lat: 55.75, lng: 37.62, name: 'Moscow (Kremlin)' },
    'moscow':        { lat: 55.75, lng: 37.62, name: 'Moscow' },
    'st. petersburg':{ lat: 59.93, lng: 30.32, name: 'St. Petersburg' },
    'afghanistan':   { lat: 33.9,  lng: 67.7,  name: 'Afghanistan' },
    'afghan':        { lat: 33.9,  lng: 67.7,  name: 'Afghanistan' },
    'kabul':         { lat: 34.52, lng: 69.18, name: 'Kabul' },
    'taliban':       { lat: 34.52, lng: 69.18, name: 'Kabul (Taliban)' },
    'pakistan':      { lat: 30.4,  lng: 69.3,  name: 'Pakistan' },
    'pakistani':     { lat: 30.4,  lng: 69.3,  name: 'Pakistan' },
    'islamabad':     { lat: 33.72, lng: 73.06, name: 'Islamabad' },
    'karachi':       { lat: 24.86, lng: 67.01, name: 'Karachi' },
    'india':         { lat: 20.6,  lng: 78.9,  name: 'India' },
    'indian':        { lat: 20.6,  lng: 78.9,  name: 'India' },
    'new delhi':     { lat: 28.61, lng: 77.21, name: 'New Delhi' },
    'libya':         { lat: 26.3,  lng: 17.2,  name: 'Libya' },
    'libyan':        { lat: 26.3,  lng: 17.2,  name: 'Libya' },
    'tripoli':       { lat: 32.89, lng: 13.18, name: 'Tripoli' },
    'sudan':         { lat: 12.9,  lng: 30.2,  name: 'Sudan' },
    'sudanese':      { lat: 12.9,  lng: 30.2,  name: 'Sudan' },
    'south sudan':   { lat: 7.9,   lng: 30.2,  name: 'South Sudan' },
    'khartoum':      { lat: 15.55, lng: 32.53, name: 'Khartoum' },
    'somalia':       { lat: 5.2,   lng: 46.2,  name: 'Somalia' },
    'somali':        { lat: 5.2,   lng: 46.2,  name: 'Somalia' },
    'mogadishu':     { lat: 2.05,  lng: 45.34, name: 'Mogadishu' },
    'ethiopia':      { lat: 9.1,   lng: 40.5,  name: 'Ethiopia' },
    'ethiopian':     { lat: 9.1,   lng: 40.5,  name: 'Ethiopia' },
    'addis ababa':   { lat: 9.03,  lng: 38.74, name: 'Addis Ababa' },
    'nigeria':       { lat: 9.1,   lng: 8.7,   name: 'Nigeria' },
    'nigerian':      { lat: 9.1,   lng: 8.7,   name: 'Nigeria' },
    'abuja':         { lat: 9.07,  lng: 7.40,  name: 'Abuja' },
    'mali':          { lat: 17.6,  lng: -4.0,  name: 'Mali' },
    'niger':         { lat: 17.6,  lng: 8.1,   name: 'Niger' },
    'myanmar':       { lat: 19.7,  lng: 96.1,  name: 'Myanmar' },
    'burmese':       { lat: 19.7,  lng: 96.1,  name: 'Myanmar' },
    'naypyidaw':     { lat: 19.75, lng: 96.08, name: 'Naypyidaw' },
    'bangladesh':    { lat: 23.7,  lng: 90.4,  name: 'Bangladesh' },
    'dhaka':         { lat: 23.72, lng: 90.41, name: 'Dhaka' },
    'haiti':         { lat: 18.9,  lng: -72.3, name: 'Haiti' },
    'port-au-prince':{ lat: 18.54, lng: -72.34,name: 'Port-au-Prince' },
    'venezuela':     { lat: 6.4,   lng: -66.6, name: 'Venezuela' },
    'caracas':       { lat: 10.49, lng: -66.88,name: 'Caracas' },
    'colombia':      { lat: 4.6,   lng: -74.1, name: 'Colombia' },
    'bogota':        { lat: 4.71,  lng: -74.07,name: 'Bogotá' },
    'china':         { lat: 35.9,  lng: 104.2, name: 'China' },
    'chinese':       { lat: 35.9,  lng: 104.2, name: 'China' },
    'beijing':       { lat: 39.91, lng: 116.39,name: 'Beijing' },
    'shanghai':      { lat: 31.23, lng: 121.47,name: 'Shanghai' },
    'north korea':   { lat: 40.3,  lng: 127.5, name: 'North Korea' },
    'pyongyang':     { lat: 39.02, lng: 125.75,name: 'Pyongyang' },
    'taiwan':        { lat: 23.7,  lng: 121.0, name: 'Taiwan' },
    'taipei':        { lat: 25.04, lng: 121.51,name: 'Taipei' },
    'united states': { lat: 38.89, lng: -77.05,name: 'Washington DC' },
    'pentagon':      { lat: 38.87, lng: -77.05,name: 'Pentagon' },
    'washington':    { lat: 38.89, lng: -77.05,name: 'Washington DC' },
    'white house':   { lat: 38.89, lng: -77.03,name: 'White House' },
    'united nations':{ lat: 40.75, lng: -73.97,name: 'United Nations, NY' },
    'un security':   { lat: 40.75, lng: -73.97,name: 'UN Security Council' },
    'britain':       { lat: 51.51, lng: -0.13, name: 'London' },
    'british':       { lat: 51.51, lng: -0.13, name: 'London' },
    'london':        { lat: 51.51, lng: -0.13, name: 'London' },
    'germany':       { lat: 52.52, lng: 13.40, name: 'Berlin' },
    'german':        { lat: 52.52, lng: 13.40, name: 'Berlin' },
    'berlin':        { lat: 52.52, lng: 13.40, name: 'Berlin' },
    'france':        { lat: 48.86, lng: 2.35,  name: 'Paris' },
    'french':        { lat: 48.86, lng: 2.35,  name: 'Paris' },
    'paris':         { lat: 48.86, lng: 2.35,  name: 'Paris' },
    'geneva':        { lat: 46.20, lng: 6.14,  name: 'Geneva' },
    'isis':          { lat: 35.47, lng: 44.39, name: 'Kirkuk (ISIS)' },
    'islamic state': { lat: 35.47, lng: 44.39, name: 'Kirkuk (ISIS)' },
    'daesh':         { lat: 35.47, lng: 44.39, name: 'Kirkuk (ISIS)' },
    'opec':          { lat: 35.47, lng: 44.39, name: 'Kirkuk (Oil/OPEC)' },
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
            rawText:     searchText,
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
const CACHE_TTL_MS    = 3  * 60 * 1000  // 3 minutes
const MAX_ITEM_AGE_MS = 48 * 60 * 60 * 1000 // drop items older than 48 h

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

        // Drop items older than 48 h (e.g. CNN serving stale cached feeds)
        const cutoff = Date.now() - MAX_ITEM_AGE_MS
        const freshItems = allItems.filter((item) => new Date(item.pubDate).getTime() > cutoff)

        // Sort by pubDate descending, keep max 40
        freshItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        const items = freshItems.slice(0, 40)

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
