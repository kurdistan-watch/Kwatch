import React from 'react'
import { Marker, Popup, LayerGroup } from 'react-leaflet'
import L from 'leaflet'
import useFlightStore from '@/store/useFlightStore'

// ── Module-level icon constants (never recreated on render) ───────────────────

const buildOutletIcon = (emoji) =>
    L.divIcon({
        html: `<div style="font-size:20px;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,.6)">${emoji}</div>`,
        className: '',
        iconSize:    [26, 26],
        iconAnchor:  [13, 13],
        popupAnchor: [0, -14],
    })

const OUTLET_ICONS = {
    'Al Jazeera': buildOutletIcon('📡'),
    'CNN':        buildOutletIcon('🔴'),
    'Reuters':    buildOutletIcon('🔷'),
    'Fox News':   buildOutletIcon('🦊'),
    'BBC':        buildOutletIcon('🌐'),
}
const FALLBACK_ICON = buildOutletIcon('📰')

// ── Single marker ─────────────────────────────────────────────────────────────

const GlobalNewsMarker = React.memo(({ item }) => {
    const { geoRegion, source, title, link } = item
    const position = [geoRegion.lat, geoRegion.lng]
    const icon     = OUTLET_ICONS[source] ?? FALLBACK_ICON

    return (
        <Marker position={position} icon={icon}>
            <Popup>
                <div style={{ maxWidth: 240 }}>
                    <strong style={{ fontSize: '0.75rem', opacity: 0.7 }}>{source}</strong>
                    <p style={{ margin: '4px 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{title}</p>
                    <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '0.75rem', color: '#f5c518' }}
                    >
                        Read →
                    </a>
                </div>
            </Popup>
        </Marker>
    )
})

GlobalNewsMarker.displayName = 'GlobalNewsMarker'

// ── Layer ─────────────────────────────────────────────────────────────────────

const GlobalNewsMarkers = () => {
    const globalNews = useFlightStore((s) => s.globalNews)
    const newsFilter = useFlightStore((s) => s.newsFilter)

    const geoItems = globalNews.filter((item) => item.geoRegion != null)

    if (newsFilter === 'rudaw' || !geoItems.length) return null

    return (
        <LayerGroup>
            {geoItems.map((item) => (
                <GlobalNewsMarker key={item.id} item={item} />
            ))}
        </LayerGroup>
    )
}

export default React.memo(GlobalNewsMarkers)
