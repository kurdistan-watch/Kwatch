import MapContainer from '@/components/map/MapContainer'
import SidePanel from '@/components/panel/SidePanel'
import NewsPanel from '@/components/panel/NewsPanel'
import AlertBadge from '@/components/ui/AlertBadge'
import StatusBar from '@/components/ui/StatusBar'
import { useFlightPoll } from '@/hooks/useFlightPoll'
import { useNewsPoll } from '@/hooks/useNewsPoll'
import { useFlashPoll } from '@/hooks/useFlashPoll'
import { useTheme } from '@/hooks/useTheme'

// Mount flight polling at the top level so it never stops
const FlightPollingRoot = () => {
    useFlightPoll()
    return null
}

function App() {
    const { isDark, toggle } = useTheme()
    const { loading: newsLoading, lastUpdated: newsLastUpdated } = useNewsPoll()
    const { loading: flashLoading } = useFlashPoll()

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
                <NewsPanel loading={newsLoading} lastUpdated={newsLastUpdated} flashLoading={flashLoading} />

                {/* Center — Map fills remaining space */}
                <div className="flex-1 relative" style={{ minWidth: 0 }}>
                    <MapContainer isDark={isDark} />
                    <SidePanel />
                    <AlertBadge />
                </div>
            </main>
        </div>
    )
}

export default App
