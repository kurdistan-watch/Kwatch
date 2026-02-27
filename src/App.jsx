import MapContainer from '@/components/map/MapContainer'
import SidePanel from '@/components/panel/SidePanel'
import StatusBar from '@/components/ui/StatusBar'

function App() {
    return (
        <div className="relative h-screen w-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            <header className="z-20 shadow-md">
                <StatusBar />
            </header>

            <main className="flex-1 flex overflow-hidden">
                <div className="flex-1 relative">
                    <MapContainer />
                </div>
                <aside className="w-96 shadow-xl z-10 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                    <SidePanel />
                </aside>
            </main>
        </div>
    )
}

export default App
