import React, { useState, useEffect, useMemo, useCallback } from 'react'
import useFlightStore from '@/store/useFlightStore'

// ── Time formatting helpers ──────────────────────────────────────────────────

const timeAgo = (date) => {
    if (!date) return ''
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
    const days = Math.floor(hrs / 24)
    return `${days} day${days > 1 ? 's' : ''} ago`
}

const formatDate = (date) => {
    if (!date) return ''
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) +
        ' ERT'
}

// ── Responsive hook — auto-collapse on narrow screens ────────────────────────

const useIsNarrow = (breakpoint = 1200) => {
    const [narrow, setNarrow] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
    )

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
        const handler = (e) => setNarrow(e.matches)
        mq.addEventListener('change', handler)
        setNarrow(mq.matches)
        return () => mq.removeEventListener('change', handler)
    }, [breakpoint])

    return narrow
}

// ── Duplicate detection between Articles and Breaking Headlines ───────────────
//
// Flash items are short ticker headlines; news items are full article titles.
// A news item is considered a duplicate of a flash item if:
//   1. Their normalised titles are substrings of each other (handles truncation), OR
//   2. They share ≥70% of their words (handles minor wording differences).
// Duplicates are kept only in Breaking Headlines and removed from Articles.

const normalizeTitle = (title) =>
    title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

const isFlashDuplicate = (newsTitle, flashNormalised) => {
    const norm = normalizeTitle(newsTitle)
    return flashNormalised.some((flashNorm) => {
        if (!flashNorm) return false
        // Substring containment in either direction
        if (norm.includes(flashNorm) || flashNorm.includes(norm)) return true
        // Word-overlap ratio ≥ 70 %
        const newsWords  = norm.split(' ')
        const flashWords = new Set(flashNorm.split(' '))
        const shared = newsWords.filter((w) => w.length > 2 && flashWords.has(w)).length
        return shared / Math.max(newsWords.length, flashWords.size) >= 0.7
    })
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

// ── Loading skeleton — shown on first fetch before any articles arrive ────────

const NewsSkeleton = () => (
    <div className="divide-y divide-slate-800/60 animate-pulse">
        {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5" style={{ borderLeft: '3px solid #334155' }}>
                <div className="h-2 w-16 bg-slate-700/60 rounded mb-2" />
                <div className="h-3 bg-slate-700/40 rounded mb-1" />
                <div className="h-3 w-4/5 bg-slate-700/40 rounded mb-2" />
                <div className="h-2 w-10 bg-slate-800/60 rounded" />
            </div>
        ))}
    </div>
)

// ── Outlet emoji map (mirrors GlobalNewsMarkers.jsx) ─────────────────────────

const OUTLET_EMOJI = {
    'Al Jazeera': '🗞️',
    'CNN':        '📍',
    'Reuters':    '🌐',
    'Fox News':   '🦊',
    'BBC':        '🇬🇧',
    'Al Bawaba':  '📌',
}

// ── News list item (Rudaw — unchanged) ───────────────────────────────────────

const NewsListItem = React.memo(({ item, onSelect }) => {
    const [ago, setAgo] = useState(() => timeAgo(item.pubDate))

    // Live-updating time-ago
    useEffect(() => {
        const id = setInterval(() => setAgo(timeAgo(item.pubDate)), 30_000)
        return () => clearInterval(id)
    }, [item.pubDate])

    return (
        <button
            onClick={() => onSelect(item.id, item.lat, item.lng)}
            className="w-full text-left px-3 py-2.5 transition-all duration-150
                       hover:translate-x-0.5 hover:bg-slate-800/50
                       group cursor-pointer"
            style={{ borderLeft: `3px solid ${item.isRecent ? '#f5c518' : '#475569'}` }}
        >
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                    📍 {item.locationName}
                </span>
            </div>
            <div className="text-sm text-white font-medium leading-snug line-clamp-2 group-hover:text-yellow-200 transition-colors">
                {item.title}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
                {ago}
            </div>
        </button>
    )
})

NewsListItem.displayName = 'NewsListItem'

// ── Article detail view ──────────────────────────────────────────────────────

