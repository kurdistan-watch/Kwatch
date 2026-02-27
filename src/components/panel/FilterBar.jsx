import React, { useMemo } from 'react'
import useFlightStore from '@/store/useFlightStore'

// ── Filter button definitions ─────────────────────────────────────────────────

const FILTER_BUTTONS = [
    {
        key:   'commercial',
        label: 'Commercial',
        icon:  '✈',
        color: '#3B82F6',   // blue-500
        // classifier classification that maps to this filter
        classification: 'COMMERCIAL',
    },
    {
        key:   'unknown',
        label: 'Unknown',
        icon:  '?',
        color: '#EF4444',   // red-500
        classification: 'UNKNOWN',
    },
    {
        key:   'surveillance',
        label: 'Surveil.',
        icon:  '🔍',
        color: '#F59E0B',   // amber-500
        classification: 'SURVEILLANCE',
    },
    {
        key:   'military',
        label: 'Military',
        icon:  '⚔',
        color: '#F97316',   // orange-500
        classification: 'MILITARY',
    },
]

// ── FilterBar ─────────────────────────────────────────────────────────────────

const FilterBar = () => {
    const flights      = useFlightStore((s) => s.flights)
    const filters      = useFlightStore((s) => s.filters)
    const toggleFilter = useFlightStore((s) => s.toggleFilter)

    // Count how many visible (unfiltered) aircraft exist for each type
    const counts = useMemo(() => {
        const c = {}
        for (const btn of FILTER_BUTTONS) {
            c[btn.key] = flights.filter(
                (f) => f.classification === btn.classification
            ).length
        }
        return c
    }, [flights])

    return (
        <div className="absolute top-3 left-3 z-[999] flex flex-col gap-1.5">
            {FILTER_BUTTONS.map(({ key, label, icon, color, classification }) => {
                const active = filters[key] !== false

                return (
                    <button
                        key={key}
                        onClick={() => toggleFilter(key)}
                        title={`${active ? 'Hide' : 'Show'} ${label}`}
                        style={{
                            borderColor: color,
                            backgroundColor: active ? `${color}26` : 'transparent',   // ~15% opacity fill
                            color: active ? color : '#6B7280',
                        }}
                        className={`
                            flex items-center gap-1.5
                            px-2.5 py-1 rounded
                            border
                            text-xs font-medium
                            backdrop-blur-sm
                            transition-all duration-150
                            select-none
                            hover:opacity-100
                            ${active ? 'opacity-95' : 'opacity-60 hover:opacity-80'}
                        `}
                    >
                        <span className="text-[11px] leading-none">{icon}</span>
                        <span className="leading-none">{label}</span>
                        <span
                            className="ml-1 min-w-[16px] text-center rounded-full text-[10px] font-bold leading-none py-0.5 px-1"
                            style={{
                                backgroundColor: active ? `${color}33` : '#1e293b',
                                color: active ? color : '#4B5563',
                            }}
                        >
                            {counts[key] ?? 0}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

export default React.memo(FilterBar)
