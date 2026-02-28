import React, { useMemo } from 'react'
import useFlightStore from '@/store/useFlightStore'

// ── Filter button definitions ─────────────────────────────────────────────────

const FILTER_BUTTONS = [
    {
        key:            'commercial',
        label:          'Commercial',
        icon:           '✈',
        color:          '#3B82F6',
        classification: 'COMMERCIAL',
    },
    {
        key:            'unknown',
        label:          'Some Data Missing',
        icon:           '?',
        color:          '#38BDF8',
        classification: 'UNKNOWN',
    },
    {
        key:            'military',
        label:          'Potential Military',
        icon:           '⚔',
        color:          '#F97316',
        classification: 'MILITARY',
    },
]

// ── FilterBar ─────────────────────────────────────────────────────────────────

const FilterBar = () => {
    const flights      = useFlightStore((s) => s.flights)
    const filters      = useFlightStore((s) => s.filters)
    const toggleFilter = useFlightStore((s) => s.toggleFilter)
    const newsCount    = useFlightStore((s) => s.news.length)
    const flashCount   = useFlightStore((s) => s.flashNews.length)

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

    const newsActive = filters.news !== false
    const flashActive = filters.flash !== false

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
                            backgroundColor: active ? `${color}26` : 'transparent',
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
                            className={`ml-1 min-w-[16px] text-center rounded-full text-[10px] font-bold leading-none py-0.5 px-1
                                ${active ? '' : 'bg-slate-200 dark:bg-slate-800'}`}
                            style={{
                                backgroundColor: active ? `${color}33` : undefined,
                                color: active ? color : '#6B7280',
                            }}
                        >
                            {counts[key] ?? 0}
                        </span>
                    </button>
                )
            })}

            {/* News toggle */}
            <button
                onClick={() => toggleFilter('news')}
                title={`${newsActive ? 'Hide' : 'Show'} News`}
                style={{
                    borderColor: '#f5c518',
                    backgroundColor: newsActive ? '#f5c51826' : 'transparent',
                    color: newsActive ? '#f5c518' : '#6B7280',
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
                    ${newsActive ? 'opacity-95' : 'opacity-60 hover:opacity-80'}
                `}
            >
                <span className="text-[11px] leading-none">📰</span>
                <span className="leading-none">News</span>
                <span
                    className={`ml-1 min-w-[16px] text-center rounded-full text-[10px] font-bold leading-none py-0.5 px-1
                        ${newsActive ? '' : 'bg-slate-200 dark:bg-slate-800'}`}
                    style={{
                        backgroundColor: newsActive ? '#f5c51833' : undefined,
                        color: newsActive ? '#f5c518' : '#6B7280',
                    }}
                >
                    {newsCount}
                </span>
            </button>

            {/* Flash / Breaking news toggle */}
            <button
                onClick={() => toggleFilter('flash')}
                title={`${flashActive ? 'Hide' : 'Show'} Flash News`}
                style={{
                    borderColor: '#ef4444',
                    backgroundColor: flashActive ? '#ef444426' : 'transparent',
                    color: flashActive ? '#ef4444' : '#6B7280',
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
                    ${flashActive ? 'opacity-95' : 'opacity-60 hover:opacity-80'}
                `}
            >
                <span className="text-[11px] leading-none">🚨</span>
                <span className="leading-none">Flash</span>
                <span
                    className={`ml-1 min-w-[16px] text-center rounded-full text-[10px] font-bold leading-none py-0.5 px-1
                        ${flashActive ? '' : 'bg-slate-200 dark:bg-slate-800'}`}
                    style={{
                        backgroundColor: flashActive ? '#ef444433' : undefined,
                        color: flashActive ? '#ef4444' : '#6B7280',
                    }}
                >
                    {flashCount}
                </span>
            </button>
        </div>
    )
}

export default React.memo(FilterBar)
