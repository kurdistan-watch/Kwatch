import AlertBadge from './AlertBadge'

const StatusBar = () => {
    return (
        <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center text-sm">
            <div className="flex items-center gap-4">
                <span className="font-bold tracking-tight">KURDISTAN AIR WATCH</span>
                <AlertBadge count={0} />
            </div>
            <div className="flex gap-4 items-center">
                <span className="text-slate-400">System Live</span>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            </div>
        </div>
    )
}

export default StatusBar
