import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFlightsADSB } from '@/services/adsb'
import { classifyFlights } from '@/services/classifier'
import { loadKRIBoundary, isInsideKRI } from '@/services/geoUtils'
import useFlightStore from '@/store/useFlightStore'

// ── KRI boundary — load once at module init ──────────────────────────────────
loadKRIBoundary()

// ── Alert de-duplication ─────────────────────────────────────────────────────
const alertedIcao24s = new Set()

// ── Alert evaluation ─────────────────────────────────────────────────────────
/**
 * Fires alerts for MILITARY-classified aircraft inside the KRI boundary
 * that haven't been alerted yet this session.
 */
const evaluateAlerts = (flights) => {
    const newAlerts = []

    for (const flight of flights) {
        const icao24 = flight.icao24
        if (!icao24 || alertedIcao24s.has(icao24)) continue
        if (!isInsideKRI(flight.latitude, flight.longitude)) continue
        if (flight.classification !== 'MILITARY') continue

        const callsign      = flight.callsign?.trim() || icao24
        const originCountry = flight.originCountry ?? 'Unknown'

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

    return newAlerts
}

/**
 * useFlightPoll — single-source polling from adsb.lol via /api/adsb.
 *
 * All aircraft (civilian + military) are fetched, classified, and rendered.
 * Military classification is based on callsign patterns and ICAO hex blocks —
 * NOT country of origin.
 *
 * @param {Object} opts
 * @param {number} [opts.adsbInterval=15000]  Poll cadence in ms.
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, flightCount: number }}
 */
export const useFlightPoll = ({
    adsbInterval = 15_000,
} = {}) => {
    const setFlights  = useFlightStore((state) => state.setFlights)
    const addAlert    = useFlightStore((state) => state.addAlert)
    const flightCount = useFlightStore((state) => state.flights.length)

    const [loading,     setLoading]     = useState(false)
    const [error,       setError]       = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const setFlightsRef = useRef(setFlights)
    const addAlertRef   = useRef(addAlert)
    useEffect(() => { setFlightsRef.current = setFlights }, [setFlights])
    useEffect(() => { addAlertRef.current   = addAlert   }, [addAlert])

    const poll = useCallback(async () => {
        try {
            setLoading(true)
            const raw        = await fetchFlightsADSB()
            const classified = classifyFlights(raw)

            setFlightsRef.current(classified)
            setLastUpdated(new Date())
            setError(null)

            console.info(`[useFlightPoll] adsb.lol refreshed: ${classified.length} flights`)

            const newAlerts = evaluateAlerts(classified)
            for (const alert of newAlerts) addAlertRef.current(alert)
        } catch (err) {
            console.error('[useFlightPoll] poll error:', err?.message)
            setError(err?.message ?? 'Polling error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        poll()
        const timer = setInterval(poll, adsbInterval)
        return () => clearInterval(timer)
    }, [poll, adsbInterval])

    return { loading, error, lastUpdated, flightCount }
}

export default useFlightPoll
