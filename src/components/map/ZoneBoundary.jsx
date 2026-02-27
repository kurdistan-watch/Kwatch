import React from 'react'
import { Polygon, Polyline, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'

const ZoneBoundary = () => {
    // 1. Kurdistan Region bounding box
    const kurdistanBounds = [
        [35.05, 42.30], // SW
        [35.05, 46.15], // SE
        [37.40, 46.15], // NE
        [37.40, 42.30], // NW
    ]

    // 2. Turkey border (north edge)
    const turkeyBorder = [
        [37.40, 42.30],
        [37.40, 46.15],
    ]

    // 3. Iran border (east edge)
    const iranBorder = [
        [37.40, 46.15],
        [35.05, 46.15],
    ]

    // 4. Iraq federal territory (south edge)
    const iraqBorder = [
        [35.05, 42.30],
        [35.05, 46.15],
    ]

    // 5. City markers
    const cities = [
        { name: 'Erbil', coords: [36.191, 44.009] },
        { name: 'Sulaymaniyah', coords: [35.557, 45.435] },
        { name: 'Duhok', coords: [36.867, 42.986] },
        { name: 'Halabja', coords: [35.177, 45.986] },
    ]

    // Custom div icon for city markers
    const cityIcon = L.divIcon({
        className: 'custom-city-marker',
        html: '<div style="width: 6px; height: 6px; background-color: #f5c518; border-radius: 50%; box-shadow: 0 0 4px rgba(245, 197, 24, 0.6);"></div>',
        iconSize: [6, 6],
        iconAnchor: [3, 3],
    })

    return (
        <>
            {/* Kurdistan Region bounding box */}
            <Polygon
                positions={kurdistanBounds}
                pathOptions={{
                    color: '#f5c518',
                    weight: 2,
                    fillOpacity: 0.03,
                    dashArray: '6,4',
                }}
            />

            {/* Turkey border line */}
            <Polyline
                positions={turkeyBorder}
                pathOptions={{
                    color: '#ef4444',
                    weight: 3,
                    opacity: 0.8,
                    dashArray: '10,5',
                }}
            >
                <Tooltip permanent={false} direction="top" opacity={0.9}>
                    Turkey — Active Military Operations Zone
                </Tooltip>
            </Polyline>

            {/* Iran border line */}
            <Polyline
                positions={iranBorder}
                pathOptions={{
                    color: '#f97316',
                    weight: 3,
                    opacity: 0.8,
                    dashArray: '10,5',
                }}
            >
                <Tooltip permanent={false} direction="right" opacity={0.9}>
                    Iran — Restricted Airspace
                </Tooltip>
            </Polyline>

            {/* Iraq federal territory border */}
            <Polyline
                positions={iraqBorder}
                pathOptions={{
                    color: '#64748b',
                    weight: 2,
                    opacity: 0.5,
                    dashArray: '4,6',
                }}
            >
                <Tooltip permanent={false} direction="bottom" opacity={0.9}>
                    Iraq Federal Territory
                </Tooltip>
            </Polyline>

            {/* City markers */}
            {cities.map((city) => (
                <Marker key={city.name} position={city.coords} icon={cityIcon}>
                    <Tooltip permanent direction="right" offset={[8, 0]} opacity={0.85}>
                        {city.name}
                    </Tooltip>
                </Marker>
            ))}
        </>
    )
}

export default React.memo(ZoneBoundary)
