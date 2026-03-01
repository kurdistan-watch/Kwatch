// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Kurdistan 24 News proxy
//
// • Fetches latest articles from Kurdistan 24's English RSS feed
// • Returns up to 40 most-recent items as JSON
// • In-memory cache TTL: 5 minutes
// • On fetch failure returns last cached result rather than erroring
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'

const RSS_URL  = 'https://www.kurdistan24.net/en/rss.xml'
const MAX_ITEMS = 40
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ── XML parser (matches globalNews.js setup) ─────────────────────────────────
const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: '__cdata',
    processEntities: true,
    trimValues: true,
})

function toString(val) {
    if (!val) return ''
    if (typeof val === 'string') return val
    if (typeof val === 'object') {
        if (val.__cdata) return String(val.__cdata)
        if (val['#text']) return String(val['#text'])
    }
    return String(val)
}

// ── In-memory cache (persists across warm Vercel invocations) ────────────────
let _cache     = null
let _cacheTime = 0

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Return cached data if still fresh
    if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
        return res.status(200).json(_cache)
    }

    try {
        const response = await axios.get(RSS_URL, {
            timeout: 8000,
            headers: { 'User-Agent': 'KurdistanAirWatch/1.0 RSS Reader' },
            maxRedirects: 5,
        })

        const parsed   = parser.parse(response.data)
        const rawItems = [].concat(parsed?.rss?.channel?.item ?? [])

        const items = rawItems.slice(0, MAX_ITEMS).map((item) => {
            const title       = toString(item.title).trim()
            const description = toString(item.description).replace(/<[^>]*>/g, '').trim()
            const link        = toString(item.link || item.guid).trim()
            const guidRaw     = toString(item.guid).trim()
            const pubDateRaw  = toString(item.pubDate)
            const pubDate     = pubDateRaw
                ? new Date(pubDateRaw).toISOString()
                : new Date().toISOString()

            return {
                id:          guidRaw || link || title,
                title,
                description,
                rawText:     `${title} ${description}`,
                link,
                pubDate,
                source:      'Kurdistan 24',
            }
        })

        _cache     = items
        _cacheTime = Date.now()

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
        console.log(`[api/kurdistan24] Returning ${items.length} articles`)
        return res.status(200).json(items)

    } catch (err) {
        console.error('[api/kurdistan24] Fetch failed:', err.message)

        // Serve stale cache rather than returning an error to the client
        if (_cache) {
            res.setHeader('Cache-Control', 's-maxage=60')
            return res.status(200).json(_cache)
        }

        return res.status(500).json({ error: 'Failed to fetch Kurdistan 24 RSS' })
    }
}
