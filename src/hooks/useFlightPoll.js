import { useEffect } from 'react'
import useFlightStore from '@/store/useFlightStore'

export const useFlightPoll = (interval = 10000) => {
    const setFlights = useFlightStore((state) => state.setFlights)

    useEffect(() => {
        const poll = setInterval(() => {
            // polling logic here
        }, interval)

        return () => clearInterval(poll)
    }, [interval, setFlights])
}
