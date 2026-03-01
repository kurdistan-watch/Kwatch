import { useCallback, useEffect, useRef } from 'react'
import { matchGeoLocation, preloadLocations } from '@/services/geoMatcher'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS   = 5 * 60 * 1000  // 5 minutes
const THREE_HOURS_MS     = 3 * 60 * 60 * 1000
const TWENTY_FOUR_HRS_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS   = 8_000

/**
 * Derive a stable, serialisable ID from the article link so that Zustand
 * does not see a new object identity on every poll cycle, preventing
 * unnecessary React re-renders.
 */
const stableId = (link) =>
    link ? btoa(link).replace(/[^a-z0-9]/gi, '').slice(0, 20) : crypto.randomUUID()

/**
 * useKurdistan24Poll — fetches articles from Kurdistan 24's RSS feed via
 * /api/kurdistan24, runs them through the same geoMatcher pipeline as Rudaw,
 * and merges geo-located items into the shared `news` Zustand store.
 *
 * Items that cannot be geo-located are dropped (same behaviour as Rudaw).
 * Each item is tagged with source: 'Kurdistan 24' so NewsPanel can style
 * them distinctly while still placing pins on the map.
 *
 * Performance & resilience improvements:
 *  - Stable IDs derived from article link — no churn on repeat polls
 *  - pubDate stored as ISO string — safe for Zustand persistence / serialisation
 *  - AbortController with 8 s timeout — prevents hanging requests
 *  - Visibility guard — skips the fetch when the tab is hidden
 *  - Resumes immediately when the tab becomes visible again
 */
export const useKurdistan24Poll = () => {
    const setK24News  = useFlightStore((s) => s.setK24News)
    const intervalRef = useRef(null)

    const fetchNews = useCallback(async () => {
        // Skip fetch when the tab is backgrounded — saves bandwidth and
        // prevents stale updates from racing with visible-tab polls.
        if (document.visibilityState === 'hidden') return

        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        try {
            await preloadLocations()

            const res = await fetch('/api/kurdistan24', { signal: controller.signal })
            clearTimeout(timeoutId)

            if (!res.ok) {
                console.warn(`[useKurdistan24Poll] HTTP ${res.status}`)
                return
            }

            const items = await res.json()
            const now   = Date.now()

            const enriched = items
                .map((item) => {
                    const geo = matchGeoLocation(item.rawText, item.title, item.description)
                    if (!geo) return null

                    const pubDate = new Date(item.pubDate)

                    // Drop articles older than 24 hours
                    if (now - pubDate.getTime() > TWENTY_FOUR_HRS_MS) return null

                    return {
                        id:           stableId(item.link),
                        title:        item.title,
                        description:  item.description,
                        link:         item.link,
                        pubDate:      pubDate.toISOString(),   // serialisable — no Date object in store
                        lat:          geo.lat,
                        lng:          geo.lng,
                        locationName: geo.locationName,
                        isRecent:     now - pubDate.getTime() < THREE_HOURS_MS,
                        source:       'Kurdistan 24',
                    }
                })
                .filter(Boolean)

            setK24News(enriched)
            console.log(`[useKurdistan24Poll] ${enriched.length} geo-located articles`)
        } catch (err) {
            clearTimeout(timeoutId)
            if (err.name === 'AbortError') {
                console.warn('[useKurdistan24Poll] fetch timed out after 8 s')
            } else {
                console.error('[useKurdistan24Poll]', err)
            }
        }
    }, [setK24News])

    useEffect(() => {
        fetchNews()
        intervalRef.current = setInterval(fetchNews, POLL_INTERVAL_MS)

        // Resume immediately when the user navigates back to this tab
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchNews()
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            clearInterval(intervalRef.current)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [fetchNews])
}
