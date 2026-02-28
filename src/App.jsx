import MapContainer from '@/components/map/MapContainer'
import SidePanel from '@/components/panel/SidePanel'
import StatusBar from '@/components/ui/StatusBar'
import { useFlightPoll } from '@/hooks/useFlightPoll'
import { useTheme } from '@/hooks/useTheme'

// Mount polling at the top level so it never stops regardless of panel state
const PollingRoot = () => {
    useFlightPoll()
    return null
}

function App() {
    const { isDark, toggle } = useTheme()

    return (
        <div
            className="flex flex-col text-slate-100 dark:text-slate-100 bg-slate-100 dark:bg-[#0a0e1a]"
            style={{ height: '100dvh', overflow: 'hidden' }}
        >
            <PollingRoot />

            {/* Status bar — fixed height */}
            <header className="shrink-0 z-20">
                <StatusBar isDark={isDark} onToggleTheme={toggle} />
            </header>

            {/* Map area fills all remaining space */}
            <main className="flex-1 relative" style={{ minHeight: 0 }}>
                <MapContainer isDark={isDark} />
                <SidePanel />
            </main>
        </div>
    )
}

export default App
