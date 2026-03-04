import React from 'react'
import { Marker, LayerGroup, Tooltip, useMap } from 'react-leaflet'
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
    'Al Jazeera': buildOutletIcon('🗣'),
    'CNN':        buildOutletIcon('🔴'),
    'Reuters':    buildOutletIcon('🔷'),
    'Fox News':   buildOutletIcon('🦊'),
    'BBC':        buildOutletIcon('ℹ️'),
}
const FALLBACK_ICON = buildOutletIcon('📰')

// ── Single marker ─────────────────────────────────────────────────────────────

const GlobalNewsMarker = React.memo(({ item }) => {
    const map        = useMap()
    const selectNews = useFlightStore((s) => s.selectNews)

    const { geoRegion, source, title } = item
    const position = [geoRegion.lat, geoRegion.lng]
    const icon     = OUTLET_ICONS[source] ?? FALLBACK_ICON

    const handleClick = () => {
        selectNews(item.id)
        map.flyTo([geoRegion.lat, geoRegion.lng], Math.max(map.getZoom(), 6), { duration: 1.2 })
    }

    return (
        <Marker position={position} icon={icon} eventHandlers={{ click: handleClick }}>
            <Tooltip
                direction="top"
                offset={[0, -16]}
                className="news-tooltip"
            >
                <span className="font-semibold">{source}</span>
                <br />
                <span className="text-xs opacity-80">
                    {title.length > 60 ? title.slice(0, 57) + '…' : title}
                </span>
            </Tooltip>
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