const ArticleView = ({ item, onBack }) => (
    <div className="flex flex-col h-full">
        {/* Back button */}
        <button
            onClick={onBack}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-yellow-400 transition-colors shrink-0"
        >
            ← All Stories
        </button>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Location pill */}
            <span className="inline-block text-[10px] uppercase tracking-wider text-slate-400 bg-slate-800 rounded-full px-2.5 py-0.5 mb-2">
                📍 {item.locationName}
            </span>

            {/* Published time */}
            <div className="text-[11px] text-slate-500 mb-3">
                {formatDate(item.pubDate)}
            </div>

            {/* Headline */}
            <h2 className="text-lg font-bold text-white leading-snug mb-4">
                {item.title}
            </h2>

            {/* Description */}
            <p className="text-sm leading-[1.7] text-slate-400 mb-4">
                {item.description}
            </p>

            {/* Divider */}
            <div className="border-t border-slate-700/60 my-4" />

            {/* Read full story */}
            <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md
                           border border-yellow-500 text-yellow-500
                           hover:bg-yellow-500 hover:text-slate-900
                           transition-all duration-200 text-sm font-medium"
            >
                Read Full Story on Rudaw →
            </a>
        </div>
    </div>
)

// ── Flash / breaking headline list item ──────────────────────────────────────

const FlashListItem = React.memo(({ item }) => {
    const [ago, setAgo] = useState(() => item.timeAgo || timeAgo(item.pubDate))

    // Live-updating time-ago
    useEffect(() => {
        if (!item.pubDate) return
        const id = setInterval(() => setAgo(timeAgo(item.pubDate)), 30_000)
        return () => clearInterval(id)
    }, [item.pubDate])

    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-left px-3 py-2 transition-all duration-150
                       hover:bg-red-950/30 group cursor-pointer"
            style={{ borderLeft: '3px solid #ef4444' }}
        >
            <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] uppercase tracking-wider text-red-400/70 font-medium">
                    📍 {item.locationName}
                </span>
            </div>
            <div className="text-[13px] text-white font-medium leading-snug line-clamp-2 group-hover:text-red-300 transition-colors">
                {item.title}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
                {ago}
            </div>
        </a>
    )
})

FlashListItem.displayName = 'FlashListItem'

// ── World breaking headline list item ────────────────────────────────────────

const WorldBreakingListItem = React.memo(({ item }) => {
    const [ago, setAgo] = useState(() => timeAgo(item.pubDate))

    useEffect(() => {
        const id = setInterval(() => setAgo(timeAgo(item.pubDate)), 30_000)
        return () => clearInterval(id)
    }, [item.pubDate])

    const handleMapCenter = useCallback(() => {
        if (item.geoRegion) {
            window.dispatchEvent(
                new CustomEvent('kwatch:center-news', {
                    detail: { lat: item.geoRegion.lat, lng: item.geoRegion.lng },
                })
            )
        }
    }, [item.geoRegion])

    const emoji = OUTLET_EMOJI[item.source] ?? '📰'

    return (
        <div
            className="px-3 py-2 transition-all duration-150 hover:bg-red-950/30 group"
            style={{ borderLeft: '3px solid #ef4444' }}
        >
            <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] uppercase tracking-wider text-red-400/70 font-medium">
                    {emoji} {item.source}
                </span>
                {item.geoRegion && (
                    <button
                        onClick={handleMapCenter}
                        className="ml-auto text-[10px] text-slate-600 hover:text-yellow-400 transition-colors"
                    >
                        📍 {item.geoRegion.name}
                    </button>
                )}
            </div>
            <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="block text-[13px] text-white font-medium leading-snug line-clamp-2 group-hover:text-red-300 transition-colors"
            >
                {item.title}
            </a>
            <div className="text-[10px] text-slate-500 mt-0.5">{ago}</div>
        </div>
    )
})

WorldBreakingListItem.displayName = 'WorldBreakingListItem'

// ── Global (world) news list item ────────────────────────────────────────────

