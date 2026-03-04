import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFlights } from '@/services/opensky'
import { fetchFlightsADSB } from '@/services/adsb'
import { classifyFlights } from '@/services/classifier'
import { loadKRIBoundary, isInsideKRI } from '@/services/geoUtils'
import useFlightStore from '@/store/useFlightStore'

// ── Source merger ─────────────────────────────────────────────────────────────
// Combines OpenSky and ADS-B Exchange results. ADS-B Exchange data takes
// priority on duplicates (same icao24) as it tends to have fresher positions.
const mergeFlights = (adsbFlights, openskyFlights) => {
    const seen = new Set(adsbFlights.map((f) => f.icao24))
    const openskyOnly = openskyFlights.filter((f) => !seen.has(f.icao24))
    return [...adsbFlights, ...openskyOnly]
}

// ── KRI boundary — load once at module init ──────────────────────────────────
loadKRIBoundary()

// ── Alert de-duplication ─────────────────────────────────────────────────────
// @private — intentionally unexported. Module-private for the lifetime of the
// page session. Never resets between poll cycles; only a full page reload
// clears it. Not exposed to dev helpers — test helpers use unique random
// icao24 values (prefixed 'test-') that never collide with real ICAO24s.
const alertedIcao24s = new Set()

// ── Watchlist ────────────────────────────────────────────────────────────────
const WATCHLIST_COUNTRIES = new Set([
    'Iran', 'Russia', 'Israel', 'Ukraine', 'North Korea', 'United States',
])

// ── Alert evaluation ─────────────────────────────────────────────────────────
/**
 * Given the classified flight list, returns an array of new alert objects
 * for any aircraft that:
 *   1. Are currently inside the KRI main boundary (KRIGeo.json), AND
 *   2. Match Condition A (watchlist origin country) or
 *      Condition B (MILITARY classification)
 *   AND have NOT already been alerted in this page session.
 *
 * @param {Array} flights  Classified flight objects from classifyFlights()
 * @returns {Array}        Zero or more alert objects ready for addAlert()
 */
const evaluateAlerts = (flights) => {
    const newAlerts = []

    for (const flight of flights) {
        const icao24 = flight.icao24
        if (!icao24 || alertedIcao24s.has(icao24)) continue

        // ── Geo-fence gate: must be inside KRI main boundary ──────────────
        if (!isInsideKRI(flight.latitude, flight.longitude)) continue

        const callsign      = flight.callsign?.trim() || icao24
        const originCountry = flight.originCountry ?? 'Unknown'

        // CONDITION A — Origin country watchlist
        if (WATCHLIST_COUNTRIES.has(flight.originCountry)) {
            alertedIcao24s.add(icao24)
            newAlerts.push({
                id: crypto.randomUUID(),
                type: 'WATCHLIST_ORIGIN',
                message: `Watchlist aircraft in airspace · ${callsign} · Origin: ${originCountry}`,
                callsign,
                originCountry,
                icao24,
                timestamp: new Date(),
                acknowledged: false,
            })
            continue // one alert per aircraft per session — skip Condition B check
        }

        // CONDITION B — Classifier flag: military pattern
        if (flight.classification === 'MILITARY') {
            alertedIcao24s.add(icao24)
            newAlerts.push({
                id: crypto.randomUUID(),
                type: 'MILITARY_CLASSIFICATION',
                message: `Military-pattern aircraft detected · ${callsign} · ${originCountry}`,
                callsign,
                originCountry,
                icao24,
                timestamp: new Date(),
                acknowledged: false,
            })
        }
    }

    return newAlerts
}

