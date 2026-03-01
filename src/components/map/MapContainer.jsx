import { useEffect } from 'react'
import { MapContainer as LeafletMap, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import AircraftLayer from './AircraftLayer'
import NewsMarkerLayer from './NewsMarkerLayer'
import FlashMarkerLayer from './FlashMarkerLayer'
import GlobalNewsMarkers from './GlobalNewsMarkers'
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

    // News center event — fly to news location at zoom 8
    useEffect(() => {
        const handler = (e) => {
            const { lat, lng } = e.detail
            if (lat != null && lng != null) {
                map.flyTo([lat, lng], Math.max(map.getZoom(), 8), { duration: 1.2 })
            }
        }
        window.addEventListener('kwatch:center-news', handler)
        return () => window.removeEventListener('kwatch:center-news', handler)
    }, [map])

    return null
}

// ── MapContainer ──────────────────────────────────────────────────────────────

const TILE = {
    dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}

const MapContainer = ({ isDark = true }) => {
    const center = [36.35, 44.2] // Kurdistan Region centroid
    const defaultZoom = 7
    const minZoom = 4
    const maxZoom = 14

    // Hard clamp to MENA bbox — matches the API bounding box exactly
    const maxBounds = [
        [10.0, 25.0], // SW — Yemen / Libya
        [42.0, 63.0], // NE — Turkey / Pakistan border
    ]

    const mapBg = isDark ? '#0a0e1a' : '#e8edf2'
    const tileUrl = isDark ? TILE.dark : TILE.light

    return (
        <div className="relative w-full" style={{ height: '100%', backgroundColor: mapBg }}>
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
                style={{ height: '100%', width: '100%', backgroundColor: mapBg }}
            >
                <TileLayer
                    key={tileUrl}
                    url={tileUrl}
                    maxZoom={19}
                />

                <ZoomControl position="bottomleft" />

                <ZoneBoundary />
                <AircraftLayer />
                <NewsMarkerLayer />
                <FlashMarkerLayer />
                <GlobalNewsMarkers />
                <MapEvents />
            </LeafletMap>
        </div>
    )
}

export default MapContainer
