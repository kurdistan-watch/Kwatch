import { useCallback, useEffect, useRef, useState } from 'react'
import { matchGeoLocation, preloadLocations } from '@/services/geoMatcher'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS = 8 * 60 * 1000 // 8 minutes
const THREE_HOURS_MS   = 3 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8_000

/**
 * Stable, serialisable ID derived from the article link — prevents Zustand
 * from seeing new object identities on every poll and triggering re-renders.
 */
const stableId = (link) =>
    link ? btoa(link).replace(/[^a-z0-9]/gi, '').slice(0, 20) : crypto.randomUUID()

/**
 * useNewsPoll — fetches geo-pinned news from Rudaw via /api/news on a
 * separate polling cadence from the flight data (every 8 minutes).
 *
 * For each news item the geo-matcher runs against rawText. Items that
 * cannot be geo-located are dropped. Surviving items are enriched with
 * lat/lng/locationName/isRecent and pushed to the Zustand store.
 *
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, storyCount: number }}
 */
export const useNewsPoll = () => {
    const setNews     = useFlightStore((s) => s.setNews)
    const storyCount  = useFlightStore((s) => s.news.length)

    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const intervalRef = useRef(null)

    const fetchNews = useCallback(async () => {
        // Skip fetch when tab is backgrounded — saves bandwidth
        if (document.visibilityState === 'hidden') return

        setLoading(true)
        setError(null)

        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        try {
            // Ensure locations.json is loaded before matching
            await preloadLocations()

            const res = await fetch('/api/news', { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const items = await res.json()
            const now = Date.now()

            const enriched = items
                .map((item) => {
                    // Pass title & description separately so the matcher
                    // can prioritise the title and strip the dateline
                    const geo = matchGeoLocation(item.rawText, item.title, item.description)
                    if (!geo) return null

                    const pubDate = new Date(item.pubDate)

                    return {
                        id:           stableId(item.link),  // stable — no re-render churn
                        title:        item.title,
                        description:  item.description,
                        link:         item.link,
                        pubDate:      pubDate.toISOString(), // serialisable
                        lat:          geo.lat,
                        lng:          geo.lng,
                        locationName: geo.locationName,
                        isRecent:     now - pubDate.getTime() < THREE_HOURS_MS,
                    }
                })
                .filter(Boolean)

            setNews(enriched)
            setLastUpdated(new Date())
        } catch (err) {
            clearTimeout(timeoutId)
            if (err.name === 'AbortError') {
                console.warn('[useNewsPoll] fetch timed out after 8 s')
            } else {
                console.error('[useNewsPoll] ❌ Fetch failed:', err.message)
                setError(err.message)
            }
        } finally {
            setLoading(false)
        }
    }, [setNews])

    useEffect(() => {
        // Fetch immediately on mount
        fetchNews()

        // Then poll every 8 minutes — independent of flight polling
        intervalRef.current = setInterval(fetchNews, POLL_INTERVAL_MS)

        // Resume immediately when the user navigates back to this tab
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchNews()
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [fetchNews])

    return { loading, error, lastUpdated, storyCount }
}
