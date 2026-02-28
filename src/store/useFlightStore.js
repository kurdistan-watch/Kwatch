import { create } from 'zustand'

/**
 * useFlightStore — centralised Zustand store for Kurdistan Air Watch.
 *
 * State shape
 * ───────────
 * flights        {Array}   Normalised flight objects from the OpenSky service.
 * selectedFlight {string|null} icao24 of the currently selected aircraft.
 * filters        {Object}  Visibility toggles keyed by flight type.
 * alerts         {Array}   Auto-generated alert events.
 *
 * Actions
 * ───────
 * setFlights(flights)      Replace the entire flight array.
 * selectFlight(icao24)     Set or clear the selected aircraft.
 * toggleFilter(type)       Toggle a single filter key.
 * addAlert(alert)          Append a new alert event.
 * clearAlerts()            Empty the alerts array.
 */
const useFlightStore = create((set) => ({
    // ── State ──────────────────────────────────────────────────────────────
    flights: [],

    selectedFlight: null,

    filters: {
        commercial: true,
        unknown: true,
        military: true,
        news: true,
        flash: true,
    },

    alerts: [],

    // ── News state ─────────────────────────────────────────────────────────
    news: [],
    selectedNews: null,

    // ── Flash / breaking news state ────────────────────────────────────────
    flashNews: [],

    // ── Actions ────────────────────────────────────────────────────────────

    /**
     * Replace the full flight list (called by the polling hook after each
     * successful fetch).
     * @param {Array} flights  Normalised flight objects.
     */
    setFlights: (flights) => set({ flights }),

    /**
     * Replace the full news list (called by the news polling hook).
     * @param {Array} items  Geo-enriched news items.
     */
    setNews: (items) => set({ news: items }),

    /**
     * Replace the full flash-news list (called by the flash polling hook).
     * @param {Array} items  Geo-enriched flash news items.
     */
    setFlashNews: (items) => set({ flashNews: items }),

    /**
     * Select a news item by its id.
     * @param {string} id  The news item UUID.
     */
    selectNews: (id) => set({ selectedNews: id }),

    /**
     * Clear the currently selected news item.
     */
    clearSelectedNews: () => set({ selectedNews: null }),

    /**
     * Select or deselect an aircraft by its ICAO-24 address.
     * Passing the same icao24 twice will toggle it off (deselect).
     * @param {string|null} icao24
     */
    selectFlight: (icao24) =>
        set((state) => ({
            selectedFlight: state.selectedFlight === icao24 ? null : icao24,
        })),

    /**
     * Toggle the visibility filter for a given flight type.
     * @param {'commercial'|'unknown'|'surveillance'|'military'} type
     */
    toggleFilter: (type) =>
        set((state) => ({
            filters: {
                ...state.filters,
                [type]: !state.filters[type],
            },
        })),

    /**
     * Push a new alert event onto the alert queue.
     * Each alert should have at minimum { id, type, message, timestamp }.
     * @param {Object} alert
     */
    addAlert: (alert) =>
        set((state) => ({
            alerts: [...state.alerts, alert],
        })),

    /**
     * Mark a single alert as acknowledged by its id.
     * The alert remains in the array (for history) but its
     * `acknowledged` flag is set to true so the UI can hide it.
     * @param {string} id  The alert's UUID.
     */
    acknowledgeAlert: (id) =>
        set((state) => ({
            alerts: state.alerts.map((a) =>
                a.id === id ? { ...a, acknowledged: true } : a
            ),
        })),

    /**
     * Wipe all queued alerts.
     */
    clearAlerts: () => set({ alerts: [] }),
}))

export default useFlightStore
