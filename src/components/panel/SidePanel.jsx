import FilterBar from './FilterBar'
import FlightCard from './FlightCard'

const SidePanel = () => {
    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-bold mb-4">Live Flight Tracking</h2>
                <FilterBar />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Placeholder for flight list mapping */}
                <FlightCard />
            </div>
        </div>
    )
}

export default SidePanel
