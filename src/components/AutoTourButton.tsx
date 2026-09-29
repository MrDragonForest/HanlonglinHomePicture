interface Props {
  running: boolean
  onToggle: () => void
}

/**
 * 左下角的「自动浏览」开关。视觉沿用右下角音乐控件那套圆形浮动件，
 * 只是站另一边，两个铃铛不会挤在一起。
 */
export function AutoTourButton({ running, onToggle }: Props) {
  return (
    <button
      type="button"
      className="auto-tour"
      data-running={running}
      onClick={onToggle}
      aria-pressed={running}
      aria-label={running ? '停止自动浏览' : '自动浏览照片'}
      title={running ? '停止自动浏览' : '自动浏览照片'}
    >
      <span className="auto-tour__halo" aria-hidden="true" />
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        {running ? (
          <g fill="currentColor">
            <rect x="8" y="7" width="2.6" height="10" rx="1.3" />
            <rect x="13.4" y="7" width="2.6" height="10" rx="1.3" />
          </g>
        ) : (
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4.8v13.4" />
            <path d="M6.7 12.8 12 18.1l5.3-5.3" />
          </g>
        )}
      </svg>
    </button>
  )
}
