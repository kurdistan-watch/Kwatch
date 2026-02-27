const AlertBadge = ({ count = 0 }) => {
    if (count === 0) return null

    return (
        <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            {count}
        </span>
    )
}

export default AlertBadge
