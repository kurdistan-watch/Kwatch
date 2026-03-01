import useFlightStore from '@/store/useFlightStore'
import AlertBadge from './AlertBadge'

const StatusBar = ({ isDark, onToggleTheme }) => {
    const flightCount  = useFlightStore((s) => s.flights.length)
    const alertCount   = useFlightStore((s) => s.alerts.length)
    const tvGridOpen   = useFlightStore((s) => s.tvGridOpen)
    const toggleTVGrid = useFlightStore((s) => s.toggleTVGrid)

    return (
        <div className="bg-slate-900 dark:bg-slate-900 text-white px-4 py-2 flex justify-between items-center text-sm border-b border-slate-700/50 dark:border-slate-700/50">
            <div className="flex items-center gap-4">
                <span className="font-bold tracking-tight">KURDISTAN WATCH</span>
                <AlertBadge count={alertCount} />
            </div>
            <div className="flex gap-4 items-center">
                {flightCount > 0 && (
                    <span className="text-slate-300 text-xs">
                        {flightCount} aircraft tracked
                    </span>
                )}
                <span className="text-slate-400">System Live</span>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />

                {/* Light / dark toggle */}
                <button
                    onClick={onToggleTheme}
                    title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 transition-colors text-base leading-none select-none"
                    aria-label="Toggle theme"
                >
                    {isDark ? '☀️' : '🌙'}
                </button>

                {/* Live TV toggle */}
                <button
                    onClick={toggleTVGrid}
                    title={tvGridOpen ? 'Close Live TV' : 'Open Live TV'}
                    className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors text-base leading-none select-none ${
                        tvGridOpen
                            ? 'bg-yellow-500/20 border border-yellow-500/60 text-yellow-400'
                            : 'bg-slate-700/60 hover:bg-slate-600 text-slate-300'
                    }`}
                    aria-label="Toggle live TV"
                >
                    TV
                </button>
            </div>
        </div>
    )
}

export default StatusBar
