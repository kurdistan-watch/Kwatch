import { useEffect } from 'react'
import { MapContainer as LeafletMap, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import AircraftLayer from './AircraftLayer'
import ZoneBoundary from './ZoneBoundary'
import FilterBar from '@/components/panel/FilterBar'
import 'leaflet/dist/leaflet.css'

// ── Inner component that can call useMap() hooks ──────────────────────────────

const MapEvents = () => {
    const map = useMap()

    useEffect(() => {
        const handler = (e) => {
            const { lat, lng } = e.detail
            if (lat != null && lng != null) {
                map.flyTo([lat, lng], Math.max(map.getZoom(), 9), { duration: 1.2 })
            }
        }
        window.addEventListener('kwatch:center-aircraft', handler)
        return () => window.removeEventListener('kwatch:center-aircraft', handler)
    }, [map])

    return null
}

// ── MapContainer ──────────────────────────────────────────────────────────────

const MapContainer = () => {
    const center = [36.35, 44.2] // Kurdistan Region centroid
    const defaultZoom = 7
    const minZoom = 4
    const maxZoom = 14

    // Hard clamp to MENA bbox — matches the API bounding box exactly
    const maxBounds = [
        [10.0, 25.0], // SW — Yemen / Libya
        [42.0, 63.0], // NE — Turkey / Pakistan border
    ]

    return (
        <div className="relative w-full" style={{ height: '100%', backgroundColor: '#0a0e1a' }}>
            {/* FilterBar sits over the map using absolute positioning */}
            <FilterBar />

            <LeafletMap
                center={center}
                zoom={defaultZoom}
                minZoom={minZoom}
                maxZoom={maxZoom}
                maxBounds={maxBounds}
                maxBoundsViscosity={1.0}
                scrollWheelZoom={true}
                zoomControl={false}
                attributionControl={false}
                style={{ height: '100%', width: '100%', backgroundColor: '#0a0e1a' }}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    maxZoom={19}
                />

                <ZoomControl position="bottomright" />

                <ZoneBoundary />
                <AircraftLayer />
                <MapEvents />
            </LeafletMap>
        </div>
    )
}

export default MapContainer
