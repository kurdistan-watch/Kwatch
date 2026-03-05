import React, { useMemo, useState, useEffect } from 'react'
import useFlightStore from '@/store/useFlightStore'
import FlightCard from './FlightCard'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASS_DOT_COLOR = {
    COMMERCIAL: '#3B82F6',
    MILITARY:   '#F97316',
    UNKNOWN:    '#38BDF8',
}

const CLASS_LABEL = {
    COMMERCIAL: 'Commercial',
    MILITARY:   'Potential Military',
    UNKNOWN:    'Some Data Missing',
}

const HEADER_TYPES = ['COMMERCIAL', 'MILITARY', 'UNKNOWN']

// ── Mini flight row for the list view ────────────────────────────────────────

const FlightRow = React.memo(({ flight, isSelected, onSelect }) => {
    const age = flight.lastContact
        ? Math.floor(Date.now() / 1000) - flight.lastContact
        : null

    return (
        <Button
            variant="ghost"
            onClick={() => onSelect(flight.icao24)}
            className={cn(
                'w-full h-auto text-left px-3 py-2 rounded-md flex items-start gap-2 justify-start',
                isSelected
                    ? 'bg-slate-700/80 dark:bg-slate-700/80 ring-1 ring-slate-500'
                    : 'hover:bg-slate-200/80 dark:hover:bg-slate-800/70'
            )}
        >
            {/* Color dot + pulse indicator */}
            <div className="relative mt-0.5 shrink-0">
                <span
                    className="block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: flight.displayColor }}
                />
                {flight.pulseAnimation && (
                    <span
                        className="absolute inset-0 rounded-full aircraft-pulse-sm"
                        style={{ '--pulse-color': flight.displayColor }}
                    />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                    <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-300 truncate">
                        {flight.callsign || flight.icao24}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-600 ml-2 shrink-0">
                        {age != null ? `${age}s` : '—'}
                    </span>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex gap-2">
                    <span>{flight.altitude != null ? `${Math.round(flight.altitude).toLocaleString()} ft` : '—'}</span>
                    <span>·</span>
                    <span>{flight.velocity != null ? `${Math.round(flight.velocity)} kt` : '—'}</span>
                    <span>·</span>
                    <span style={{ color: flight.displayColor }}>
                        {CLASS_LABEL[flight.classification] ?? flight.classification}
                    </span>
                </div>
            </div>

            {/* Threat level indicator */}
            {flight.threatLevel > 0 && (
                <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className={`w-1 h-1 rounded-sm ${
                                i < flight.threatLevel
                                    ? ''
                                    : 'bg-slate-700'
                            }`}
                            style={i < flight.threatLevel
                                ? { backgroundColor: flight.displayColor }
                                : undefined
                            }
                        />
                    ))}
                </div>
            )}
        </Button>
    )
})

FlightRow.displayName = 'FlightRow'

// ── SidePanel ─────────────────────────────────────────────────────────────────

const SidePanel = () => {
    const flights        = useFlightStore((s) => s.flights)
    const filters        = useFlightStore((s) => s.filters)
    const selectedIcao   = useFlightStore((s) => s.selectedFlight)
    const selectFlight   = useFlightStore((s) => s.selectFlight)

    // Track last-updated time locally by watching when flights array changes
    const [lastUpdated, setLastUpdated] = useState(null)
    useEffect(() => {
        if (flights.length > 0) setLastUpdated(new Date())
    }, [flights])

    // Default to collapsed on mobile (≤ 768px)
    const [collapsed, setCollapsed] = useState(
        () => typeof window !== 'undefined' && window.innerWidth <= 768
    )

    const classToFilterKey = {
        COMMERCIAL: 'commercial',
        UNKNOWN:    'unknown',
        MILITARY:   'military',
    }

    // Visible flights (filter-aware), sorted by threat DESC
    const visibleFlights = useMemo(() => {
        return flights
            .filter((f) => {
                const key = classToFilterKey[f.classification] ?? 'unknown'
                return filters[key] !== false
            })
            .sort((a, b) => (b.threatLevel ?? 0) - (a.threatLevel ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flights, filters])

    // Count by classification for header
    const typeCounts = useMemo(() => {
        const counts = {}
        for (const f of visibleFlights) {
            const cls = f.classification ?? 'UNCLASSIFIED'
            counts[cls] = (counts[cls] ?? 0) + 1
        }
        return counts
    }, [visibleFlights])

    const selectedFlight = useMemo(
        () => flights.find((f) => f.icao24 === selectedIcao) ?? null,
        [flights, selectedIcao]
    )

    const lastUpdatedStr = lastUpdated
        ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—'

    return (
        <div
            className={`absolute right-0 inset-y-0 z-[1000] flex transition-all duration-300 ${
                collapsed ? 'w-0' : 'w-[300px]'
            }`}
            style={{ overflow: 'visible' }}
        >
            {/* Toggle tab on left edge */}
            <Button
                variant="ghost"
                onClick={() => setCollapsed((c) => !c)}
                className="absolute -left-6 top-1/2 -translate-y-1/2 w-6 h-14 rounded-l-md rounded-r-none
                           bg-white/90 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 border-r-0
                           text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200
                           z-[1001] select-none p-0"
                title={collapsed ? 'Open panel' : 'Collapse panel'}
            >
                <span className="text-xs">{collapsed ? '◀' : '▶'}</span>
            </Button>

            {/* Panel body */}
            <div
                className={`flex flex-col w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-l border-slate-200 dark:border-slate-700/60
                            overflow-hidden transition-opacity duration-300 ${
                                collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
                            }`}
            >
                {/* ── HEADER ───────────────────────────────────── */}
                <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700/60 shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase select-none">
                            Kurdistan Watch
                        </h2>
                        <span className="text-[10px] text-slate-400 dark:text-slate-600">
                            {visibleFlights.length} visible
                        </span>
                    </div>

                    {/* Type count dots */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {HEADER_TYPES.map((cls) => (
                            <div key={cls} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: CLASS_DOT_COLOR[cls] }}
                                />
                                {CLASS_LABEL[cls]}
                                <span className="text-slate-400 dark:text-slate-600">
                                    {typeCounts[cls] ?? 0}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── BODY ─────────────────────────────────────── */}
                <ScrollArea className="flex-1 min-h-0 px-2 py-2">
                    {selectedFlight ? (
                        <div className="relative px-2 pt-1">
                            <FlightCard flight={selectedFlight} />
                        </div>
                    ) : visibleFlights.length > 0 ? (
                        <div className="space-y-0.5">
                            {visibleFlights.map((f) => (
                                <FlightRow
                                    key={f.icao24}
                                    flight={f}
                                    isSelected={f.icao24 === selectedIcao}
                                    onSelect={selectFlight}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 dark:text-slate-600 text-sm">
                            <span className="text-2xl">✈</span>
                            <span>No aircraft in view</span>
                        </div>
                    )}
                </ScrollArea>

                {/* ── FOOTER ───────────────────────────────────── */}
                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700/60 shrink-0 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">
                        Updated: {lastUpdatedStr}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-slate-500">Live</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default React.memo(SidePanel)
