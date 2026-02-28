import React, { useState, useEffect } from 'react'
import { GeoJSON, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'

const ZoneBoundary = () => {
    const [geoData, setGeoData] = useState(null)

    useEffect(() => {
        fetch('/KRIGeo.json')
            .then((r) => r.json())
            .then(setGeoData)
            .catch((e) => console.error('Failed to load KRIGeo.json', e))
    }, [])

    const borderStyle = () => ({
        color: '#f5c518',
        weight: 3.0,
        fillOpacity: 0,
        dashArray: '5,6',
        opacity: 0.7,
    })

    const cities = [
        { name: 'Erbil ★', coords: [36.191, 44.009], capital: true },
        { name: 'Sulaymaniyah', coords: [35.557, 45.435], capital: false },
        { name: 'Duhok', coords: [36.867, 42.986], capital: false },
        { name: 'Halabja', coords: [35.177, 45.986], capital: false },
    ]

    const capitalIcon = L.divIcon({
        className: '',
        html: '<div style="width:9px;height:9px;background:#f5c518;border-radius:50%;box-shadow:0 0 6px 2px rgba(245,197,24,0.7);"></div>',
        iconSize: [9, 9],
        iconAnchor: [4, 4],
    })

    const cityIcon = L.divIcon({
        className: '',
        html: '<div style="width:6px;height:6px;background:#94a3b8;border-radius:50%;box-shadow:0 0 3px rgba(148,163,184,0.5);"></div>',
        iconSize: [6, 6],
        iconAnchor: [3, 3],
    })

    return (
        <>
            {/* KRI border loaded dynamically from KRIGeo.json */}
            {geoData && (
                <GeoJSON
                    key={JSON.stringify(geoData)}
                    data={geoData}
                    style={borderStyle}
                />
            )}

            {/* City markers */}
            {cities.map(({ name, coords, capital }) => (
                <Marker key={name} position={coords} icon={capital ? capitalIcon : cityIcon}>
                    <Tooltip permanent direction="right" offset={[6, 0]} opacity={0.85} className="city-label">
                        {name}
                    </Tooltip>
                </Marker>
            ))}
        </>
    )
}

export default React.memo(ZoneBoundary)
