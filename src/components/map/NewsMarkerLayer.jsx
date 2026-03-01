import React, { useMemo } from 'react'
import { Marker, LayerGroup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import useFlightStore from '@/store/useFlightStore'

// ── Build a L.divIcon for a news pin ─────────────────────────────────────────
// Teardrop / balloon shape with a Rudaw-style "R" monogram inside.
// Recent articles (< 3 h) get a warm gold pin; older ones get cool slate.

const buildNewsIcon = (isRecent) => {
    const fill   = isRecent ? '#f5c518' : '#64748b'
    const stroke = isRecent ? '#b8960e' : '#334155'
    const glow   = isRecent ? 'news-pin-glow' : ''

    // SVG teardrop pin with embedded letter
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 42">
          <defs>
            <filter id="ds" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.35"/>
            </filter>
          </defs>
          <path d="M15 41 C15 41, 2 24, 2 15 A13 13 0 1 1 28 15 C28 24, 15 41, 15 41Z"
                fill="${fill}" stroke="${stroke}" stroke-width="1.2" filter="url(#ds)"/>
        
          <text x="15" y="19.5" text-anchor="middle" font-size="13" font-weight="700"
                font-family="system-ui, sans-serif" fill="${fill}">🗞️</text>
        </svg>`

    const html = `<div class="news-pin ${glow}">${svg}</div>`

    return L.divIcon({
        html,
        className: '',
        iconSize: [30, 42],
        iconAnchor: [15, 42],   // bottom-center of teardrop
        popupAnchor: [0, -42],
    })
}

// Cache icons so we don't rebuild on every render
const recentIcon = buildNewsIcon(true)
const olderIcon  = buildNewsIcon(false)

// ── Single news marker ───────────────────────────────────────────────────────

const NewsMarker = React.memo(({ item, offset }) => {
    const map = useMap()
    const selectNews = useFlightStore((s) => s.selectNews)

    const position = [item.lat, item.lng + offset]
    const icon = item.isRecent ? recentIcon : olderIcon

    const handleClick = () => {
        selectNews(item.id)
        map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 8), { duration: 1.2 })
    }

    return (
        <Marker
            position={position}
            icon={icon}
            eventHandlers={{ click: handleClick }}
        >
            <Tooltip
                direction="top"
                offset={[0, -44]}
                className="news-tooltip"
            >
                <span className="font-semibold">{item.locationName}</span>
                <br />
                <span className="text-xs opacity-80">{item.title.length > 60 ? item.title.slice(0, 57) + '…' : item.title}</span>
            </Tooltip>
        </Marker>
    )
})

NewsMarker.displayName = 'NewsMarker'

// ── NewsMarkerLayer ──────────────────────────────────────────────────────────

const NewsMarkerLayer = () => {
    const news = useFlightStore((s) => s.news)
    const showNews = useFlightStore((s) => s.filters.news)
    const newsFilter = useFlightStore((s) => s.newsFilter)

    // Compute per-item offset to avoid stacking markers at the same lat/lng
    const itemsWithOffset = useMemo(() => {
        if (!news.length) return []

        // Group by lat/lng key, assign offset within each group
        const groups = {}
        return news.map((item) => {
            const key = `${item.lat}_${item.lng}`
            if (!(key in groups)) groups[key] = 0
            const idx = groups[key]++
            return { item, offset: idx * 0.05 }
        })
    }, [news])

    if (showNews === false || newsFilter === 'world' || !itemsWithOffset.length) return null

    return (
        <LayerGroup>
            {itemsWithOffset.map(({ item, offset }) => (
                <NewsMarker key={item.id} item={item} offset={offset} />
            ))}
        </LayerGroup>
    )
}

export default React.memo(NewsMarkerLayer)
