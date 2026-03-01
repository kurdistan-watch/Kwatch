import { useCallback, useEffect, useRef } from 'react'
import { matchGeoLocation, preloadLocations } from '@/services/geoMatcher'
import useFlightStore from '@/store/useFlightStore'

const POLL_INTERVAL_MS   = 5 * 60 * 1000  // 5 minutes
const THREE_HOURS_MS     = 3 * 60 * 60 * 1000
const TWENTY_FOUR_HRS_MS = 24 * 60 * 60 * 1000

/**
 * useKurdistan24Poll — fetches articles from Kurdistan 24's RSS feed via
 * /api/kurdistan24, runs them through the same geoMatcher pipeline as Rudaw,
 * and merges geo-located items into the shared `news` Zustand store.
 *
 * Items that cannot be geo-located are dropped (same behaviour as Rudaw).
 * Each item is tagged with source: 'Kurdistan 24' so NewsPanel can style
 * them distinctly while still placing pins on the map.
 */
export const useKurdistan24Poll = () => {
    const setK24News  = useFlightStore((s) => s.setK24News)
    const intervalRef = useRef(null)

    const fetchNews = useCallback(async () => {
        try {
            await preloadLocations()

            const res = await fetch('/api/kurdistan24')
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
                        id:           crypto.randomUUID(),
                        title:        item.title,
                        description:  item.description,
                        link:         item.link,
                        pubDate,
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
            console.error('[useKurdistan24Poll]', err)
        }
    }, [setK24News])

    useEffect(() => {
        fetchNews()
        intervalRef.current = setInterval(fetchNews, POLL_INTERVAL_MS)
        return () => clearInterval(intervalRef.current)
    }, [fetchNews])
}
