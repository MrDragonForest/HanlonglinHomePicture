import { useCallback, useEffect, useState } from 'react'

export type ThemeName = 'warm' | 'night'

const STORAGE_KEY = 'gallery:theme'

function readInitial(): ThemeName {
  // index.html 里的内联脚本已经按 localStorage 设过 data-theme，这里保持一致
  const attr = document.documentElement.dataset.theme
  if (attr === 'warm' || attr === 'night') return attr
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'warm' || saved === 'night') return saved
  } catch {
    /* 隐私模式下 localStorage 可能不可用 */
  }
  return 'warm'
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(readInitial)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'night' ? '#14100E' : '#FBF7F1')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* 忽略 */
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'warm' ? 'night' : 'warm'))
  }, [])

  return { theme, setTheme, toggle }
}

/** 用户是否要求减少动效 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
