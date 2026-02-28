import { useCallback, useEffect, useRef, useState } from 'react'
import { matchGeoLocation } from '@/services/geoMatcher'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS = 8 * 60 * 1000 // 8 minutes
const THREE_HOURS_MS = 3 * 60 * 60 * 1000

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
        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/news')
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const items = await res.json()
            const now = Date.now()

            const enriched = items
                .map((item) => {
                    const geo = matchGeoLocation(item.rawText)
                    if (!geo) return null

                    const pubDate = new Date(item.pubDate)

                    return {
                        id: crypto.randomUUID(),
                        title: item.title,
                        description: item.description,
                        link: item.link,
                        pubDate,
                        lat: geo.lat,
                        lng: geo.lng,
                        locationName: geo.locationName,
                        isRecent: now - pubDate.getTime() < THREE_HOURS_MS,
                    }
                })
                .filter(Boolean)

            setNews(enriched)
            setLastUpdated(new Date())
        } catch (err) {
            console.error('[useNewsPoll] ❌ Fetch failed:', err.message)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [setNews])

    useEffect(() => {
        // Fetch immediately on mount
        fetchNews()

        // Then poll every 8 minutes — independent of flight polling
        intervalRef.current = setInterval(fetchNews, POLL_INTERVAL_MS)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [fetchNews])

    return { loading, error, lastUpdated, storyCount }
}
