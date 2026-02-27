import MapContainer from '@/components/map/MapContainer'
import SidePanel from '@/components/panel/SidePanel'
import StatusBar from '@/components/ui/StatusBar'
import { useFlightPoll } from '@/hooks/useFlightPoll'

// Mount polling at the top level so it never stops regardless of panel state
const PollingRoot = () => {
    useFlightPoll()
    return null
}

function App() {
    return (
        <div className="flex flex-col bg-[#0a0e1a] text-slate-100" style={{ height: '100dvh', overflow: 'hidden' }}>
            <PollingRoot />

            {/* Status bar — fixed height */}
            <header className="shrink-0 z-20">
                <StatusBar />
            </header>

            {/* Map area fills all remaining space */}
            <main className="flex-1 relative" style={{ minHeight: 0 }}>
                <MapContainer />
                <SidePanel />
            </main>
        </div>
    )
}

export default App
