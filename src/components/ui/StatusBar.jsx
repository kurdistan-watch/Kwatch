import useFlightStore from '@/store/useFlightStore'
import AlertBadge from './AlertBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const StatusBar = ({ isDark, onToggleTheme }) => {
    const flightCount  = useFlightStore((s) => s.flights.length)
    const alertCount   = useFlightStore((s) => s.alerts.length)
    const tvGridOpen   = useFlightStore((s) => s.tvGridOpen)
    const toggleTVGrid = useFlightStore((s) => s.toggleTVGrid)

    return (
        <div className="bg-slate-900 dark:bg-slate-900 text-white px-4 py-1 sm:py-2 flex justify-between items-center text-sm border-b border-slate-700/50 dark:border-slate-700/50">
            <div className="flex items-center gap-4">
                <div className="flex flex-col leading-none gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-bold tracking-tight">KURDISTAN WATCH</span>
                        <Badge
                            variant="outline"
                            className="text-[9px] font-semibold px-1.5 py-0.5 bg-amber-500/15 border-amber-500/40 text-amber-400 tracking-widest uppercase rounded"
                        >
                            BETA
                        </Badge>
                    </div>
                    <span className="text-[9px] text-slate-500 tracking-widest uppercase">
                        website under construction
                    </span>
                </div>
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
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleTheme}
                    title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="h-7 w-7 rounded-full bg-slate-700/60 hover:bg-slate-600 text-base leading-none select-none"
                    aria-label="Toggle theme"
                >
                    {isDark ? '☀️' : '🌙'}
                </Button>

                {/* Live TV toggle */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTVGrid}
                    title={tvGridOpen ? 'Close Live TV' : 'Open Live TV'}
                    className={`h-7 w-7 rounded-full text-base leading-none select-none transition-colors ${
                        tvGridOpen
                            ? 'bg-yellow-500/20 border border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-slate-700/60 hover:bg-slate-600 text-slate-300'
                    }`}
                    aria-label="Toggle live TV"
                >
                    TV
                </Button>
            </div>
        </div>
    )
}

export default StatusBar
