import { useState, useEffect } from 'react'

/**
 * Manages light/dark mode.
 * - Reads initial preference from localStorage, falling back to the OS setting.
 * - Toggles the `dark` class on <html> (required for Tailwind darkMode: 'class').
 * - Persists the choice to localStorage as 'kwatch-theme'.
 *
 * @returns {{ isDark: boolean, toggle: () => void }}
 */
export const useTheme = () => {
    const [isDark, setIsDark] = useState(() => {
        const saved = localStorage.getItem('kwatch-theme')
        if (saved) return saved === 'dark'
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    })

    useEffect(() => {
        const root = document.documentElement
        if (isDark) {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        localStorage.setItem('kwatch-theme', isDark ? 'dark' : 'light')
    }, [isDark])

    const toggle = () => setIsDark((prev) => !prev)

    return { isDark, toggle }
}
