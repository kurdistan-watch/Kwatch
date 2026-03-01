import React, { useMemo } from 'react'
import { Marker, LayerGroup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import useFlightStore from '@/store/useFlightStore'

// ── Build a L.divIcon for a flash / breaking news pin ────────────────────────
// Uses 🚨 emoji with a red pulse glow for recent items.

const buildFlashIcon = (isRecent) => {
    const glow = isRecent ? 'flash-pin-glow' : ''

    const html = `<div class="flash-pin ${glow}" style="font-size:20px;line-height:1;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));">🚨</div>`

    return L.divIcon({
        html,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -20],
    })
}

// Cache icons so we don't rebuild on every render
const recentIcon = buildFlashIcon(true)
const olderIcon  = buildFlashIcon(false)

// ── Single flash marker ──────────────────────────────────────────────────────

const FlashMarker = React.memo(({ item, offset }) => {
    const map = useMap()

    const position = [item.lat, item.lng + offset]
    const icon = item.isRecent ? recentIcon : olderIcon

    const handleClick = () => {
        // Open article link in new tab
        if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer')
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
                offset={[0, -12]}
                className="flash-tooltip"
            >
                <span className="font-semibold text-red-400">⚡ FLASH</span>
                <span className="mx-1 text-slate-500">·</span>
                <span className="font-semibold">{item.locationName}</span>
                <br />
                <span className="text-xs opacity-80">
                    {item.title.length > 70 ? item.title.slice(0, 67) + '…' : item.title}
                </span>
            </Tooltip>
        </Marker>
    )
})

FlashMarker.displayName = 'FlashMarker'

// ── FlashMarkerLayer ─────────────────────────────────────────────────────────

const FlashMarkerLayer = () => {
    const flashNews = useFlightStore((s) => s.flashNews)
    const showFlash = useFlightStore((s) => s.filters.flash)
    const newsFilter = useFlightStore((s) => s.newsFilter)

    // Compute per-item offset to avoid stacking markers at the same lat/lng
    const itemsWithOffset = useMemo(() => {
        if (!flashNews.length) return []

        const groups = {}
        return flashNews.map((item) => {
            const key = `${item.lat}_${item.lng}`
            if (!(key in groups)) groups[key] = 0
            const idx = groups[key]++
            return { item, offset: idx * 0.06 }
        })
    }, [flashNews])

    if (showFlash === false || newsFilter === 'world' || !itemsWithOffset.length) return null

    return (
        <LayerGroup>
            {itemsWithOffset.map(({ item, offset }) => (
                <FlashMarker key={item.id} item={item} offset={offset} />
            ))}
        </LayerGroup>
    )
}

export default React.memo(FlashMarkerLayer)
