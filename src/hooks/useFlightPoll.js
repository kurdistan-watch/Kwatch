import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFlights } from '@/services/opensky'
import { classifyFlights } from '@/services/classifier'
import { loadKRIBoundary, isInsideKRI } from '@/services/geoUtils'
import useFlightStore from '@/store/useFlightStore'

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
 * useFlightPoll — continuously polls the OpenSky Network for live flight data.
 *
 * Behaviour
 * ─────────
 * • Fetches immediately on mount, then repeats every `interval` ms.
 * • Writes fresh flights into the Zustand store via setFlights().
 * • Evaluates alert conditions after every successful poll; dispatches new
 *   alerts via addAlert() — de-duplicated by module-level Set.
 * • Clears the interval on unmount — no memory leaks.
 * • Tracks loading / error / lastUpdated internally and exposes them.
 *
 * @param {number} [interval=60000]  Poll cadence in milliseconds.
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, flightCount: number }}
 */
export const useFlightPoll = (interval = 60_000) => {
    const setFlights  = useFlightStore((state) => state.setFlights)
    const addAlert    = useFlightStore((state) => state.addAlert)
    const flightCount = useFlightStore((state) => state.flights.length)

    const [loading,     setLoading]     = useState(false)
    const [error,       setError]       = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    // Stable refs so the interval callback always closes over the latest
    // store actions without needing them as interval dependencies.
    const setFlightsRef = useRef(setFlights)
    const addAlertRef   = useRef(addAlert)
    useEffect(() => { setFlightsRef.current = setFlights }, [setFlights])
    useEffect(() => { addAlertRef.current   = addAlert   }, [addAlert])

    const poll = useCallback(async () => {
        setLoading(true)
        try {
            const raw     = await fetchFlights()
            const flights = classifyFlights(raw)

            setFlightsRef.current(flights)
            setLastUpdated(new Date())
            setError(null)

            // ── Alert evaluation ──────────────────────────────────────────
            const newAlerts = evaluateAlerts(flights)
            for (const alert of newAlerts) {
                addAlertRef.current(alert)
            }
        } catch (err) {
            // fetchFlights() already swallows errors and returns the last-known
            // state, so reaching here means something unexpected happened.
            const message =
                err?.response?.status === 429
                    ? 'Rate limited by OpenSky – will retry next cycle.'
                    : err?.message ?? 'Unknown polling error.'
            console.error('[useFlightPoll]', message, err)
            setError(message)
        } finally {
            setLoading(false)
        }
    }, []) // no deps — relies on refs above

    useEffect(() => {
        // Immediate first fetch
        poll()

        // Recurring interval
        const timerId = setInterval(poll, interval)

        // Cleanup on unmount or when interval changes
        return () => clearInterval(timerId)
    }, [poll, interval])

    return { loading, error, lastUpdated, flightCount }
}

export default useFlightPoll
