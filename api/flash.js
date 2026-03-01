// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Rudaw Flash / Ticker News scraper
//
// • Scrapes the "Fast News" ticker from Rudaw's English homepage
//   (these items are server-side rendered in HTML, no JSON API)
// • Extracts title, link, and relative time ("2 hours ago")
// • Caches for 3 minutes; on failure returns last cached result
// ─────────────────────────────────────────────────────────────────────────────

const RUDAW_PAGE = 'https://www.rudaw.net/english'

// ── In-memory cache (persists across warm Vercel invocations) ────────────────
let _cachedItems = null

// ── HTML entity decoder ──────────────────────────────────────────────────────
const decodeEntities = (str) =>
    (str ?? '')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&ldquo;/g, '\u201C')
        .replace(/&rdquo;/g, '\u201D')
        .replace(/&lsquo;/g, '\u2018')
        .replace(/&rsquo;/g, '\u2019')
        .replace(/&mdash;/g, '\u2014')
        .replace(/&ndash;/g, '\u2013')

// ── Parse relative time string into approximate Date ─────────────────────────
const parseTimeAgo = (str) => {
    if (!str) return null
    const now = Date.now()
    const s = str.trim().toLowerCase()

    // Match patterns like "2 hours ago", "45 minutes ago", "1 day ago"
    const m = s.match(/(\d+)\s*(minute|min|hour|hr|day|second|sec)s?\s*ago/)
    if (m) {
        const n = parseInt(m[1], 10)
        const unit = m[2]
        let ms = 0
        if (unit.startsWith('sec'))    ms = n * 1000
        else if (unit.startsWith('min')) ms = n * 60 * 1000
        else if (unit.startsWith('h'))   ms = n * 60 * 60 * 1000
        else if (unit.startsWith('d'))   ms = n * 24 * 60 * 60 * 1000
        return new Date(now - ms)
    }

    // "just now"
    if (s.includes('just now')) return new Date(now)

    return null
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), 8_000)

        const response = await fetch(RUDAW_PAGE, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'KurdistanAirWatch/1.0',
                Accept: 'text/html',
            },
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
            throw new Error(`Rudaw page returned HTTP ${response.status}`)
        }

        const html = await response.text()

        // Extract all ticker items using regex on SSR HTML
        // Each item looks like:
        //   <li class="header__fast-news-item">
        //     <a title="..." href="..." class="header__fast-news-link">
        //       <span class="header__fast-news-time"> 2 hours ago </span>
        //       <span class="header__fast-news-excerpt ..."> headline </span>
        //     </a>
        //   </li>
        const itemRegex = /header__fast-news-item[\s\S]*?<\/li>/g
        const matches = html.match(itemRegex)

        if (!matches || matches.length === 0) {
            throw new Error('No ticker items found in HTML')
        }

        const items = matches
            .map((block) => {
                const titleMatch = block.match(/title="([^"]+)"/)
                const hrefMatch  = block.match(/href="([^"]+)"/)
                const timeMatch  = block.match(/fast-news-time[^>]*>\s*([\s\S]*?)\s*<\/span>/)

                const title  = decodeEntities(titleMatch?.[1] ?? '').trim()
                const link   = (hrefMatch?.[1] ?? '').trim()
                const timeAgo = (timeMatch?.[1] ?? '').trim()

                if (!title || !link) return null

                const pubDate = parseTimeAgo(timeAgo)

                return {
                    title,
                    link,
                    timeAgo,
                    pubDate: pubDate ? pubDate.toISOString() : null,
                    rawText: title,   // for geo-matching (flash headlines are title-only)
                }
            })
            .filter(Boolean)

        // Update cache
        _cachedItems = items

        console.info(`[api/flash] Returning ${items.length} flash items`)

        res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')
        return res.status(200).json(items)
    } catch (err) {
        console.error('[api/flash] ❌', err.name === 'AbortError' ? 'fetch timed out after 8 s' : err.message)

        // Return cached items on error
        if (_cachedItems) {
            console.info('[api/flash] Returning cached items')
            res.setHeader('Cache-Control', 's-maxage=60')
            return res.status(200).json(_cachedItems)
        }

        return res.status(502).json({ error: 'Failed to fetch flash news', detail: err.name === 'AbortError' ? 'upstream timeout' : err.message })
    }
}
