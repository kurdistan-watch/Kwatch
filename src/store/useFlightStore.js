import { create } from 'zustand'

const useFlightStore = create((set) => ({
    flights: [],
    selectedFlight: null,
    setFlights: (flights) => set({ flights }),
    setSelectedFlight: (flight) => set({ selectedFlight: flight }),
}))

export default useFlightStore