const GlobalNewsListItem = React.memo(({ item }) => {
    const [ago, setAgo] = useState(() => timeAgo(item.pubDate))

    // Live-updating time-ago
    useEffect(() => {
        const id = setInterval(() => setAgo(timeAgo(item.pubDate)), 30_000)
        return () => clearInterval(id)
    }, [item.pubDate])

    const handleClick = useCallback(() => {
        if (item.geoRegion) {
            window.dispatchEvent(
                new CustomEvent('kwatch:center-news', {
                    detail: { lat: item.geoRegion.lat, lng: item.geoRegion.lng },
                })
            )
        }
    }, [item.geoRegion])

    const emoji = OUTLET_EMOJI[item.source] ?? '📰'

    return (
        <div
            className="px-3 py-2.5 transition-all duration-150 hover:bg-slate-800/50 group"
            style={{ borderLeft: '3px solid #475569' }}
        >
            {/* Outlet badge */}
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                    {emoji} {item.source}
                </span>
                {item.geoRegion && (
                    <button
                        onClick={handleClick}
                        title={`Pan to ${item.geoRegion.name}`}
                        className="ml-auto text-[10px] text-slate-600 hover:text-yellow-400 transition-colors"
                    >
                        📍 {item.geoRegion.name}
                    </button>
                )}
            </div>

            {/* Title + external link */}
            <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-white font-medium leading-snug line-clamp-2 group-hover:text-slate-300 transition-colors"
            >
                {item.title}
            </a>

            <div className="text-[10px] text-slate-500 mt-1">
                {ago}
            </div>
        </div>
    )
})

GlobalNewsListItem.displayName = 'GlobalNewsListItem'

// ── Kurdistan 24 list item ────────────────────────────────────────────────────

const K24ListItem = React.memo(({ item }) => {
    const [ago, setAgo] = useState(() => timeAgo(item.pubDate))

    useEffect(() => {
        const id = setInterval(() => setAgo(timeAgo(item.pubDate)), 30_000)
        return () => clearInterval(id)
    }, [item.pubDate])

    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-left px-3 py-2.5 transition-all duration-150
                       hover:bg-teal-950/30 group cursor-pointer"
            style={{ borderLeft: '3px solid #0d9488' }}
        >
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-teal-400/80 font-medium">
                    📡 Kurdistan 24
                </span>
            </div>
            <div className="text-sm text-white font-medium leading-snug line-clamp-2 group-hover:text-teal-300 transition-colors">
                {item.title}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{ago}</div>
        </a>
    )
})

K24ListItem.displayName = 'K24ListItem'

// ── Filter bar ────────────────────────────────────────────────────────────────

const FILTERS = [
    { key: 'rudaw', label: 'Local sources' },
    { key: 'world', label: 'International sources' },
    { key: 'all',   label: 'All Sources'   },
]

