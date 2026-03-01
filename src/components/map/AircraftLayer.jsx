import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { Marker, Tooltip, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import useFlightStore from '@/store/useFlightStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtAlt = (ft) =>
    ft != null ? `${Math.round(ft).toLocaleString()} ft` : 'N/A'

const fmtSpd = (kt) =>
    kt != null ? `${Math.round(kt)} kt` : 'N/A'

// Build an L.divIcon for a single flight
const buildIcon = (flight) => {
    const { heading = 0, displayColor = '#6B7280', classification, pulseAnimation } = flight
    const isMilitary = classification === 'MILITARY'
    const isMilOrUnknown = isMilitary || classification === 'UNKNOWN'
    const size = isMilOrUnknown ? 24 : 20

    // Only military gets the glow drop-shadow; unknown is enlarged but plain
    const shadow = isMilitary
        ? `filter:drop-shadow(0 0 3px ${displayColor}88);`
        : ''

    const pulse = pulseAnimation
        ? `<span class="aircraft-pulse" style="--pulse-color:${displayColor}"></span>`
        : ''

    const html = `
        <div class="aircraft-icon" style="width:${size}px;height:${size}px;position:relative;">
            ${pulse}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="${size}"
                height="${size}"
                style="transform:rotate(${heading}deg);display:block;${shadow}"
                fill="${displayColor}"
            >
                <!-- Airplane silhouette -->
                <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z"/>
            </svg>
        </div>`

    return L.divIcon({
        html,
        className: '',
        iconSize:   [size, size],
        iconAnchor: [size / 2, size / 2],
        tooltipAnchor: [size / 2 + 4, 0],
    })
}

// ── Per-aircraft marker with smooth position animation ────────────────────────

const AircraftMarker = React.memo(({ flight, onSelect }) => {
    const markerRef = useRef(null)
    const prevPos   = useRef(null)

    const position = [flight.latitude, flight.longitude]

    // Animate position changes via Leaflet's setLatLng
    useEffect(() => {
        const marker = markerRef.current
        if (!marker) return
        if (prevPos.current) {
            // Leaflet handles interpolation; CSS transition on the icon wrapper
            // gives the smooth glide effect without external tween libs
            marker.setLatLng(position)
        }
        prevPos.current = position
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flight.latitude, flight.longitude])

    const icon = useMemo(() => buildIcon(flight), [flight])

    const handleClick = useCallback(() => onSelect(flight.icao24), [onSelect, flight.icao24])

    return (
        <Marker
            ref={markerRef}
            position={position}
            icon={icon}
            eventHandlers={{ click: handleClick }}
        >
            <Tooltip direction="right" offset={[8, 0]} opacity={0.97} permanent={false}>
                <div className="text-xs leading-snug">
                    <div className="font-bold text-yellow-300">
                        {flight.callsign || flight.icao24}
                    </div>
                    <div className="text-slate-300">Alt: {fmtAlt(flight.altitude)}</div>
                    <div className="text-slate-300">Spd: {fmtSpd(flight.velocity)}</div>
                </div>
            </Tooltip>
        </Marker>
    )
})

AircraftMarker.displayName = 'AircraftMarker'

// ── Zoom-aware cluster wrapper ────────────────────────────────────────────────

const ClusterOrGroup = ({ zoom, children }) => {
    if (zoom < 6) {
        return (
            <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={60}
                iconCreateFunction={(cluster) => {
                    const count = cluster.getChildCount()
                    return L.divIcon({
                        html: `<div class="aircraft-cluster">${count}</div>`,
                        className: '',
                        iconSize: [36, 36],
                        iconAnchor: [18, 18],
                    })
                }}
            >
                {children}
            </MarkerClusterGroup>
        )
    }
    return <>{children}</>
}

// ── Main layer ────────────────────────────────────────────────────────────────

const AircraftLayer = () => {
    const flights      = useFlightStore((s) => s.flights)
    const filters      = useFlightStore((s) => s.filters)
    const selectFlight = useFlightStore((s) => s.selectFlight)
    const map          = useMap()

    const [zoom, setZoom] = useState(() => map.getZoom())

    useEffect(() => {
        const onZoom = () => setZoom(map.getZoom())
        map.on('zoom', onZoom)
        return () => map.off('zoom', onZoom)
    }, [map])

    const classToFilterKey = {
        COMMERCIAL: 'commercial',
        UNKNOWN:    'unknown',
        MILITARY:   'military',
    }

    const visible = useMemo(
        () =>
            flights.filter((f) => {
                if (f.latitude == null || f.longitude == null) return false
                const key = classToFilterKey[f.classification] ?? 'unknown'
                return filters[key] !== false
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [flights, filters]
    )

    return (
        <ClusterOrGroup zoom={zoom}>
            {visible.map((f) => (
                <AircraftMarker
                    key={f.icao24}
                    flight={f}
                    onSelect={selectFlight}
                />
            ))}
        </ClusterOrGroup>
    )
}

// React is used via JSX transform but needs to be in scope for React.memo
export default React.memo(AircraftLayer)
