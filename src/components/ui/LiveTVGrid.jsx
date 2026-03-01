import { useState, useCallback, useEffect, useRef } from 'react'
import useFlightStore from '@/store/useFlightStore'

// ── Channel definitions ──────────────────────────────────────────────────────
//
// youtubeId: the video/live-stream ID from the channel's YouTube live URL.
// e.g. youtube.com/watch?v=XXXXXXXXXXX  →  youtubeId: 'XXXXXXXXXXX'
//
// To update a channel ID:
//   1. Open the channel's YouTube live stream page
//   2. Copy the `v=` parameter from the URL
//   3. Paste it as the youtubeId below

const CHANNELS = [
    {
        id: 'rudaw',
        name: 'Rudaw TV',
        youtubeId: 'dp1lS8UxfsU',   // Rudaw live
        accentColor: '#f5c518',
    },
    {
        id: 'k24',
        name: 'Kurdistan 24',
        youtubeId: 'hF6gSvhUZzA',   // Kurdistan 24 live
        accentColor: '#22d3ee',
    },
    {
        id: 'ava',
        name: 'AVA TV',
        youtubeId: 'NgWb1bQdDgg',   // AVA TV live
        accentColor: '#a78bfa',
    },
    {
        id: 'ch8',
        name: 'Channel 8',
        youtubeId: 'B6i1uciOoEQ',   // Channel 8 Kurdish live
        accentColor: '#34d399',
    },
]

// ── Helper: build YouTube embed URL ─────────────────────────────────────────

const embedUrl = (youtubeId) =>
    `https://www.youtube.com/embed/${youtubeId}` +
    `?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`

// ── Single channel tile ──────────────────────────────────────────────────────

const ChannelTile = ({ channel, isActive, onActivate }) => {
    const [muted, setMuted] = useState(true)
    const iframeRef = useRef(null)

    const postMuteCommand = useCallback((shouldMute) => {
        iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({
                event: 'command',
                func: shouldMute ? 'mute' : 'unMute',
                args: [],
            }),
            '*'
        )
    }, [])

    // When another tile becomes active audio source, re-mute this one
    useEffect(() => {
        if (!isActive && !muted) {
            setMuted(true)
            postMuteCommand(true)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive])

    const handleMuteToggle = useCallback(
        (e) => {
            e.stopPropagation()
            if (muted) {
                // Unmuting — tell parent so sibling tiles mute themselves
                onActivate(channel.id)
                setMuted(false)
                postMuteCommand(false)
            } else {
                setMuted(true)
                postMuteCommand(true)
                onActivate(null)
            }
        },
        [muted, channel.id, onActivate, postMuteCommand]
    )

    return (
        <div className="relative flex flex-col bg-black overflow-hidden" style={{ borderTop: `2px solid ${channel.accentColor}22` }}>
            {/* iframe — mounted once, never remounted */}
            <iframe
                ref={iframeRef}
                src={embedUrl(channel.youtubeId)}
                title={channel.name}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                className="flex-1 w-full border-0"
                style={{ minHeight: 0 }}
                loading="lazy"
            />

            {/* Overlay bar */}
            <div
                className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-0.5"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
            >
                <span
                    className="text-[10px] font-bold tracking-wider truncate"
                    style={{ color: channel.accentColor }}
                >
                    {channel.emoji} {channel.name}
                </span>
                <button
                    onClick={handleMuteToggle}
                    title={muted ? `Unmute ${channel.name}` : `Mute ${channel.name}`}
                    className="text-[13px] leading-none ml-1 shrink-0 hover:scale-110 transition-transform select-none"
                    aria-label={muted ? 'Unmute' : 'Mute'}
                >
                    {muted ? '🔇' : '🔊'}
                </button>
            </div>
        </div>
    )
}

// ── LiveTVGrid ───────────────────────────────────────────────────────────────

