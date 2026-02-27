const FilterBar = () => {
    return (
        <div className="flex gap-2">
            <input
                type="text"
                placeholder="Search callsign..."
                className="flex-1 px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
        </div>
    )
}

export default FilterBar
