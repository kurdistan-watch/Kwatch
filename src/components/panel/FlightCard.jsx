import React, { useCallback, useMemo } from 'react'
import useFlightStore from '@/store/useFlightStore'

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtAlt = (ft) =>
    ft != null ? `${Math.round(ft).toLocaleString()} ft` : 'N/A'

const fmtSpd = (kt) =>
    kt != null ? `${Math.round(kt)} kt` : 'N/A'

const fmtCoord = (val, pos, neg) =>
    val != null
        ? `${Math.abs(val).toFixed(4)}° ${val >= 0 ? pos : neg}`
        : 'N/A'

const fmtVertRate = (fpm) => {
    if (fpm == null) return { label: 'N/A', arrow: '' }
    if (fpm > 50)   return { label: `+${Math.round(fpm)} fpm`, arrow: '▲' }
    if (fpm < -50)  return { label: `${Math.round(fpm)} fpm`, arrow: '▼' }
    return { label: 'Level', arrow: '▶' }
}

const nowEpoch = () => Math.floor(Date.now() / 1000)

const secondsSince = (lastContact) =>
    lastContact ? nowEpoch() - lastContact : null

/** Simple 8-direction compass from heading degrees */
const compassRose = (deg) => {
    if (deg == null) return '—'
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** Country name → flag emoji */
const countryFlag = (country) => {
    const map = {
        'United States':  '🇺🇸',
        'Iraq':           '🇮🇶',
        'Iran':           '🇮🇷',
        'Turkey':         '🇹🇷',
        'Russia':         '🇷🇺',
        'United Kingdom': '🇬🇧',
        'UAE':            '🇦🇪',
        'Germany':        '🇩🇪',
        'Jordan':         '🇯🇴',
        'Qatar':          '🇶🇦',
        'Kuwait':         '🇰🇼',
        'Saudi Arabia':   '🇸🇦',
        'France':         '🇫🇷',
        'Syria':          '🇸🇾',
        'Israel':         '🇮🇱',
    }
    return map[country] ?? '🏳️'
}

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionHeader = ({ label }) => (
    <div className="text-[9px] font-semibold tracking-widest text-slate-500 uppercase mb-1 mt-3 first:mt-0 select-none">
        {label}
    </div>
)

const Row = ({ label, value, valueClass = 'text-slate-200' }) => (
    <div className="flex justify-between items-baseline text-xs py-[3px] border-b border-slate-800/60 last:border-0">
        <span className="text-slate-500 shrink-0 mr-2">{label}</span>
        <span className={`font-medium text-right ${valueClass}`}>{value}</span>
    </div>
)

/** Threat level bar — 0-4 filled segments */
const ThreatBar = ({ level }) => {
    const segColors = ['bg-blue-500', 'bg-slate-500', 'bg-orange-500', 'bg-amber-500', 'bg-red-500']
    const active = segColors[Math.min(level, 4)] ?? 'bg-red-500'
    return (
        <div className="flex gap-1 mt-1">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className={`h-2 flex-1 rounded-sm transition-colors ${
                        i < level ? active : 'bg-slate-700'
                    }`}
                />
            ))}
        </div>
    )
}

// Classification → Tailwind classes
const CLASS_BADGE = {
    UNKNOWN:    'text-red-400 bg-red-500/10 border-red-500/40',
    MILITARY:   'text-orange-400 bg-orange-500/10 border-orange-500/40',
    COMMERCIAL: 'text-blue-400 bg-blue-500/10 border-blue-500/40',
}

// ── Main FlightCard ───────────────────────────────────────────────────────────

