import type { ThemeName } from '../hooks/useTheme'

interface Props {
  theme: ThemeName
  onToggle: () => void
}

/** 右上角的主题切换：胶片暖阳 / 夜色烛光 */
export function ThemeSwitch({ theme, onToggle }: Props) {
  const night = theme === 'night'

  return (
    <button
      type="button"
      className="theme-switch"
      onClick={onToggle}
      aria-label={night ? '切换到胶片暖阳' : '切换到夜色烛光'}
      title={night ? '切换到胶片暖阳' : '切换到夜色烛光'}
    >
      <span className="theme-switch__track" aria-hidden="true">
        <span className="theme-switch__thumb" data-night={night} />
      </span>

      <span className="theme-switch__glyphs" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" className="theme-switch__sun">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2" />
            <path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
          </g>
        </svg>
        <svg viewBox="0 0 24 24" width="14" height="14" className="theme-switch__moon">
          <path
            d="M20 14.4A8.4 8.4 0 019.6 4a8.6 8.6 0 102.9 16.7A8.4 8.4 0 0020 14.4z"
            fill="currentColor"
          />
        </svg>
      </span>
    </button>
  )
}
