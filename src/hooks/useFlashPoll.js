import { useCallback, useEffect, useRef, useState } from 'react'
import { matchGeoLocation, preloadLocations } from '@/services/geoMatcher'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes (flash news is more urgent)
const ONE_HOUR_MS      = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8_000

/**
 * Stable, serialisable ID derived from the article link — prevents Zustand
 * from seeing new object identities on every poll and triggering re-renders.
 */
const stableId = (link) =>
    link ? btoa(link).replace(/[^a-z0-9]/gi, '').slice(0, 20) : crypto.randomUUID()

/**
 * useFlashPoll — fetches Rudaw's "Fast News" ticker headlines via /api/flash
 * on a 3-minute polling cadence.
 *
 * Each flash item is geo-matched (title-only since there's no description)
 * and enriched with lat/lng/locationName/isRecent.
 *
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, flashCount: number }}
 */
export const useFlashPoll = () => {
    const setFlashNews = useFlightStore((s) => s.setFlashNews)
    const flashCount   = useFlightStore((s) => s.flashNews.length)

    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const intervalRef = useRef(null)

    const fetchFlash = useCallback(async () => {
        // Skip fetch when tab is backgrounded — saves bandwidth
        if (document.visibilityState === 'hidden') return

        setLoading(true)
        setError(null)

        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        try {
            // Ensure locations.json is loaded before matching
            await preloadLocations()

            const res = await fetch('/api/flash', { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const items = await res.json()
            const now = Date.now()

            const enriched = items
                .map((item) => {
                    // Flash headlines are title-only — pass title as both
                    // title and rawText for geo-matching
                    const geo = matchGeoLocation(item.rawText, item.title, '')
                    if (!geo) return null

                    const pubDate = item.pubDate ? new Date(item.pubDate) : null

                    return {
                        id:           stableId(item.link),  // stable — no re-render churn
                        title:        item.title,
                        link:         item.link,
                        timeAgo:      item.timeAgo,
                        pubDate:      pubDate ? pubDate.toISOString() : null, // serialisable
                        lat:          geo.lat,
                        lng:          geo.lng,
                        locationName: geo.locationName,
                        isRecent:     pubDate ? (now - pubDate.getTime() < ONE_HOUR_MS) : true,
                    }
                })
                .filter(Boolean)

            setFlashNews(enriched)
            setLastUpdated(new Date())
        } catch (err) {
            clearTimeout(timeoutId)
            if (err.name === 'AbortError') {
                console.warn('[useFlashPoll] fetch timed out after 8 s')
            } else {
                console.error('[useFlashPoll] ❌ Fetch failed:', err.message)
                setError(err.message)
            }
        } finally {
            setLoading(false)
        }
    }, [setFlashNews])

    useEffect(() => {
        // Fetch immediately on mount
        fetchFlash()

        // Then poll every 3 minutes
        intervalRef.current = setInterval(fetchFlash, POLL_INTERVAL_MS)

        // Resume immediately when the user navigates back to this tab
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchFlash()
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [fetchFlash])

    return { loading, error, lastUpdated, flashCount }
}
