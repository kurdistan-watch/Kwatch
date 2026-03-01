import { Component } from 'react'

/**
 * ErrorBoundary — catches render errors in any child subtree and shows a
 * graceful fallback instead of crashing the whole app.
 *
 * Usage:
 *   <ErrorBoundary label="Map">
 *     <MapContainer />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, info) {
        console.error(`[ErrorBoundary:${this.props.label ?? 'unknown'}]`, error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center w-full h-full
                                bg-slate-900/80 text-slate-400 gap-3 p-6">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-sm font-medium text-slate-300">
                        {this.props.label ?? 'Component'} failed to load
                    </p>
                    <p className="text-xs text-slate-500 text-center max-w-xs">
                        {this.state.error?.message ?? 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="mt-2 px-3 py-1.5 text-xs rounded border border-slate-600
                                   hover:border-yellow-500 hover:text-yellow-400 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
