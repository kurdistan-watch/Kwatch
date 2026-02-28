// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Rudaw News proxy
//
// • Fetches latest articles from Rudaw's internal JSON API
//   (the RSS feed at /en/rss was decommissioned — returns 302 → 404)
// • Filters to items published within the last 24 hours
// • Returns up to 20 most-recent items as JSON
// • Caches for 8 minutes; on failure returns last cached result
// ─────────────────────────────────────────────────────────────────────────────

// Rudaw's internal API — category -8 returns all latest articles across
// Kurdistan, Iraq, Middle East, World, and Economy sections.
const RUDAW_API = 'https://www.rudaw.net/API/News/Listing/-8'
const MAX_ITEMS = 20
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

// ── In-memory cache (persists across warm Vercel invocations) ────────────────
let _cachedItems = null

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities */
const stripHtml = (str) =>
    (str ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&ldquo;/gi, '\u201C')
        .replace(/&rdquo;/gi, '\u201D')
        .replace(/&lsquo;/gi, '\u2018')
        .replace(/&rsquo;/gi, '\u2019')
        .replace(/&mdash;/gi, '\u2014')
        .replace(/&ndash;/gi, '\u2013')
        .replace(/\s+/g, ' ')
        .trim()

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Fetch pages 1 and 2 in parallel to get enough recent articles
        const [page1, page2] = await Promise.all([
            fetch(`${RUDAW_API}?CurrentPage=1&lang=English&isMobileBrowser=False`, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'KurdistanAirWatch/1.0',
                },
            }),
            fetch(`${RUDAW_API}?CurrentPage=2&lang=English&isMobileBrowser=False`, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'KurdistanAirWatch/1.0',
                },
            }),
        ])

        if (!page1.ok) {
            throw new Error(`Rudaw API returned HTTP ${page1.status}`)
        }

        const data1 = await page1.json()
        const data2 = page2.ok ? await page2.json() : null

        const articles1 = data1?.Data?.CategoryNews?.Articles ?? []
        const articles2 = data2?.Data?.CategoryNews?.Articles ?? []
        const allArticles = [...articles1, ...articles2]

        const now = Date.now()
        const cutoff = now - TWENTY_FOUR_HOURS_MS

        const items = allArticles
            .map((article) => {
                // AMPDateTime is local Iraq time (UTC+3) without offset,
                // e.g. "2026-02-28T16:48:00". Append "+03:00" so JS
                // parses it as the correct UTC instant.
                const raw = (article.AMPDateTime ?? '').trim()
                const pubDate = raw
                    ? new Date(
                          raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw)
                              ? raw                 // already has offset
                              : raw + '+03:00'      // assume Iraq time
                      )
                    : null
                if (!pubDate || isNaN(pubDate.getTime())) return null
                if (pubDate.getTime() < cutoff) return null

                const title = (article.Title ?? '').trim()
                // Prefer BodyStripped (plain text) → Summary → Body (HTML)
                const description = stripHtml(
                    article.Summary || article.BodyStripped || article.Body || ''
                ).slice(0, 500) // cap description length
                const link = (article.Link ?? '').trim()

                return {
                    title,
                    description,
                    link,
                    pubDate: pubDate.toISOString(),
                    rawText: `${title} ${description}`,
                }
            })
            .filter(Boolean)
            // De-duplicate by link (articles can appear in multiple pages)
            .filter((item, i, arr) => arr.findIndex((x) => x.link === item.link) === i)
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
            .slice(0, MAX_ITEMS)

        // Update cache
        _cachedItems = items

        console.info(`[api/news] Returning ${items.length} articles`)

        res.setHeader('Cache-Control', 's-maxage=480, stale-while-revalidate=60')
        res.setHeader('Content-Type', 'application/json')
        return res.status(200).json(items)
    } catch (err) {
        console.error('[api/news] Handler error:', err.message)

        // Return cached data if available
        if (_cachedItems) {
            res.setHeader('X-Cached', 'true')
            res.setHeader('Content-Type', 'application/json')
            return res.status(200).json(_cachedItems)
        }

        return res.status(502).json({
            error: 'Failed to fetch Rudaw news',
            detail: err.message,
        })
    }
}
