import { useEffect, useRef, useState } from 'react'
import useFlightStore from '@/store/useFlightStore'

// ── Country → flag emoji helper ──────────────────────────────────────────────
const FLAG_MAP = {
    'Iran': '🇮🇷',
    'Russia': '🇷🇺',
    'Israel': '🇮🇱',
    'Ukraine': '🇺🇦',
    'North Korea': '🇰🇵',
    'United States': '🇺🇸',
}

const countryFlag = (country) => FLAG_MAP[country] ?? '🌐'

// ── Time-ago helper (refreshes every second from outside) ───────────────────
const timeAgo = (date) => {
    const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (secs < 60)  return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    return `${Math.floor(secs / 3600)}h ago`
}

// ── CSS keyframe injector (runs once) ───────────────────────────────────────
const STYLE_ID = 'kwatch-alert-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
        @keyframes kw-slide-in {
            from { transform: translateX(110%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes kw-fade-out {
            from { opacity: 1; }
            to   { opacity: 0; transform: translateX(30px); }
        }
        .kw-slide-in  { animation: kw-slide-in  250ms ease-out forwards; }
        .kw-fade-out  { animation: kw-fade-out   200ms ease-in  forwards; }
    `
    document.head.appendChild(style)
}

const AUTO_DISMISS_MS = 45_000
const MAX_VISIBLE     = 5

// ── Single alert card ────────────────────────────────────────────────────────
const AlertCard = ({ alert, onDismiss }) => {
    const [exiting, setExiting] = useState(false)
    const timerRef = useRef(null)

    const dismiss = () => {
        if (exiting) return
        setExiting(true)
        // wait for fade-out animation before removing from DOM
        setTimeout(() => onDismiss(alert.id), 210)
    }

    useEffect(() => {
        timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS)
        return () => clearTimeout(timerRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div
            onClick={dismiss}
            className={exiting ? 'kw-fade-out' : 'kw-slide-in'}
            style={{
                background: '#ef4444',
                color: '#ffffff',
                borderRadius: '0.5rem',
                padding: '10px 14px',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
                minWidth: '280px',
                maxWidth: '340px',
            }}
        >
            {/* Top row: callsign — message */}
            <div style={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.35 }}>
                ● {alert.callsign} — {alert.message}
            </div>
            {/* Bottom row: flag country · time ago */}
            <div style={{ fontSize: '0.72rem', opacity: 0.88, marginTop: '4px' }}>
                {countryFlag(alert.originCountry)} {alert.originCountry} · <TimeAgo date={alert.timestamp} />
            </div>
        </div>
    )
}

// Live-ticking time-ago label
const TimeAgo = ({ date }) => {
    const [label, setLabel] = useState(() => timeAgo(date))
    useEffect(() => {
        const id = setInterval(() => setLabel(timeAgo(date)), 1_000)
        return () => clearInterval(id)
    }, [date])
    return <span>{label}</span>
}

// ── Main AlertBadge (mounts into the fixed top-right corner) ─────────────────
const AlertBadge = () => {
    const rawAlerts     = useFlightStore((s) => s.alerts)
    const acknowledgeAlert = useFlightStore((s) => s.acknowledgeAlert)

    // Local dismissed set (tracks cards currently fading out / removed from view)
    const [dismissed, setDismissed] = useState(() => new Set())
    const [expanded,  setExpanded]  = useState(false)

    const handleDismiss = (id) => {
        acknowledgeAlert(id)
        setDismissed((prev) => new Set(prev).add(id))
    }

    // Unacknowledged alerts not yet locally dismissed, newest first
    const visible = rawAlerts
        .filter((a) => !a.acknowledged && !dismissed.has(a.id))
        .slice()
        .reverse()   // newest first

    const shown    = expanded ? visible.slice(0, MAX_VISIBLE) : visible.slice(0, MAX_VISIBLE)
    const overflow = visible.length - MAX_VISIBLE

    if (visible.length === 0) return null

    return (
        <div
            style={{
                position: 'fixed',
                top: '56px',       // below the header
                right: '16px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-end',
            }}
        >
            {/* Overflow pill — shown above the cards when > MAX_VISIBLE */}
            {overflow > 0 && (
                <div
                    onClick={() => setExpanded((e) => !e)}
                    style={{
                        background: '#ef4444',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}
                >
                    +{overflow} more
                </div>
            )}

            {shown.map((alert) => (
                <AlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={handleDismiss}
                />
            ))}
        </div>
    )
}

export default AlertBadge
