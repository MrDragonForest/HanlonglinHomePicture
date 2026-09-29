import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 手机上的「自动浏览」：像有人替你慢慢往下翻。
 *
 * 节奏严格按「先加载、再滑动」：先把下一张取进缓存，才平滑滚过去，
 * 到位停 5 秒，再处理下一张。所以永远不会滑到一张还没出来的图上。
 *
 * 难点在于网格用的是 loading="lazy"，视口外很远的图压根不会开始下载，
 * 干等它自己加载完会死锁。所以这里用 new Image() 按同样的 srcset/sizes
 * 主动预取一次（见 preloadTile），借浏览器的缓存把「已加载」变成既成事实。
 */

/** 触屏或窄屏才提供：桌面上滚轮 / 触控板本来就顺手 */
const MOBILE_QUERY = '(pointer: coarse), (max-width: 759px)'

interface Options {
  /** 每张滑到位后停留多久 */
  dwellMs: number
  /** 等平滑滚动停下的兜底上限，防卡死 */
  scrollTimeoutMs: number
  /** 用户要求减少动效时不做平滑滚动，直接跳 */
  reducedMotion: boolean
}

export interface AutoTour {
  supported: boolean
  running: boolean
  toggle: () => void
  stop: () => void
}

function isMobile(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

/**
 * 网格里所有照片格子，按页面上的先后顺序。
 * 马赛克分列之后 DOM 顺序和视觉顺序不一致（同在第 i 列的照片排在一起），
 * 所以必须按实际纵坐标重排，否则会自动浏览会在一列里来回跳。
 */
function orderedTiles(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.tile')]
    .map((el) => ({ el, top: el.getBoundingClientRect().top + window.scrollY }))
    .sort((a, b) => a.top - b.top)
    .map((x) => x.el)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

/**
 * 等平滑滚动停下来。
 * 没用 scrollend 事件 —— Safari 支持得晚，这里逐帧看 scrollY 是否连续静止，
 * 兼容性更稳。连续 8 帧（约 130ms）没动就认为停住了：平滑滚动是每帧都在动的，
 * 真静止这么久说明已经到位。
 */
function waitForScrollEnd(signal: AbortSignal, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let last = window.scrollY
    let still = 0
    let raf = 0
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
      resolve()
    }
    const timer = window.setTimeout(finish, timeoutMs)
    signal.addEventListener('abort', finish, { once: true })

    const tick = () => {
      if (settled) return
      const y = window.scrollY
      if (Math.abs(y - last) < 1) {
        still += 1
        if (still >= 8) return finish()
      } else {
        still = 0
      }
      last = y
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  })
}

/**
 * 把这一格要用的图先取进 HTTP 缓存。
 * sizes 用这一格的真实像素宽度，这样预取挑中的和格子自己会挑的是同一档，
 * 既不会多下一份，也不会白下高一档。
 */
function preloadTile(el: HTMLElement, signal: AbortSignal): Promise<void> {
  const img = el.querySelector<HTMLImageElement>('img.smart__full')
  if (!img || (img.complete && img.naturalWidth > 0)) return Promise.resolve()

  const srcSet = img.getAttribute('srcset')
  const src = img.getAttribute('src')
  if (!srcSet && !src) return Promise.resolve()

  const width = Math.round(el.getBoundingClientRect().width)
  const pre = new Image()
  if (width > 0) pre.sizes = `${width}px`
  if (srcSet) pre.srcset = srcSet
  if (src) pre.src = src

  return new Promise((resolve) => {
    const done = () => resolve()
    pre.addEventListener('load', done, { once: true })
    pre.addEventListener('error', done, { once: true })
    signal.addEventListener('abort', done, { once: true })
  })
}

/** 到位之后再确认这一格真的显示出来了（正常是从缓存瞬时命中） */
function waitForShown(el: HTMLElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let raf = 0
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      cancelAnimationFrame(raf)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })

    const check = () => {
      if (settled) return
      const img = el.querySelector<HTMLImageElement>('img.smart__full')
      if (el.dataset.loaded === 'true' || (img?.complete && img.naturalWidth > 0)) return finish()
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
  })
}

export function useAutoTour({ dwellMs, scrollTimeoutMs, reducedMotion }: Options): AutoTour {
  const [supported, setSupported] = useState(isMobile)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setSupported(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }, [])

  const start = useCallback(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)

    void (async () => {
      const tiles = orderedTiles()
      if (tiles.length === 0) return stop()

      // 从「还没完全滚过去的第一张」开始：停在半路点按钮，不会突然把你拽回顶部
      let from = tiles.findIndex(
        (el) => el.getBoundingClientRect().bottom > window.innerHeight * 0.3
      )
      if (from === -1) from = tiles.length - 1

      for (let i = from; i < tiles.length; i++) {
        if (ac.signal.aborted) return
        const el = tiles[i]

        // 1) 等这一张加载完 —— 预取不到就卡在这儿等，不会带着空白往下滚
        await preloadTile(el, ac.signal)
        if (ac.signal.aborted) return

        // 2) 再慢慢滑过去
        const rect = el.getBoundingClientRect()
        window.scrollTo({
          top: Math.max(0, rect.top + window.scrollY - (window.innerHeight - rect.height) / 2),
          behavior: reducedMotion ? 'instant' : 'smooth',
        })
        await waitForScrollEnd(ac.signal, scrollTimeoutMs)
        if (ac.signal.aborted) return

        // 3) 确认这一格已经显示（通常已经命中缓存）
        await waitForShown(el, ac.signal)
        if (ac.signal.aborted) return

        // 4) 停一会儿让人看清
        await sleep(dwellMs, ac.signal)
      }

      // 翻到底了：停住，按钮回到可再点的样子
      if (!ac.signal.aborted) {
        abortRef.current = null
        setRunning(false)
      }
    })()
  }, [dwellMs, reducedMotion, scrollTimeoutMs, stop])

  const toggle = useCallback(() => {
    if (abortRef.current) stop()
    else start()
  }, [start, stop])

  // 用户自己一动（触摸 / 滚轮 / 按键）就让位，别跟人抢滚动条
  useEffect(() => {
    if (!running) return

    const onUserInput = (event: Event) => {
      if ((event.target as Element | null)?.closest?.('.auto-tour')) return
      stop()
    }
    const events = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'] as const

    for (const type of events) window.addEventListener(type, onUserInput, { passive: true })
    return () => {
      for (const type of events) window.removeEventListener(type, onUserInput)
    }
  }, [running, stop])

  useEffect(() => () => abortRef.current?.abort(), [])

  return { supported, running, toggle, stop }
}
