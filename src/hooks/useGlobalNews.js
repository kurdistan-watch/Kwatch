import { useCallback, useEffect, useRef, useState } from 'react'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes
const THREE_HOURS_MS   = 3 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8_000

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
        // Skip fetch when tab is backgrounded — saves bandwidth
        if (document.visibilityState === 'hidden') return

        setLoading(true)
        setError(null)

        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        try {
            const res = await fetch('/api/globalNews', { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const items = await res.json()
            const now = Date.now()

            const enriched = items.map((item) => ({
                ...item,
                pubDate:  new Date(item.pubDate).toISOString(), // serialisable
                isRecent: now - new Date(item.pubDate).getTime() < THREE_HOURS_MS,
            }))

            setGlobalNews(enriched)
            setLastUpdated(new Date())
        } catch (err) {
            clearTimeout(timeoutId)
            if (err.name === 'AbortError') {
                console.warn('[useGlobalNews] fetch timed out after 8 s')
            } else {
                console.error('[useGlobalNews] ❌ Fetch failed:', err.message)
                setError(err.message)
            }
        } finally {
            setLoading(false)
        }
    }, [setGlobalNews])

    useEffect(() => {
        // Fetch immediately on mount
        fetchGlobalNews()

        // Then poll every 3 minutes
        intervalRef.current = setInterval(fetchGlobalNews, POLL_INTERVAL_MS)

        // Resume immediately when the user navigates back to this tab
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchGlobalNews()
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [fetchGlobalNews])

    return { loading, error, lastUpdated, storyCount }
}
