import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// ── Dev-only test helpers ─────────────────────────────────────────────────────
if (import.meta.env.DEV) {
    import('./store/useFlightStore').then(({ default: useFlightStore }) => {

        // ── Verified-inside-KRI anchor positions ──────────────────────────
        // Each position is confirmed inside the KRI polygon by ray-cast test.
        const KRI_POSITIONS = {
            erbil:        { lat: 36.191, lon: 44.009 },
            sulaymaniyah: { lat: 35.557, lon: 45.435 },
            duhok:        { lat: 36.867, lon: 42.986 },
            halabja:      { lat: 35.177, lon: 45.986 },
            zakho:        { lat: 37.144, lon: 42.683 },
            rania:        { lat: 36.263, lon: 44.722 },
            rawanduz:     { lat: 36.616, lon: 44.523 },
            koya:         { lat: 36.085, lon: 44.627 },
            chamchamal:   { lat: 35.523, lon: 44.834 },
            pirmam:       { lat: 36.722, lon: 44.447 },
        }

        // ── Base mock-flight builder ──────────────────────────────────────
        // Produces a fully-shaped flight object identical to what classifyFlights()
        // returns, so AircraftLayer renders it as a real marker.
        const _mkFlight = ({ callsign, icao24, originCountry, classification, pos, heading = 0 }) => ({
            icao24,
            callsign,
            originCountry,
            classification,
            latitude:     pos.lat,
            longitude:    pos.lon,
            altitude:     18000 + Math.random() * 12000,   // 18k–30k ft
            velocity:     380  + Math.random() * 120,       // 380–500 kt
            heading,
            verticalRate: 0,
            onGround:     false,
            lastContact:  Math.floor(Date.now() / 1000),
            // classifier output fields
            displayColor:   classification === 'MILITARY' ? '#F97316' : '#3B82F6',
            threatLevel:    classification === 'MILITARY' ? 2 : 0,
            pulseAnimation: classification === 'MILITARY',
            alertMessage:   null,
        })

        // ── Inject flights into the store (merges with existing flights) ──
        const _addFlights = (newFlights) => {
            const current = useFlightStore.getState().flights
            // Remove any previous test flights, then append the new ones
            const clean = current.filter((f) => !f.icao24.startsWith('test-'))
            useFlightStore.getState().setFlights([...clean, ...newFlights])
        }

        const _removeTestFlights = () => {
            const current = useFlightStore.getState().flights
            useFlightStore.getState().setFlights(
                current.filter((f) => !f.icao24.startsWith('test-'))
            )
        }

        // ── Alert-only helpers (no map marker) ───────────────────────────
        const { addAlert, clearAlerts } = useFlightStore.getState()

        const watchlist = (callsign = 'IRN001', originCountry = 'Iran') =>
            addAlert({
                id: crypto.randomUUID(),
                type: 'WATCHLIST_ORIGIN',
                message: `Watchlist aircraft in airspace · ${callsign} · Origin: ${originCountry}`,
                callsign, originCountry,
                icao24: 'test-' + Math.random().toString(36).slice(2, 7),
                timestamp: new Date(),
                acknowledged: false,
            })

        const military = (callsign = 'RCH123', originCountry = 'United States') =>
            addAlert({
                id: crypto.randomUUID(),
                type: 'MILITARY_CLASSIFICATION',
                message: `Military-pattern aircraft detected · ${callsign} · ${originCountry}`,
                callsign, originCountry,
                icao24: 'test-' + Math.random().toString(36).slice(2, 7),
                timestamp: new Date(),
                acknowledged: false,
            })

        const flood = (n = 7) => {
            const countries = ['Iran', 'Russia', 'Israel', 'Ukraine', 'United States', 'North Korea']
            for (let i = 0; i < n; i++) watchlist(`FLD${String(i + 1).padStart(3, '0')}`, countries[i % countries.length])
        }

        // ── Full end-to-end tests (marker on map + alert card) ────────────

        /**
         * Inject a mock Iranian watchlist aircraft over Erbil.
         * → Orange military marker appears on map near Erbil.
         * → WATCHLIST_ORIGIN alert card fires.
         *
         * Usage: __kwatch.testWatchlist()
         * Customise: __kwatch.testWatchlist('sulaymaniyah', 'Russia', 'RUS77')
         */
        const testWatchlist = (location = 'erbil', originCountry = 'Iran', callsign = 'IRN001') => {
            const pos   = KRI_POSITIONS[location] ?? KRI_POSITIONS.erbil
            const icao24 = 'test-' + Math.random().toString(36).slice(2, 7)
            _addFlights([_mkFlight({ callsign, icao24, originCountry, classification: 'COMMERCIAL', pos, heading: 270 })])
            addAlert({
                id: crypto.randomUUID(),
                type: 'WATCHLIST_ORIGIN',
                message: `Watchlist aircraft in airspace · ${callsign} · Origin: ${originCountry}`,
                callsign, originCountry, icao24,
                timestamp: new Date(),
                acknowledged: false,
            })
            console.info(`[KWatch Dev] ✈ Injected watchlist flight ${callsign} (${originCountry}) at ${location}`)
        }

        /**
         * Inject a mock military-pattern aircraft over Sulaymaniyah.
         * → Orange pulsing military marker appears on map.
         * → MILITARY_CLASSIFICATION alert card fires.
         *
         * Usage: __kwatch.testMilitary()
         * Customise: __kwatch.testMilitary('duhok', 'RCH999', 'United States')
         */
        const testMilitary = (location = 'sulaymaniyah', callsign = 'RCH456', originCountry = 'United States') => {
            const pos    = KRI_POSITIONS[location] ?? KRI_POSITIONS.sulaymaniyah
            const icao24 = 'test-' + Math.random().toString(36).slice(2, 7)
            _addFlights([_mkFlight({ callsign, icao24, originCountry, classification: 'MILITARY', pos, heading: 90 })])
            addAlert({
                id: crypto.randomUUID(),
                type: 'MILITARY_CLASSIFICATION',
                message: `Military-pattern aircraft detected · ${callsign} · ${originCountry}`,
                callsign, originCountry, icao24,
                timestamp: new Date(),
                acknowledged: false,
            })
            console.info(`[KWatch Dev] ✈ Injected military flight ${callsign} (${originCountry}) at ${location}`)
        }

        /**
         * Inject one aircraft of each watchlist country, spread across KRI cities.
         * → 6 markers appear on the map simultaneously.
         * → 6 alert cards fire (5 visible + "+1 more" overflow pill).
         *
         * Usage: __kwatch.testScenario()
         */
        const testScenario = () => {
            const scenario = [
                { location: 'erbil',        country: 'Iran',          cs: 'IRN001', cls: 'COMMERCIAL' },
                { location: 'sulaymaniyah', country: 'Russia',        cs: 'RFF100', cls: 'MILITARY'   },
                { location: 'duhok',        country: 'Israel',        cs: 'ISR202', cls: 'COMMERCIAL' },
                { location: 'halabja',      country: 'Ukraine',       cs: 'UKR303', cls: 'COMMERCIAL' },
                { location: 'zakho',        country: 'United States', cs: 'RCH789', cls: 'MILITARY'   },
                { location: 'rania',        country: 'North Korea',   cs: 'PRK404', cls: 'COMMERCIAL' },
            ]
            const flights = scenario.map(({ location, country, cs, cls }) => {
                const icao24 = 'test-' + Math.random().toString(36).slice(2, 7)
                return _mkFlight({ callsign: cs, icao24, originCountry: country, classification: cls, pos: KRI_POSITIONS[location], heading: Math.random() * 360 })
            })
            _addFlights(flights)
            flights.forEach((f) => {
                const isWatchlist = ['Iran','Russia','Israel','Ukraine','North Korea','United States'].includes(f.originCountry)
                addAlert({
                    id: crypto.randomUUID(),
                    type: isWatchlist ? 'WATCHLIST_ORIGIN' : 'MILITARY_CLASSIFICATION',
                    message: isWatchlist
                        ? `Watchlist aircraft in airspace · ${f.callsign} · Origin: ${f.originCountry}`
                        : `Military-pattern aircraft detected · ${f.callsign} · ${f.originCountry}`,
                    callsign: f.callsign, originCountry: f.originCountry, icao24: f.icao24,
                    timestamp: new Date(),
                    acknowledged: false,
                })
            })
            console.info('[KWatch Dev] ✈✈✈ Full scenario injected — 6 flights + 6 alerts')
        }

        /**
         * Remove all injected test flights from the map (alerts stay until dismissed).
         * Usage: __kwatch.removeFlights()
         */
        const removeFlights = _removeTestFlights

        /**
         * Remove test flights AND clear all alert cards.
         * Usage: __kwatch.reset()
         */
        const reset = () => { _removeTestFlights(); clearAlerts() }

        window.__kwatch = {
            // Alert-only (no map marker)
            watchlist, military, flood,
            // Full end-to-end (map marker + alert)
            testWatchlist, testMilitary, testScenario,
            // Cleanup
            removeFlights, reset,
            // Available KRI positions for custom placement
            positions: KRI_POSITIONS,
        }

        console.info(
            '%c[KWatch Dev] Test helpers ready → window.__kwatch\n\n' +
            '  — Map + Alert (end-to-end) —\n' +
            '  __kwatch.testWatchlist()            ← Iranian aircraft over Erbil\n' +
            '  __kwatch.testMilitary()             ← US military over Sulaymaniyah\n' +
            '  __kwatch.testScenario()             ← 6 flights across KRI + overflow pill\n\n' +
            '  — Alert only —\n' +
            '  __kwatch.watchlist("IRN001","Iran")\n' +
            '  __kwatch.military("RCH123","United States")\n' +
            '  __kwatch.flood(7)\n\n' +
            '  — Cleanup —\n' +
            '  __kwatch.removeFlights()            ← remove map markers only\n' +
            '  __kwatch.reset()                    ← remove flights + clear alerts\n\n' +
            '  — Custom placement —\n' +
            '  __kwatch.testWatchlist("duhok","Russia","RUS77")\n' +
            '  __kwatch.testMilitary("zakho","DOOM01","Iran")\n' +
            '  Available locations: ' + Object.keys(KRI_POSITIONS).join(', '),
            'color:#ef4444;font-weight:bold;font-size:11px'
        )
    })
}
