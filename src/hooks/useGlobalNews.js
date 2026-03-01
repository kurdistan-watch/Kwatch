import { useCallback, useEffect, useRef, useState } from 'react'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes
const THREE_HOURS_MS   = 3 * 60 * 60 * 1000

/**
 * useGlobalNews — fetches world news from the /api/globalNews proxy on a
 * 3-minute polling cadence. Geo-matching is done server-side; the hook only
 * enriches each item with a Date pubDate and an isRecent flag, then stores
 * the result in the Zustand globalNews slice.
 *
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, storyCount: number }}
 */
export const useGlobalNews = () => {
    const setGlobalNews = useFlightStore((s) => s.setGlobalNews)
    const storyCount    = useFlightStore((s) => s.globalNews.length)

    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const intervalRef = useRef(null)

    const fetchGlobalNews = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/globalNews')
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const items = await res.json()
            const now = Date.now()

            const enriched = items.map((item) => ({
                ...item,
                pubDate:  new Date(item.pubDate),
                isRecent: now - new Date(item.pubDate).getTime() < THREE_HOURS_MS,
            }))

            setGlobalNews(enriched)
            setLastUpdated(new Date())
        } catch (err) {
            console.error('[useGlobalNews] ❌ Fetch failed:', err.message)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [setGlobalNews])

    useEffect(() => {
        // Fetch immediately on mount
        fetchGlobalNews()

        // Then poll every 3 minutes
        intervalRef.current = setInterval(fetchGlobalNews, POLL_INTERVAL_MS)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [fetchGlobalNews])

    return { loading, error, lastUpdated, storyCount }
}
