import React, { useMemo } from 'react'
import { Marker, LayerGroup, useMap } from 'react-leaflet'
import L from 'leaflet'
import useFlightStore from '@/store/useFlightStore'

// ── Build a L.divIcon for a news pin ─────────────────────────────────────────

const buildNewsIcon = (isRecent) => {
    const bg = isRecent ? '#f5c518' : '#475569'
    const pulseClass = isRecent ? 'news-pin-pulse' : ''

    const html = `
        <div class="news-pin ${pulseClass}" style="
            width: 16px;
            height: 16px;
            background: ${bg};
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            line-height: 1;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            position: relative;
            cursor: pointer;
        ">📰</div>`

    return L.divIcon({
        html,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })
}

// Cache icons so we don't rebuild on every render
const recentIcon = buildNewsIcon(true)
const olderIcon = buildNewsIcon(false)

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
        />
    )
})

NewsMarker.displayName = 'NewsMarker'

// ── NewsMarkerLayer ──────────────────────────────────────────────────────────

const NewsMarkerLayer = () => {
    const news = useFlightStore((s) => s.news)
    const showNews = useFlightStore((s) => s.filters.news)

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

    if (showNews === false || !itemsWithOffset.length) return null

    return (
        <LayerGroup>
            {itemsWithOffset.map(({ item, offset }) => (
                <NewsMarker key={item.id} item={item} offset={offset} />
            ))}
        </LayerGroup>
    )
}

export default React.memo(NewsMarkerLayer)