const LiveTVGrid = () => {
    const tvGridOpen   = useFlightStore((s) => s.tvGridOpen)
    const toggleTVGrid = useFlightStore((s) => s.toggleTVGrid)

    // Track which channel (if any) has live audio so siblings can mute
    const [activeAudioId, setActiveAudioId] = useState(null)

    // Minimised = header only, no tiles visible
    const [minimised, setMinimised] = useState(false)

    // Maximised = 2× size
    const [maximised, setMaximised] = useState(false)

    // Reset sizing state when panel is closed
    useEffect(() => {
        if (!tvGridOpen) {
            setMinimised(false)
            setMaximised(false)
            setActiveAudioId(null)
        }
    }, [tvGridOpen])

    // Minimise and maximise are mutually exclusive
    const handleMinimise = () => {
        setMinimised((m) => !m)
        setMaximised(false)
    }

    const handleMaximise = () => {
        setMaximised((m) => !m)
        setMinimised(false)
    }

    const handleActivate = useCallback((id) => {
        setActiveAudioId(id)
    }, [])

    // ── Floating toggle button (always visible) ──────────────────────────────
    return (
        <>
            {/* ── Floating toggle pill ────────────────────────── */}
            {!tvGridOpen && (
                <button
                    onClick={toggleTVGrid}
                    title="Open Live TV"
                    className="absolute bottom-4 right-4 z-[1050]
                               flex items-center gap-1.5 px-3 py-1.5
                               bg-slate-900/95 border border-slate-700/60
                               hover:border-yellow-500/60 hover:text-yellow-400
                               rounded-full text-slate-400 text-[11px] font-bold
                               tracking-wider uppercase shadow-lg
                               backdrop-blur-sm transition-all duration-200
                               select-none"
                >
                    <span className="text-sm"></span>
                    Live TV
                </button>
            )}

            {/* ── Grid panel ──────────────────────────────────── */}
            {tvGridOpen && (
                <div
                    className="absolute bottom-4 right-4 z-[1050]
                               flex flex-col
                               bg-slate-900/97 border border-slate-700/60
                               rounded-lg overflow-hidden shadow-2xl
                               backdrop-blur-sm transition-all duration-300"
                    style={{
                        width: maximised
                            ? 'clamp(700px, 80vw, 1200px)'
                            : 'clamp(400px, 44vw, 680px)',
                        height: minimised
                            ? 'auto'
                            : maximised
                                ? 'clamp(500px, 64vh, 960px)'
                                : 'clamp(280px, 34vh, 520px)',
                    }}
                >
                    {/* ── Header ──────────────────────────────── */}
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/80 border-b border-slate-700/60 shrink-0">
                       
                        <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-yellow-500 select-none">
                            Live TV
                        </span>

                        {/* Live pulse */}
                        <span className="flex items-center gap-1 ml-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[9px] text-red-400 font-bold tracking-wider">LIVE</span>
                        </span>

                        {/* Mute-all hint when a channel is active */}
                        {activeAudioId && (
                            <span className="ml-1 text-[9px] text-slate-500 italic">
                                🔊 {CHANNELS.find((c) => c.id === activeAudioId)?.name}
                            </span>
                        )}

                        <div className="ml-auto flex items-center gap-1">
                            {/* Minimise toggle */}
                            <button
                                onClick={handleMinimise}
                                title={minimised ? 'Expand' : 'Minimise'}
                                className="w-5 h-5 flex items-center justify-center rounded
                                           text-slate-500 hover:text-slate-300
                                           hover:bg-slate-700/60 transition-colors text-xs"
                            >
                                {minimised ? '▲' : '▼'}
                            </button>
                            {/* Maximise toggle */}
                            <button
                                onClick={handleMaximise}
                                title={maximised ? 'Restore size' : 'Maximise'}
                                className="w-5 h-5 flex items-center justify-center rounded
                                           text-slate-500 hover:text-yellow-400
                                           hover:bg-slate-700/60 transition-colors text-xs"
                            >
                                {maximised ? '⊡' : '⊞'}
                            </button>
                            {/* Close */}
                            <button
                                onClick={toggleTVGrid}
                                title="Close Live TV"
                                className="w-5 h-5 flex items-center justify-center rounded
                                           text-slate-500 hover:text-red-400
                                           hover:bg-slate-700/60 transition-colors text-xs"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* ── 2 × 2 tile grid ─────────────────────── */}
                    {!minimised && (
                        <div
                            className="flex-1 grid grid-cols-2"
                            style={{ minHeight: 0, gridTemplateRows: '1fr 1fr' }}
                        >
                            {CHANNELS.map((ch) => (
                                <ChannelTile
                                    key={ch.id}
                                    channel={ch}
                                    isActive={activeAudioId === ch.id}
                                    onActivate={handleActivate}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

export default LiveTVGrid
