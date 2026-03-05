import { lazy, Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import SidePanel from '@/components/panel/SidePanel'
import AlertBadge from '@/components/ui/AlertBadge'
import StatusBar from '@/components/ui/StatusBar'
import LiveTVGrid from '@/components/ui/LiveTVGrid'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'
import { useFlightPoll } from '@/hooks/useFlightPoll'
import { useNewsPoll } from '@/hooks/useNewsPoll'
import { useFlashPoll } from '@/hooks/useFlashPoll'
import { useGlobalNews } from '@/hooks/useGlobalNews'
import { useKurdistan24Poll } from '@/hooks/useKurdistan24Poll'
import { useTheme } from '@/hooks/useTheme'

// Heavy components are lazily loaded — deferred until after first paint so the
// StatusBar and shell chrome appear immediately.
const MapContainer = lazy(() => import('@/components/map/MapContainer'))
const NewsPanel    = lazy(() => import('@/components/panel/NewsPanel'))

// ── Skeleton fallbacks shown while lazy chunks are downloading ────────────────

const MapSkeleton = () => (
    <div className="flex-1 flex items-center justify-center bg-slate-900 animate-pulse">
        <span className="text-slate-600 text-sm">Loading map…</span>
    </div>
)

const NewsPanelSkeleton = () => (
    <div className="w-[280px] shrink-0 bg-[#0d1117] border-r border-slate-800 flex flex-col gap-3 p-3 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded bg-slate-800/60" />
        ))}
    </div>
)

// Mount flight polling at the top level so it never stops
const FlightPollingRoot = () => {
    useFlightPoll()
    return null
}

function App() {
    const { isDark, toggle } = useTheme()
    const { loading: newsLoading, lastUpdated: newsLastUpdated } = useNewsPoll()
    const { loading: flashLoading } = useFlashPoll()
    useGlobalNews()
    useKurdistan24Poll()

    return (
        <div
            className="flex flex-col text-slate-100 dark:text-slate-100 bg-slate-100 dark:bg-[#0a0e1a]"
            style={{ height: '100dvh', overflow: 'hidden' }}
        >
            <FlightPollingRoot />

            {/* Status bar — fixed height */}
            <header className="shrink-0 z-20">
                <StatusBar isDark={isDark} onToggleTheme={toggle} />
            </header>

            {/* Three-column layout: NewsPanel | Map | SidePanel */}
            <main className="flex-1 flex relative" style={{ minHeight: 0 }}>
                {/* Left — News panel (280px, collapses on small screens) */}
                <ErrorBoundary label="News Panel">
                    <Suspense fallback={<NewsPanelSkeleton />}>
                        <NewsPanel loading={newsLoading} lastUpdated={newsLastUpdated} flashLoading={flashLoading} />
                    </Suspense>
                </ErrorBoundary>

                {/* Center — Map fills remaining space */}
                <div className="flex-1 relative" style={{ minWidth: 0 }}>
                    <ErrorBoundary label="Map">
                        <Suspense fallback={<MapSkeleton />}>
                            <MapContainer isDark={isDark} />
                        </Suspense>
                    </ErrorBoundary>
                    <SidePanel />
                    <AlertBadge />
                    <LiveTVGrid />
                </div>
            </main>
            <Toaster />
            <Analytics />
        </div>
    )
}

export default App
