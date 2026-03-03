import React, { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useFlightStore from '@/store/useFlightStore'

// ─────────────────────────────────────────────────────────────────────────────
// AircraftLayer — Canvas-rendered aircraft icons (Flightradar24 style)
//
// Draws every aircraft as an individual rotated plane icon on an HTML5 Canvas
// that is kept perfectly synchronised with Leaflet's zoom/pan animations.
//
// Key techniques:
//   • Uses Leaflet's overlayPane so the CSS transform applied during zoom
//     animations moves the canvas in lockstep with the tile layer.
//   • Redraws on continuous 'move' / 'zoom' events (not just 'moveend').
//   • Uses requestAnimationFrame for smooth, coalesced redraws.
//   • Client-side position interpolation between polls — aircraft drift
//     in their heading/velocity direction so they look alive even when the
//     API hasn't been polled yet.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtAlt = (ft) =>
    ft != null ? `${Math.round(ft).toLocaleString()} ft` : 'N/A'

const fmtSpd = (kt) =>
    kt != null ? `${Math.round(kt)} kt` : 'N/A'

const DEG_TO_RAD = Math.PI / 180
const KT_TO_DEG_PER_SEC = 1 / 3600 / 60  // 1 kt ≈ 1 nm/h; 1 nm ≈ 1/60°

// Classification → filter key mapping
const CLASS_TO_FILTER = {
    COMMERCIAL: 'commercial',
    UNKNOWN:    'unknown',
    MILITARY:   'military',
}

// ── Zoom-dependent icon size ─────────────────────────────────────────────────
const getIconSize = (zoom, isMilOrUnknown) => {
    const base = isMilOrUnknown ? 24 : 20
    if (zoom >= 8)  return base
    if (zoom >= 6)  return Math.round(base * 0.75)
    if (zoom >= 5)  return Math.round(base * 0.58)
    if (zoom >= 4)  return Math.round(base * 0.45)
    return Math.round(base * 0.35)
}

// ── Pre-rendered plane silhouette cache ───────────────────────────────────────
const _spriteCache = new Map()
const HEADING_STEP = 5

const getSprite = (size, color, headingRaw) => {
    const heading = Math.round(headingRaw / HEADING_STEP) * HEADING_STEP
    const key = `${size}|${color}|${heading}`
    if (_spriteCache.has(key)) return _spriteCache.get(key)

    const pad = Math.ceil(size * 0.5)
    const dim = size + pad * 2
    const canvas = document.createElement('canvas')
    canvas.width  = dim
    canvas.height = dim
    const ctx = canvas.getContext('2d')

    ctx.translate(dim / 2, dim / 2)
    ctx.rotate(heading * DEG_TO_RAD)
    ctx.translate(-size / 2, -size / 2)

    const scale = size / 24
    ctx.scale(scale, scale)
    ctx.fillStyle = color

    const path = new Path2D(
        'M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z'
    )
    ctx.fill(path)

    _spriteCache.set(key, canvas)
    return canvas
}

// ── Tooltip DOM element (reused singleton) ────────────────────────────────────

let _tooltip = null

const ensureTooltip = () => {
    if (_tooltip) return _tooltip
    _tooltip = document.createElement('div')
    _tooltip.className = 'aircraft-canvas-tooltip'
    _tooltip.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        display: none;
        background: rgba(15,23,42,0.95);
        border: 1px solid rgba(245,197,24,0.3);
        color: #f5c518;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 3px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        white-space: nowrap;
        font-family: Inter, system-ui, sans-serif;
    `
    document.body.appendChild(_tooltip)
    return _tooltip
}

const showTooltip = (flight, screenX, screenY) => {
    const tip = ensureTooltip()
    const cs  = flight.callsign || flight.icao24
    tip.innerHTML = `
        <div style="font-weight:700;color:#FBBF24;">${cs}</div>
        <div style="color:#CBD5E1;">Alt: ${fmtAlt(flight.altitude)}</div>
        <div style="color:#CBD5E1;">Spd: ${fmtSpd(flight.velocity)}</div>
    `
    tip.style.left    = `${screenX + 14}px`
    tip.style.top     = `${screenY - 10}px`
    tip.style.display = 'block'
}

const hideTooltip = () => {
    if (_tooltip) _tooltip.style.display = 'none'
}

// ── Military glow effect ─────────────────────────────────────────────────────
const drawMilitaryGlow = (ctx, x, y, size, color) => {
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.shadowColor = color
    ctx.shadowBlur  = size * 0.6
    ctx.beginPath()
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
}

// ── Position interpolation ───────────────────────────────────────────────────
// Between API polls, drift aircraft along their heading at their reported
// ground speed so they appear to move smoothly like Flightradar24.

let _lastPollTimestamp = 0  // epoch ms when the last flight data arrived

const interpolatePosition = (flight, nowMs) => {
    if (!_lastPollTimestamp || !flight.velocity || !flight.heading) {
        return { lat: flight.latitude, lng: flight.longitude }
    }

    const elapsedSec = (nowMs - _lastPollTimestamp) / 1000
    // Cap interpolation to 120s so stale data doesn't fly aircraft off-screen
    const dt = Math.min(elapsedSec, 120)

    const speedKt   = flight.velocity  // already in knots
    const headingRad = (flight.heading ?? 0) * DEG_TO_RAD

    // Degrees of latitude per second (1 kt ≈ 1 nm/h, 1 nm ≈ 1/60°)
    const dLat = speedKt * KT_TO_DEG_PER_SEC * Math.cos(headingRad) * dt
    // Degrees of longitude per second (adjusted for latitude)
    const cosLat = Math.cos((flight.latitude ?? 0) * DEG_TO_RAD) || 1
    const dLng = (speedKt * KT_TO_DEG_PER_SEC * Math.sin(headingRad) * dt) / cosLat

    return {
        lat: flight.latitude + dLat,
        lng: flight.longitude + dLng,
    }
}

// ── Custom Leaflet Canvas Layer ──────────────────────────────────────────────
//
// This extends L.Layer and places a <canvas> inside Leaflet's overlayPane.
// The overlayPane is the same container that holds SVG/Canvas vector layers
// and is automatically CSS-transformed by Leaflet during zoom animations,
// keeping our canvas perfectly aligned with tiles.

const AircraftCanvasLayer = L.Layer.extend({
    _flights: [],
    _filters: {},
    _selectFlight: null,
    _hoveredIcao: null,
    _rafId: null,
    _animRafId: null,

    initialize(options) {
        L.Util.setOptions(this, options)
        this._flights       = options.flights       ?? []
        this._filters       = options.filters       ?? {}
        this._selectFlight  = options.selectFlight  ?? (() => {})
    },

    onAdd(map) {
        this._map = map

        // Create canvas inside the overlayPane — this is key for smooth zoom.
        // Leaflet applies CSS transforms to overlayPane children during the
        // zoom animation, so our canvas moves in sync with tiles.
        this._canvas = L.DomUtil.create('canvas', 'aircraft-canvas-layer')
        const pane = map.getPane('overlayPane')
        pane.appendChild(this._canvas)

        this._ctx = this._canvas.getContext('2d')

        // ── Event binding ────────────────────────────────────────────────
        // 'move' and 'zoom' fire continuously during animation (not just end)
        map.on('move zoom viewreset resize', this._scheduleRedraw, this)
        // After zoom/move ends, do a final clean redraw
        map.on('moveend zoomend', this._scheduleRedraw, this)

        // Mouse / click on the *map container* (not the canvas) — the canvas
        // sits in the overlayPane which gets CSS-transformed, making direct
        // event coords unreliable during animations. We listen on the
        // container and convert coordinates ourselves.
        this._onClickBound     = this._onClick.bind(this)
        this._onMouseMoveBound = this._onMouseMove.bind(this)
        this._onMouseOutBound  = this._onMouseOut.bind(this)
        map.getContainer().addEventListener('click',     this._onClickBound)
        map.getContainer().addEventListener('mousemove', this._onMouseMoveBound)
        map.getContainer().addEventListener('mouseout',  this._onMouseOutBound)

        this._fullRedraw()

        // Start the interpolation animation loop
        this._startAnimLoop()
    },

    onRemove(map) {
        map.off('move zoom viewreset resize', this._scheduleRedraw, this)
        map.off('moveend zoomend', this._scheduleRedraw, this)

        map.getContainer().removeEventListener('click',     this._onClickBound)
        map.getContainer().removeEventListener('mousemove', this._onMouseMoveBound)
        map.getContainer().removeEventListener('mouseout',  this._onMouseOutBound)

        if (this._rafId) cancelAnimationFrame(this._rafId)
        if (this._animRafId) cancelAnimationFrame(this._animRafId)

        if (this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas)
        }
        hideTooltip()
    },

    // ── Public setters (called from React) ───────────────────────────────

    setFlights(flights) {
        this._flights = flights
        _lastPollTimestamp = Date.now()
        this._scheduleRedraw()
    },

    setFilters(filters) {
        this._filters = filters
        this._scheduleRedraw()
    },

    setSelectFlight(fn) {
        this._selectFlight = fn
    },

    // ── Redraw scheduling ────────────────────────────────────────────────
    // Coalesces multiple events (move + zoom can fire together) into a
    // single rAF callback so we never draw more than once per frame.

    _scheduleRedraw() {
        if (this._rafId) return
        this._rafId = requestAnimationFrame(() => {
            this._rafId = null
            this._fullRedraw()
        })
    },

    // ── Interpolation animation loop ─────────────────────────────────────
    // Runs at ~30 fps (every other frame at 60 Hz) to drift aircraft
    // between API polls, giving the map a live feel.

    _startAnimLoop() {
        let frame = 0
        const tick = () => {
            this._animRafId = requestAnimationFrame(tick)
            // Only redraw every 2nd frame (~30 fps) to save CPU
            if (++frame % 2 === 0) {
                this._fullRedraw()
            }
        }
        this._animRafId = requestAnimationFrame(tick)
    },

    // ── Full redraw ──────────────────────────────────────────────────────

    _fullRedraw() {
        if (!this._map || !this._ctx) return

        const map = this._map
        const ctx = this._ctx
        const dpr = window.devicePixelRatio || 1
        const mapSize = map.getSize()

        // Resize canvas if needed
        const cw = mapSize.x * dpr
        const ch = mapSize.y * dpr
        if (this._canvas.width !== cw || this._canvas.height !== ch) {
            this._canvas.width  = cw
            this._canvas.height = ch
            this._canvas.style.width  = `${mapSize.x}px`
            this._canvas.style.height = `${mapSize.y}px`
        }

        // Position canvas at the map's current pixel origin — this is what
        // keeps it aligned with the tile layer through pan/zoom.
        const topLeft = map.containerPointToLayerPoint([0, 0])
        L.DomUtil.setPosition(this._canvas, topLeft)

        // Clear and set up the drawing transform
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, mapSize.x, mapSize.y)

        const zoom    = map.getZoom()
        const bounds  = map.getBounds().pad(0.05)
        const nowMs   = Date.now()

        // Store screen positions for hit-testing
        this._screenPositions = []

        for (const flight of this._flights) {
            if (flight.latitude == null || flight.longitude == null) continue
            const key = CLASS_TO_FILTER[flight.classification] ?? 'unknown'
            if (this._filters[key] === false) continue

            // Interpolate position
            const pos = interpolatePosition(flight, nowMs)
            if (!bounds.contains([pos.lat, pos.lng])) continue

            const pt = map.latLngToContainerPoint([pos.lat, pos.lng])

            const isMilitary     = flight.classification === 'MILITARY'
            const isMilOrUnknown = isMilitary || flight.classification === 'UNKNOWN'
            const size  = getIconSize(zoom, isMilOrUnknown)
            const color = flight.displayColor || '#6B7280'

            // Military glow
            if (isMilitary) {
                drawMilitaryGlow(ctx, pt.x, pt.y, size, color)
            }

            // Draw the pre-rendered rotated plane sprite
            const sprite  = getSprite(size, color, flight.heading ?? 0)
            const halfDim = sprite.width / 2
            ctx.drawImage(sprite, pt.x - halfDim, pt.y - halfDim)

            // Store for hit-testing
            this._screenPositions.push({
                x: pt.x,
                y: pt.y,
                radius: Math.max(size * 0.6, 10),
                flight,
            })
        }
    },

    // ── Hit-testing ──────────────────────────────────────────────────────

    _hitTest(containerPt) {
        if (!this._screenPositions) return null
        for (let i = this._screenPositions.length - 1; i >= 0; i--) {
            const sp = this._screenPositions[i]
            const dx = containerPt.x - sp.x
            const dy = containerPt.y - sp.y
            if (dx * dx + dy * dy <= sp.radius * sp.radius) {
                return sp.flight
            }
        }
        return null
    },

    _containerPointFromEvent(e) {
        const rect = this._map.getContainer().getBoundingClientRect()
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    },

    _onClick(e) {
        const pt  = this._containerPointFromEvent(e)
        const hit = this._hitTest(pt)
        if (hit && this._selectFlight) {
            this._selectFlight(hit.icao24)
        }
    },

    _onMouseMove(e) {
        const pt  = this._containerPointFromEvent(e)
        const hit = this._hitTest(pt)

        if (hit) {
            this._map.getContainer().style.cursor = 'pointer'
            if (hit.icao24 !== this._hoveredIcao) {
                this._hoveredIcao = hit.icao24
                showTooltip(hit, e.clientX, e.clientY)
            }
        } else {
            if (this._hoveredIcao) {
                this._map.getContainer().style.cursor = ''
                this._hoveredIcao = null
                hideTooltip()
            }
        }
    },

    _onMouseOut() {
        this._map.getContainer().style.cursor = ''
        this._hoveredIcao = null
        hideTooltip()
    },
})

// ── React wrapper component ──────────────────────────────────────────────────

const AircraftLayer = () => {
    const flights      = useFlightStore((s) => s.flights)
    const filters      = useFlightStore((s) => s.filters)
    const selectFlight = useFlightStore((s) => s.selectFlight)
    const map          = useMap()
    const layerRef     = useRef(null)

    // Create the canvas layer once and add it to the map
    useEffect(() => {
        const layer = new AircraftCanvasLayer({
            flights:       [],
            filters:       {},
            selectFlight:  selectFlight,
        })
        layer.addTo(map)
        layerRef.current = layer

        return () => {
            map.removeLayer(layer)
            layerRef.current = null
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map])

    // Push updated flights into the canvas layer
    useEffect(() => {
        layerRef.current?.setFlights(flights)
    }, [flights])

    // Push updated filters into the canvas layer
    useEffect(() => {
        layerRef.current?.setFilters(filters)
    }, [filters])

    // Keep selectFlight callback current
    useEffect(() => {
        layerRef.current?.setSelectFlight(selectFlight)
    }, [selectFlight])

    return null  // No React DOM — everything is drawn on the canvas
}

export default React.memo(AircraftLayer)
