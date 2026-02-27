import { MapContainer as LeafletMap, TileLayer, ZoomControl } from 'react-leaflet'
import AircraftLayer from './AircraftLayer'
import ZoneBoundary from './ZoneBoundary'
import 'leaflet/dist/leaflet.css'

const MapContainer = () => {
    const center = [36.35, 44.2] // Kurdistan Region centroid
    const defaultZoom = 7
    const minZoom = 5
    const maxZoom = 14

    return (
        <div style={{ height: 'calc(100vh - 48px)', backgroundColor: '#0a0e1a' }}>
            <LeafletMap
                center={center}
                zoom={defaultZoom}
                minZoom={minZoom}
                maxZoom={maxZoom}
                scrollWheelZoom={true}
                zoomControl={false}
                attributionControl={false}
                className="h-full w-full"
                style={{ backgroundColor: '#0a0e1a' }}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    maxZoom={19}
                />
                
                <ZoomControl position="bottomright" />
                
                <ZoneBoundary />
                <AircraftLayer />
            </LeafletMap>
        </div>
    )
}

export default MapContainer