const FilterBar = ({ active, onSelect }) => (
    <div className="flex gap-1 px-3 py-2 border-b border-slate-700/60 shrink-0 bg-slate-900/60">
        {FILTERS.map(({ key, label }) => (
            <button
                key={key}
                onClick={() => onSelect(key)}
                className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                    active === key
                        ? 'bg-yellow-500 text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
                }`}
            >
                {label}
            </button>
        ))}
    </div>
)

// ── NewsPanel ────────────────────────────────────────────────────────────────

const NewsPanel = ({ loading, lastUpdated, flashLoading }) => {
    const news           = useFlightStore((s) => s.news)
    const k24News        = useFlightStore((s) => s.k24News)
    const flashNews      = useFlightStore((s) => s.flashNews)
    const globalNews     = useFlightStore((s) => s.globalNews)
    const newsFilter     = useFlightStore((s) => s.newsFilter)
    const setNewsFilter  = useFlightStore((s) => s.setNewsFilter)
    const selectedNews   = useFlightStore((s) => s.selectedNews)
    const selectNews     = useFlightStore((s) => s.selectNews)
    const clearSelected  = useFlightStore((s) => s.clearSelectedNews)

    const isNarrow = useIsNarrow()
    const [collapsed, setCollapsed] = useState(isNarrow)

    // Auto-collapse/expand when crossing the breakpoint
    useEffect(() => {
        setCollapsed(isNarrow)
    }, [isNarrow])

    // Live-updating "Updated Xm ago" text
    const [updatedAgo, setUpdatedAgo] = useState('')
    useEffect(() => {
        const update = () => {
            if (!lastUpdated) { setUpdatedAgo(''); return }
            const mins = Math.floor((Date.now() - lastUpdated.getTime()) / 60_000)
            setUpdatedAgo(mins < 1 ? 'Updated just now' : `Updated ${mins}m ago`)
        }
        update()
        const id = setInterval(update, 30_000)
        return () => clearInterval(id)
    }, [lastUpdated])

    const selectedItem = useMemo(
        () => news.find((n) => n.id === selectedNews) ?? k24News.find((n) => n.id === selectedNews) ?? null,
        [news, k24News, selectedNews]
    )

    // Auto-expand panel when a news marker is clicked on the map
    useEffect(() => {
        if (selectedItem) {
            setCollapsed(false)
            // Switch to the local-sources tab so the ArticleView is visible
            if (newsFilter === 'world') {
                setNewsFilter('rudaw')
            }
        }
    }, [selectedItem, newsFilter, setNewsFilter])

    const handleSelect = useCallback((id, lat, lng) => {
        selectNews(id)
        window.dispatchEvent(
            new CustomEvent('kwatch:center-news', { detail: { lat, lng } })
        )
    }, [selectNews])

    const handleBack = useCallback(() => clearSelected(), [clearSelected])

    // Articles deduplicated against Breaking Headlines (Rudaw only)
    const deduplicatedNews = useMemo(() => {
        if (!flashNews.length) return news
        const flashNormalised = flashNews.map((f) => normalizeTitle(f.title))
        return news.filter((item) => !isFlashDuplicate(item.title, flashNormalised))
    }, [news, flashNews])

    // Rudaw tab: deduplicated Rudaw + K24 merged and sorted by pubDate
    const rudawTabArticles = useMemo(() => {
        const rudawTagged = deduplicatedNews.map((item) => ({ ...item, _src: 'rudaw' }))
        const k24Tagged   = k24News.map((item)   => ({ ...item, _src: 'k24'   }))
        return [...rudawTagged, ...k24Tagged].sort(
            (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
        )
    }, [deduplicatedNews, k24News])

    // Merged + sorted list for 'all' filter (deduplicated Rudaw + K24 + world)
    const mergedItems = useMemo(() => {
        if (newsFilter !== 'all') return []
        const rudawTagged  = deduplicatedNews.map((item) => ({ ...item, _type: 'rudaw' }))
        const k24Tagged    = k24News.map((item)   => ({ ...item, _type: 'k24'   }))
        const globalTagged = globalNews.map((item) => ({ ...item, _type: 'world' }))
        return [...rudawTagged, ...k24Tagged, ...globalTagged].sort(
            (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
        )
    }, [newsFilter, deduplicatedNews, k24News, globalNews])

    // World breaking headlines — within 24 h, newest first
    const worldBreaking = useMemo(() =>
        globalNews
            .filter((item) => item.isBreaking && Date.now() - new Date(item.pubDate).getTime() < TWENTY_FOUR_HOURS_MS)
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)),
    [globalNews])

    // World articles (non-breaking) — within 24 h, newest first, max 40
    const worldArticles = useMemo(() =>
        globalNews
            .filter((item) => !item.isBreaking && Date.now() - new Date(item.pubDate).getTime() < TWENTY_FOUR_HOURS_MS)
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
            .slice(0, 40),
    [globalNews])

    return (
        <div
            className={`relative h-full flex transition-all duration-300 ${
                collapsed ? 'w-[30px]' : isNarrow ? 'w-[30px]' : 'w-[280px]'
            }`}
            style={{ flexShrink: 0 }}
        >
            {/* Collapsed rail — always visible on narrow screens */}
            {(collapsed || isNarrow) && (
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="w-[30px] h-full flex flex-col items-center justify-center gap-2
                               bg-slate-900/95 border-r border-slate-700/60
                               text-slate-500 hover:text-yellow-400 transition-colors shrink-0"
                    title={collapsed ? 'Expand news panel' : 'Collapse news panel'}
                >
                    <span className="text-sm">📰</span>
                    <span className="text-[9px]"
                          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                        NEWS
                    </span>
                </button>
            )}

            {/* Expanded panel — overlays on narrow screens */}
            {!collapsed && (
                <div className={`flex flex-col bg-slate-900/95 backdrop-blur-sm border-r border-slate-700/60 overflow-hidden
                    ${isNarrow
                        ? 'absolute left-[30px] top-0 bottom-0 w-[280px] z-[1100] shadow-2xl'
                        : 'w-full'
                    }`}
                >
                    {/* ── HEADER ─────────────────────────────────── */}
                    <div className="px-3 pt-3 pb-2 border-b border-slate-700/60 shrink-0">
                        <div className="flex items-center justify-between">
                            <h2 className="text-[11px] font-bold tracking-[0.15em] text-yellow-500 uppercase select-none">
                                LATEST NEWS
                            </h2>
                            <button
                                onClick={() => setCollapsed(true)}
                                className="text-slate-600 hover:text-slate-400 text-xs transition-colors lg:hidden"
                                title="Collapse"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Kurdish subtitle */}
                        <div className="text-[11px] text-slate-500 mt-0.5" style={{ fontFamily: "'Noto Naskh Arabic', serif" }}>
                            هەواڵ
                        </div>

                        {/* Story count + refresh */}
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-slate-500">
                                {deduplicatedNews.length} rudaw · {k24News.length} k24 · {globalNews.length} world
                            </span>
                            <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                {(loading || flashLoading) && (
                                    <span className="inline-block w-2.5 h-2.5 border border-yellow-500 border-t-transparent rounded-full animate-spin" />
                                )}
                                {!loading && !flashLoading && updatedAgo}
                            </span>
                        </div>
                    </div>

                    {/* ── FILTER BAR ──────────────────────────────── */}
                    <FilterBar active={newsFilter} onSelect={setNewsFilter} />

                    {/* ── BODY ────────────────────────────────────── */}
                    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>

                        {/* Article detail view takes over full body (Rudaw only) */}
                        {selectedItem ? (
                            <div className="flex-1 overflow-y-auto">
                                <ArticleView item={selectedItem} onBack={handleBack} />
                            </div>
                        ) : newsFilter === 'rudaw' ? (
                            <>
                                {/* ── FLASH / BREAKING SECTION ─── */}
                                {flashNews.length > 0 && (
                                    <div className="shrink-0" style={{ maxHeight: '40%' }}>
                                        <div className="px-3 py-1.5 bg-red-950/40 border-b border-red-900/40 flex items-center gap-1.5">
                                            <span className="text-xs">🚨</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                                                Breaking Headlines
                                            </span>
                                            <span className="ml-auto text-[10px] text-red-400/60 font-medium">
                                                {flashNews.length}
                                            </span>
                                        </div>
                                        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 30px)' }}>
                                            <div className="divide-y divide-red-900/20">
                                                {flashNews.map((item) => (
                                                    <FlashListItem key={item.id} item={item} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── ARTICLES SECTION ──────────── */}
                                <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                                    {flashNews.length > 0 && rudawTabArticles.length > 0 && (
                                        <div className="px-3 py-1.5 bg-slate-800/40 border-b border-slate-700/40 flex items-center gap-1.5 sticky top-0 z-10 backdrop-blur-sm">
                                            <span className="text-xs">📰</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-500">
                                                Articles
                                            </span>
                                            <span className="ml-auto text-[10px] text-yellow-500/60 font-medium">
                                                {rudawTabArticles.length}
                                            </span>
                                        </div>
                                    )}

                                    {rudawTabArticles.length === 0 && flashNews.length === 0 && loading && (
                                        <NewsSkeleton />
                                    )}

                                    {rudawTabArticles.length === 0 && flashNews.length === 0 && !loading && (
                                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                                            <span className="text-2xl mb-2">📡</span>
                                            <p className="text-xs text-slate-500 italic">
                                                No geolocated stories in the last 24 hours
                                            </p>
                                        </div>
                                    )}

                                    {rudawTabArticles.length > 0 && (
                                        <div className="divide-y divide-slate-800/60">
                                            {rudawTabArticles.map((item) =>
                                                item._src === 'k24' ? (
                                                    <K24ListItem key={item.id} item={item} />
                                                ) : (
                                                    <NewsListItem key={item.id} item={item} onSelect={handleSelect} />
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : newsFilter === 'world' ? (
                            /* ── WORLD NEWS — breaking + articles ─── */
                            <>
                                {/* World breaking headlines */}
                                {worldBreaking.length > 0 && (
                                    <div className="shrink-0" style={{ maxHeight: '40%' }}>
                                        <div className="px-3 py-1.5 bg-red-950/40 border-b border-red-900/40 flex items-center gap-1.5">
                                            <span className="text-xs">🚨</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                                                World Breaking
                                            </span>
                                            <span className="ml-auto text-[10px] text-red-400/60 font-medium">
                                                {worldBreaking.length}
                                            </span>
                                        </div>
                                        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 30px)' }}>
                                            <div className="divide-y divide-red-900/20">
                                                {worldBreaking.map((item) => (
                                                    <WorldBreakingListItem key={item.id} item={item} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* World articles */}
                                <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                                    {worldBreaking.length > 0 && worldArticles.length > 0 && (
                                        <div className="px-3 py-1.5 bg-slate-800/40 border-b border-slate-700/40 flex items-center gap-1.5 sticky top-0 z-10 backdrop-blur-sm">
                                            <span className="text-xs">📰</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-500">
                                                World Articles
                                            </span>
                                            <span className="ml-auto text-[10px] text-yellow-500/60 font-medium">
                                                {worldArticles.length}
                                            </span>
                                        </div>
                                    )}

                                    {worldBreaking.length === 0 && worldArticles.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                                            <span className="text-2xl mb-2">🌐</span>
                                            <p className="text-xs text-slate-500 italic">
                                                {globalNews.length === 0
                                                    ? 'Loading world news…'
                                                    : 'No world stories in the last 24 hours'}
                                            </p>
                                        </div>
                                    )}

                                    {worldArticles.length > 0 && (
                                        <div className="divide-y divide-slate-800/60">
                                            {worldArticles.map((item) => (
                                                <GlobalNewsListItem key={item.id} item={item} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* ── ALL — flash + merged rudaw + world ── */
                            <>
                                {/* Flash section (Rudaw breaking, always at top) */}
                                {flashNews.length > 0 && (
                                    <div className="shrink-0" style={{ maxHeight: '30%' }}>
                                        <div className="px-3 py-1.5 bg-red-950/40 border-b border-red-900/40 flex items-center gap-1.5">
                                            <span className="text-xs">🚨</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                                                Breaking Headlines
                                            </span>
                                            <span className="ml-auto text-[10px] text-red-400/60 font-medium">
                                                {flashNews.length}
                                            </span>
                                        </div>
                                        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 30px)' }}>
                                            <div className="divide-y divide-red-900/20">
                                                {flashNews.map((item) => (
                                                    <FlashListItem key={item.id} item={item} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Merged and sorted list */}
                                <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                                    {mergedItems.length > 0 && (
                                        <div className="px-3 py-1.5 bg-slate-800/40 border-b border-slate-700/40 flex items-center gap-1.5 sticky top-0 z-10 backdrop-blur-sm">
                                            <span className="text-xs">🗺️</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-500">
                                                All Stories
                                            </span>
                                            <span className="ml-auto text-[10px] text-yellow-500/60 font-medium">
                                                {mergedItems.length}
                                            </span>
                                        </div>
                                    )}

                                    {mergedItems.length === 0 && loading && (
                                        <NewsSkeleton />
                                    )}

                                    {mergedItems.length === 0 && !loading && (
                                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                                            <span className="text-2xl mb-2">📡</span>
                                            <p className="text-xs text-slate-500 italic">
                                                No stories loaded yet
                                            </p>
                                        </div>
                                    )}

                                    <div className="divide-y divide-slate-800/60">
                                        {mergedItems.map((item) =>
                                            item._type === 'rudaw' ? (
                                                <NewsListItem
                                                    key={item.id}
                                                    item={item}
                                                    onSelect={handleSelect}
                                                />
                                            ) : item._type === 'k24' ? (
                                                <K24ListItem key={item.id} item={item} />
                                            ) : (
                                                <GlobalNewsListItem key={item.id} item={item} />
                                            )
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default React.memo(NewsPanel)
