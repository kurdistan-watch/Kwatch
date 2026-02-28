import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { GeoJSON, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'

// ── Zone definitions ──────────────────────────────────────────────────────────

const ZONES = [
    { id: 'makhmur',    file: '/MakhmurGeo.json',       label: 'Makhmur',          flip: true  },
    { id: 'kirkukPDK',  file: '/KirkukPDKGeo.json',     label: 'Kirkuk (PDK)',      flip: true  },
    { id: 'kirkukPUK',  file: '/KirkukPUKGeo.json',     label: 'Kirkuk (PUK)',      flip: true  },
    { id: 'kirkukPUK2', file: '/KirkukPUK2Geo.json',    label: 'Kirkuk (PUK 2)',    flip: true  },
    { id: 'salahaddin', file: '/SalahadinPUKGeo.json',  label: 'Salahaddin (PUK)',  flip: true  },
    { id: 'diyala',     file: '/DiyalaPUKGeo.json',     label: 'Diyala (PUK)',      flip: true, safe: true },
    { id: 'neinewa',    file: '/NeinewaGeo.json',        label: 'Neinewa',           flip: true, safe: true },
    { id: 'neinewa2',   file: '/Neinewa2Geo.json',       label: 'Neinewa (East)',    flip: true  },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const zoneStyle = {
    color:       '#f8971b',
    weight:      2.0,
    fillColor:   '#f8971b',
    fillOpacity: 0.12,
    dashArray:   '5,6',
    opacity:     0.20,
}

const zoneStyleSelected = {
    color:       '#facc15',
    weight:      2.5,
    fillColor:   '#f8971b',
    fillOpacity: 0.32,
    dashArray:   '5,6',
    opacity:     0.95,
}

const borderStyle = {
    color:       '#f5c518',
    weight:      3.0,
    fillOpacity: 0,
    dashArray:   '5,6',
    opacity:     0.7,
}

const kriFillStyle = {
    color:       'transparent',
    weight:      0,
    fillColor:   '#f5c518',
    fillOpacity: 0.06,
}

// ── Selectable zone layer ─────────────────────────────────────────────────────

const ZoneLayer = React.memo(({ id, data, label, flip, selected, onSelect }) => {
    const layerRef = useRef(null)

    // Update style whenever selection changes — no remount needed
    useEffect(() => {
        if (layerRef.current) {
            layerRef.current.setStyle(selected ? zoneStyleSelected : zoneStyle)
        }
    }, [selected])

    const onEachFeature = useCallback((feature, layer) => {
        layerRef.current = layer

        layer.on({
            click: () => onSelect(id),
            mouseover: (e) => {
                if (!selected) e.target.setStyle({ fillOpacity: 0.22, opacity: 0.6 })
            },
            mouseout: (e) => {
                if (!selected) e.target.setStyle(zoneStyle)
            },
        })
    }, [id, onSelect, selected])

    return (
        <GeoJSON
            key={id}
            data={data}
            style={selected ? zoneStyleSelected : zoneStyle}
            onEachFeature={onEachFeature}
            coordsToLatLng={flip ? ([lng, lat]) => L.latLng(lat, lng) : undefined}
        />
    )
})

ZoneLayer.displayName = 'ZoneLayer'

// ── Main ZoneBoundary ─────────────────────────────────────────────────────────

const ZoneBoundary = () => {
    const [geoData, setGeoData]   = useState(null)
    const [zoneData, setZoneData] = useState({})   // { [id]: geoJSON }
    const [selected, setSelected] = useState(null) // id of selected zone

    useEffect(() => {
        fetch('/KRIGeo.json')
            .then((r) => r.json())
            .then(setGeoData)
            .catch((e) => console.error('Failed to load KRIGeo.json', e))
    }, [])

    useEffect(() => {
        ZONES.forEach(({ id, file, safe }) => {
            if (safe) {
                // Guard against empty files
                fetch(file)
                    .then((r) => r.text())
                    .then((text) => {
                        if (!text.trim()) return
                        try { setZoneData((prev) => ({ ...prev, [id]: JSON.parse(text) })) }
                        catch (e) { console.error(`${file} is invalid JSON`, e) }
                    })
                    .catch((e) => console.error(`Failed to load ${file}`, e))
            } else {
                fetch(file)
                    .then((r) => r.json())
                    .then((data) => setZoneData((prev) => ({ ...prev, [id]: data })))
                    .catch((e) => console.error(`Failed to load ${file}`, e))
            }
        })
    }, [])

    const kriFillData = useMemo(() => {
        if (!geoData) return null
        return {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [geoData.geometry.coordinates] },
            properties: {},
        }
    }, [geoData])

    const handleSelect = useCallback((id) => {
        setSelected((prev) => (prev === id ? null : id)) // click again to deselect
    }, [])

    const cities = [
        { name: 'Erbil ★',       coords: [36.191, 44.009], capital: true  },
        { name: 'Sulaymaniyah',   coords: [35.557, 45.435], capital: false },
        { name: 'Duhok',          coords: [36.867, 42.986], capital: false },
        { name: 'Halabja',        coords: [35.177, 45.986], capital: false },
    ]

    const capitalIcon = L.divIcon({
        className: '',
        html: '<div style="width:9px;height:9px;background:#f5c518;border-radius:50%;box-shadow:0 0 6px 2px rgba(245,197,24,0.7);"></div>',
        iconSize: [9, 9], iconAnchor: [4, 4],
    })

    const cityIcon = L.divIcon({
        className: '',
        html: '<div style="width:6px;height:6px;background:#94a3b8;border-radius:50%;box-shadow:0 0 3px rgba(148,163,184,0.5);"></div>',
        iconSize: [6, 6], iconAnchor: [3, 3],
    })

    return (
        <>
            {/* KRI fill polygon */}
            {kriFillData && (
                <GeoJSON key="kri-fill" data={kriFillData} style={() => kriFillStyle} />
            )}

            {/* KRI border */}
            {geoData && (
                <GeoJSON key="kri-border" data={geoData} style={() => borderStyle} />
            )}

            {/* Selectable conflict / PDK zones */}
            {ZONES.map(({ id, label, flip }) =>
                zoneData[id] ? (
                    <ZoneLayer
                        key={id}
                        id={id}
                        data={zoneData[id]}
                        label={label}
                        flip={flip}
                        selected={selected === id}
                        onSelect={handleSelect}
                    />
                ) : null
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