const FlightCard = ({ flight }) => {
    const selectFlight = useFlightStore((s) => s.selectFlight)

    const vert       = useMemo(() => fmtVertRate(flight.verticalRate), [flight.verticalRate])
    const secsSince  = useMemo(() => secondsSince(flight.lastContact), [flight.lastContact])
    const signalLost = secsSince != null && secsSince > 120
    const signalWarn = secsSince != null && secsSince > 60 && !signalLost

    const handleTrack = useCallback(() => {
        window.dispatchEvent(
            new CustomEvent('kwatch:center-aircraft', {
                detail: { lat: flight.latitude, lng: flight.longitude },
            })
        )
    }, [flight.latitude, flight.longitude])

    const handleCopy = useCallback(async () => {
        const text = [
            `Callsign:   ${flight.callsign || 'N/A'}`,
            `ICAO24:     ${flight.icao24}`,
            `Origin:     ${flight.originCountry || 'N/A'}`,
            `Position:   ${fmtCoord(flight.latitude, 'N', 'S')}, ${fmtCoord(flight.longitude, 'E', 'W')}`,
            `Altitude:   ${fmtAlt(flight.altitude)}`,
            `Heading:    ${flight.heading != null ? `${flight.heading}°` : 'N/A'} (${compassRose(flight.heading)})`,
            `Speed:      ${fmtSpd(flight.velocity)}`,
            `Vert Rate:  ${vert.arrow} ${vert.label}`,
            `Class:      ${flight.classification ?? 'UNCLASSIFIED'}`,
            `Threat Lvl: ${flight.threatLevel ?? 'N/A'} / 4`,
        ].join('\n')
        try { await navigator.clipboard.writeText(text) }
        catch { /* ignore in sandboxed environments */ }
    }, [flight, vert])

    const badgeClass = CLASS_BADGE[flight.classification] ?? CLASS_BADGE.UNCLASSIFIED

    return (
        <div className="text-sm text-slate-300 relative pb-2">

            {/* Close / deselect */}
            <button
                onClick={() => selectFlight(flight.icao24)}
                title="Deselect aircraft"
                className="absolute top-0 right-0 w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors text-base leading-none"
            >
                ✕
            </button>

            {/* ── 1. IDENTITY ──────────────────────────────── */}
            <SectionHeader label="Identity" />
            <Row
                label="Callsign"
                value={flight.callsign || <span className="text-slate-600 italic">Unknown</span>}
                valueClass="text-yellow-300 font-bold"
            />
            <Row
                label="ICAO24"
                value={<span className="font-mono text-slate-300">{flight.icao24}</span>}
            />
            <Row
                label="Origin"
                value={
                    <span>
                        {countryFlag(flight.originCountry)}&nbsp;
                        {flight.originCountry || 'Unknown'}
                    </span>
                }
            />

            {/* ── 2. POSITION ──────────────────────────────── */}
            <SectionHeader label="Position" />
            <Row label="Latitude"  value={fmtCoord(flight.latitude,  'N', 'S')} />
            <Row label="Longitude" value={fmtCoord(flight.longitude, 'E', 'W')} />
            <Row label="Altitude"  value={fmtAlt(flight.altitude)} />
            <Row
                label="Heading"
                value={
                    flight.heading != null
                        ? `${flight.heading}° · ${compassRose(flight.heading)}`
                        : 'N/A'
                }
            />

            {/* ── 3. MOVEMENT ──────────────────────────────── */}
            <SectionHeader label="Movement" />
            <Row label="Speed" value={fmtSpd(flight.velocity)} />
            <Row
                label="Vert. Rate"
                value={
                    <span
                        className={
                            vert.arrow === '▲' ? 'text-emerald-400'
                            : vert.arrow === '▼' ? 'text-red-400'
                            : 'text-slate-400'
                        }
                    >
                        {vert.arrow} {vert.label}
                    </span>
                }
            />

            {/* ── 4. CLASSIFICATION ────────────────────────── */}
            <SectionHeader label="Classification" />
            <div className={`inline-flex items-center gap-1.5 border rounded px-2 py-0.5 text-xs font-semibold mt-0.5 mb-1 ${badgeClass}`}>
                <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: flight.displayColor }}
                />
                {flight.classification ?? 'UNCLASSIFIED'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 mb-0.5">
                Threat Level&nbsp;{flight.threatLevel ?? 0}&nbsp;/ 4
            </div>
            <ThreatBar level={flight.threatLevel ?? 0} />

            {/* ── 5. SIGNAL ────────────────────────────────── */}
            <SectionHeader label="Signal" />
            {signalLost ? (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold animate-pulse mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    Signal Lost — last seen {secsSince}s ago
                </div>
            ) : (
                <Row
                    label="Last Contact"
                    value={secsSince != null ? `${secsSince}s ago` : 'N/A'}
                    valueClass={signalWarn ? 'text-red-400' : 'text-slate-200'}
                />
            )}

            {/* ── 6. ACTIONS ───────────────────────────────── */}
            <SectionHeader label="Actions" />
            <div className="flex gap-2 mt-1">
                <button
                    onClick={handleTrack}
                    className="flex-1 text-xs py-1.5 px-2 rounded bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-300 hover:text-blue-100 transition-colors"
                >
                    🎯 Track on Map
                </button>
                <button
                    onClick={handleCopy}
                    className="flex-1 text-xs py-1.5 px-2 rounded bg-slate-700/40 hover:bg-slate-600/40 border border-slate-600/40 text-slate-300 hover:text-slate-100 transition-colors"
                >
                    📋 Copy Details
                </button>
            </div>
        </div>
    )
}

export default React.memo(FlightCard)
