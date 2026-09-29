import { useCallback, useEffect, useRef, useState } from 'react'
import { site } from '../data/site.config'
import { hasMusic, tracks } from '../lib/music'

const VOLUME_KEY = 'gallery:music:volume'
const ENABLED_KEY = 'gallery:music'

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw !== null) {
      const n = Number(raw)
      if (Number.isFinite(n)) return Math.min(1, Math.max(0, n))
    }
  } catch {
    /* 忽略 */
  }
  return site.music.volume
}

function readEnabled(): boolean {
  if (!site.music.remember) return false
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off'
  } catch {
    return true
  }
}

export function MusicPlayer() {
  if (!hasMusic) return null
  return <MusicPlayerInner />
}

function MusicPlayerInner() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const fadeRef = useRef<number | null>(null)
  const tokenRef = useRef(0)

  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [volume, setVolume] = useState(readVolume)

  const track = tracks[trackIndex]

  /** 用 requestAnimationFrame 手动做音量渐变，避免音量突变 */
  const fadeTo = useCallback((target: number, ms: number) => {
    const audio = audioRef.current
    if (!audio) return
    if (fadeRef.current !== null) cancelAnimationFrame(fadeRef.current)

    const from = audio.volume
    const start = performance.now()

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(1, ms))
      audio.volume = Math.min(1, Math.max(0, from + (target - from) * t))
      if (t < 1) fadeRef.current = requestAnimationFrame(step)
      else fadeRef.current = null
    }
    fadeRef.current = requestAnimationFrame(step)
  }, [])

  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return false
    audio.volume = 0
    try {
      await audio.play()
      setPlaying(true)
      setBlocked(false)
      fadeTo(volume, site.music.fadeInMs)
      return true
    } catch {
      // 浏览器拦截了自动播放：等用户第一次交互再重试
      setPlaying(false)
      setBlocked(true)
      return false
    }
  }, [fadeTo, volume])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const token = ++tokenRef.current
    fadeTo(0, site.music.fadeOutMs)
    window.setTimeout(() => {
      // 淡出期间用户又点了播放，就别暂停了
      if (tokenRef.current === token) audio.pause()
    }, site.music.fadeOutMs)
    setPlaying(false)
  }, [fadeTo])

  /* --- 首屏尝试自动播放；被拦截则挂一次性解锁监听 --- */
  useEffect(() => {
    if (!site.music.autoplay || !readEnabled()) return
    void play()
    // 只在挂载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!blocked) return

    const unlock = (e: Event) => {
      // 点在播放器自己身上时交给它自己的 onClick 处理，避免「开了又关」
      const target = e.target
      if (target instanceof Element && target.closest('.music')) return
      void play()
    }

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    for (const name of events) window.addEventListener(name, unlock)
    return () => {
      for (const name of events) window.removeEventListener(name, unlock)
    }
  }, [blocked, play])

  // 音量变化时同步到正在播放的音频
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (fadeRef.current !== null) return
    audio.volume = playing ? volume : 0
  }, [volume, playing])

  const toggle = () => {
    if (playing) {
      pause()
      remember('off')
    } else {
      void play()
      remember('on')
    }
  }

  const remember = (value: 'on' | 'off') => {
    if (!site.music.remember) return
    try {
      localStorage.setItem(ENABLED_KEY, value)
    } catch {
      /* 忽略 */
    }
  }

  const changeVolume = (next: number) => {
    setVolume(next)
    try {
      localStorage.setItem(VOLUME_KEY, String(next))
    } catch {
      /* 忽略 */
    }
  }

  const nextTrack = () => {
    setTrackIndex((i) => (i + 1) % tracks.length)
  }

  return (
    <div className="music" data-playing={playing}>
      <audio
        ref={audioRef}
        src={track?.url}
        loop={tracks.length === 1}
        preload="auto"
        onEnded={() => {
          if (tracks.length > 1) nextTrack()
        }}
      />

      <div className="music__panel">
        <span className="music__name" title={track?.name}>
          {track?.name}
        </span>

        <label className="music__volume">
          <span className="sr-only">音量</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => changeVolume(Number(e.target.value) / 100)}
            aria-label="音量"
          />
        </label>

        {tracks.length > 1 && (
          <button type="button" className="music__skip" onClick={nextTrack} aria-label="下一首">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d="M6 6l7 6-7 6V6zm8 0l7 6-7 6V6z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
        )}
      </div>

      <button
        type="button"
        className="music__button"
        onClick={toggle}
        aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}
        aria-pressed={playing}
        title={playing ? '暂停背景音乐' : '播放背景音乐'}
      >
        <span className="music__halo" aria-hidden="true" />
        <span className="music__icon" aria-hidden="true">
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M9.5 8.5v7" />
                <path d="M14.5 8.5v7" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M9 17.5V6.8l9-1.8v10.7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="6.9" cy="17.6" r="2.3" fill="currentColor" />
              <circle cx="15.9" cy="15.8" r="2.3" fill="currentColor" />
            </svg>
          )}
        </span>
      </button>
    </div>
  )
}