/**
 * useFlightPoll — dual-cadence polling for OpenSky + ADS-B Exchange.
 *
 * Behaviour
 * ─────────
 * • OpenSky is polled every `openskyInterval` ms (default 15 s) because its
 *   authenticated API supports ~1 req / 5 s and data refreshes every ~10 s.
 * • ADS-B Exchange is polled every `adsbInterval` ms (default 120 s) to stay
 *   well within the RapidAPI rate limits.
 * • Both sources are merged after each individual poll (ADS-B takes priority
 *   on duplicates).
 * • Alert evaluation runs after every merge.
 * • Clears both intervals on unmount — no memory leaks.
 *
 * @param {Object}  opts
 * @param {number}  [opts.openskyInterval=15000]  OpenSky poll cadence in ms.
 * @param {number}  [opts.adsbInterval=120000]    ADS-B poll cadence in ms.
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, flightCount: number }}
 */
export const useFlightPoll = ({
    openskyInterval = 15_000,
    adsbInterval    = 120_000,
} = {}) => {
    const setFlights  = useFlightStore((state) => state.setFlights)
    const addAlert    = useFlightStore((state) => state.addAlert)
    const flightCount = useFlightStore((state) => state.flights.length)

    const [loading,     setLoading]     = useState(false)
    const [error,       setError]       = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    // Stable refs so the interval callbacks always close over the latest
    // store actions without needing them as interval dependencies.
    const setFlightsRef  = useRef(setFlights)
    const addAlertRef    = useRef(addAlert)
    useEffect(() => { setFlightsRef.current = setFlights }, [setFlights])
    useEffect(() => { addAlertRef.current   = addAlert   }, [addAlert])

    // Last-known results from each source — kept across polls so a fresh
    // OpenSky result can be merged with the most recent ADS-B data and
    // vice-versa.
    const lastAdsbRef    = useRef([])
    const lastOpenskyRef = useRef([])

    // Merge + classify + alert — called after either source updates
    const mergeAndPublish = useCallback(() => {
        const merged  = mergeFlights(lastAdsbRef.current, lastOpenskyRef.current)
        const classified = classifyFlights(merged)

        // ADS-B flights must be classified first, then only MILITARY ones are kept.
        // OpenSky flights are all rendered regardless of classification.
        const flights = classified.filter(
            (f) => f.source !== 'adsb' || f.classification === 'MILITARY'
        )

        setFlightsRef.current(flights)
        setLastUpdated(new Date())
        setError(null)

        const newAlerts = evaluateAlerts(flights)
        for (const alert of newAlerts) {
            addAlertRef.current(alert)
        }
    }, [])

    // ── OpenSky poller ────────────────────────────────────────────────────
    const pollOpensky = useCallback(async () => {
        try {
            const flights = await fetchFlights()
            lastOpenskyRef.current = flights
            console.info(`[useFlightPoll] OpenSky refreshed: ${flights.length} flights`)
            mergeAndPublish()
        } catch (err) {
            console.error('[useFlightPoll] OpenSky error:', err?.message)
        }
    }, [mergeAndPublish])

    // ── ADS-B poller ──────────────────────────────────────────────────────
    const pollAdsb = useCallback(async () => {
        try {
            setLoading(true)
            const flights = await fetchFlightsADSB()
            lastAdsbRef.current = flights
            console.info(`[useFlightPoll] ADS-B refreshed: ${flights.length} flights`)
            mergeAndPublish()
        } catch (err) {
            console.error('[useFlightPoll] ADS-B error:', err?.message)
            setError(err?.message ?? 'ADS-B polling error')
        } finally {
            setLoading(false)
        }
    }, [mergeAndPublish])

    // ── Lifecycle: start both poll loops ───────────────────────────────────
    useEffect(() => {
        // Immediate first fetch for both
        pollOpensky()
        pollAdsb()

        const openskyTimer = setInterval(pollOpensky, openskyInterval)
        const adsbTimer    = setInterval(pollAdsb,    adsbInterval)

        return () => {
            clearInterval(openskyTimer)
            clearInterval(adsbTimer)
        }
    }, [pollOpensky, pollAdsb, openskyInterval, adsbInterval])

    return { loading, error, lastUpdated, flightCount }
}

export default useFlightPoll
