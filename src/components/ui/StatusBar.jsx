import useFlightStore from '@/store/useFlightStore'
import AlertBadge from './AlertBadge'

const StatusBar = () => {
    const flightCount = useFlightStore((s) => s.flights.length)
    const alertCount  = useFlightStore((s) => s.alerts.length)

    return (
        <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center text-sm">
            <div className="flex items-center gap-4">
                <span className="font-bold tracking-tight">KURDISTAN AIR WATCH</span>
                <AlertBadge count={alertCount} />
            </div>
            <div className="flex gap-4 items-center">
                {flightCount > 0 && (
                    <span className="text-slate-300 text-xs">
                        {flightCount} aircraft tracked
                    </span>
                )}
                <span className="text-slate-400">System Live</span>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            </div>
        </div>
    )
}

export default StatusBar
