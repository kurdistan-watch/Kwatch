const FlightCard = () => {
    return (
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
            <div className="flex justify-between items-start">
                <div>
                    <span className="text-xs font-mono text-slate-500 uppercase">Callsign</span>
                    <h3 className="text-lg font-bold">KRG101</h3>
                </div>
                <div className="text-right">
                    <span className="text-xs font-mono text-slate-500 uppercase">Squawk</span>
                    <p className="font-mono">7000</p>
                </div>
            </div>
        </div>
    )
}

export default FlightCard
