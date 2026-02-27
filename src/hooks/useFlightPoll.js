import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFlights } from '@/services/opensky'
import { classifyFlights } from '@/services/classifier'
import useFlightStore from '@/store/useFlightStore'

/**
 * useFlightPoll — continuously polls the OpenSky Network for live flight data.
 *
 * Behaviour
 * ─────────
 * • Fetches immediately on mount, then repeats every `interval` ms.
 * • Writes fresh flights into the Zustand store via setFlights().
 * • Clears the interval on unmount — no memory leaks.
 * • Tracks loading / error / lastUpdated internally and exposes them.
 *
 * @param {number} [interval=15000]  Poll cadence in milliseconds.
 * @returns {{ loading: boolean, error: string|null, lastUpdated: Date|null, flightCount: number }}
 */
export const useFlightPoll = (interval = 15_000) => {
    const setFlights = useFlightStore((state) => state.setFlights)
    const flightCount = useFlightStore((state) => state.flights.length)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    // Stable ref so the interval callback always closes over the latest setter
    // without needing it as an interval dependency.
    const setFlightsRef = useRef(setFlights)
    useEffect(() => {
        setFlightsRef.current = setFlights
    }, [setFlights])

    const poll = useCallback(async () => {
        setLoading(true)
        try {
            const raw = await fetchFlights()
            const flights = classifyFlights(raw)
            setFlightsRef.current(flights)
            setLastUpdated(new Date())
            setError(null)
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
    }, []) // no deps — relies on the ref above

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
