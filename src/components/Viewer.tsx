import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { PhotoView } from '../types'
import { formatDateLong, neighbours, srcSet } from '../lib/photos'
import { site } from '../data/site.config'
import { tileRegistry } from '../lib/tileRegistry'
import { SmartImage } from './SmartImage'
import { Filmstrip } from './Filmstrip'

interface Props {
  photos: PhotoView[]
  index: number
  reducedMotion: boolean
  onIndexChange: (index: number) => void
  onClose: () => void
}

const EASE = [0.22, 1, 0.36, 1] as const

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 64, scale: 1.03 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -64, scale: 0.99 }),
}

interface FrameBox {
  w: number
  h: number
}

/**
 * 缩略图 → 全屏的位移与缩放。
 *
 * 这里没用 framer-motion 的 layoutId：查看器是 portal 渲染的，跨 portal 的
 * layoutId 既不会真的做补间，还会让退场动画一直不结束（元素永远卸载不掉）。
 * 全屏图和缩略图比例完全一致，所以纯 translate + scale 就是精确的共享元素转场。
 */
function flight(rect: DOMRect, box: FrameBox, cx: number, cy: number) {
  return {
    x: rect.left + rect.width / 2 - cx,
    y: rect.top + rect.height / 2 - cy,
    scale: rect.width / box.w,
  }
}

export function Viewer({ photos, index, reducedMotion, onIndexChange, onClose }: Props) {
  const photo = photos[index]
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const [direction, setDirection] = useState(0)
  const [chrome, setChrome] = useState(true)
  // 舞台尺寸 + 中心点（视口坐标）：全屏图的中心就是舞台的中心
  const [stage, setStage] = useState({ w: 0, h: 0, cx: 0, cy: 0 })
  const [closing, setClosing] = useState(false)

  // 打开时缩略图的位置，只在挂载那一次量取
  const [entry] = useState<DOMRect | null>(() => (photo ? tileRegistry.rect(photo.id) : null))
  // 关闭时缩略图的位置
  const [leaving, setLeaving] = useState<DOMRect | null>(null)

  const measureStage = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setStage({ w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 })
  }, [])

  /* --- 量舞台。用 ref 回调而不是 effect：要在首次绘制前就拿到，
         否则转场会从一个尺寸不对的位置出发，第一帧会跳一下。 --- */
  const attachStage = useCallback(
    (el: HTMLDivElement | null) => {
      stageRef.current = el
      if (el) measureStage(el)
    },
    [measureStage]
  )

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measureStage(el))
    ro.observe(el)
    return () => ro.disconnect()
  }, [measureStage])

  /** 照片在舞台里的最终显示尺寸，严格保持比例 —— 共享元素转场靠它才不会变形 */
  const box = useMemo(() => {
    if (!photo || stage.w === 0 || stage.h === 0) return null
    const pad = stage.w < 760 ? 10 : 48
    const maxW = Math.max(40, stage.w - pad * 2)
    const maxH = Math.max(40, stage.h - pad * 2)
    const scale = Math.min(maxW / photo.width, maxH / photo.height)
    return { w: Math.round(photo.width * scale), h: Math.round(photo.height * scale) }
  }, [photo, stage])

  const go = useCallback(
    (delta: number) => {
      if (closing) return
      const next = index + delta
      if (next < 0 || next >= photos.length) return
      setDirection(delta)
      onIndexChange(next)
    },
    [closing, index, photos.length, onIndexChange]
  )

  const close = useCallback(() => {
    if (closing) return
    if (reducedMotion || !photo) {
      onClose()
      return
    }
    // 缩略图不在视野里就先滚回来，否则照片会「飞」到屏幕外
    tileRegistry.ensureVisible(photo.id)
    setLeaving(tileRegistry.rect(photo.id))
    setClosing(true)
  }, [closing, photo, onClose, reducedMotion])

  /* 关闭动画放完就卸载。
     这里用定时器而不是 motion 的 onAnimationComplete：翻过页之后那回调不再可靠地
     触发，closing 会一直卡在 true，查看器就再也关不掉了。 */
  const closeMs = reducedMotion ? 180 : 560
  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(onClose, closeMs)
    return () => window.clearTimeout(timer)
  }, [closing, closeMs, onClose])

  const boxFrom = useCallback(
    (rect: DOMRect | null) => (rect && box ? flight(rect, box, stage.cx, stage.cy) : null),
    [box, stage.cx, stage.cy]
  )

  /* --- 键盘 --- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          close()
          break
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          go(1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault()
          go(-1)
          break
        case 'Home':
          e.preventDefault()
          setDirection(-1)
          onIndexChange(0)
          break
        case 'End':
          e.preventDefault()
          setDirection(1)
          onIndexChange(photos.length - 1)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, go, onIndexChange, photos.length])

  /* --- 滚轮：横向优先，纵向兜底；加冷却避免一次滑动翻好几张 --- */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let acc = 0
    let lockedUntil = 0

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = performance.now()
      if (now < lockedUntil) return

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      acc += delta
      if (Math.abs(acc) < 40) return

      go(acc > 0 ? 1 : -1)
      acc = 0
      lockedUntil = now + 460
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [go])

  /* --- 触摸：横向滑动翻页，向下拖动关闭 --- */
  const gesture = useRef({ x: 0, y: 0, active: false, moved: false })

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    gesture.current = { x: e.clientX, y: e.clientY, active: true, moved: false }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!gesture.current.active) return
    const dx = e.clientX - gesture.current.x
    const dy = e.clientY - gesture.current.y
    gesture.current.active = false
    gesture.current.moved = Math.abs(dx) > 10 || Math.abs(dy) > 10

    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1)
    } else if (dy > 110 && dy > Math.abs(dx)) {
      close()
    }
  }

  /** 点照片旁边的空白处关闭 —— 舞台中间那一行盖住了蒙层，所以得在这里兜住 */
  const onStageClick = (e: React.MouseEvent) => {
    const moved = gesture.current.moved
    gesture.current.moved = false
    if (moved) return
    if (e.target !== e.currentTarget) return
    close()
  }

  /* --- 预加载前后几张，翻页不用等 --- */
  useEffect(() => {
    for (const p of neighbours(index, 2)) {
      // 预热的是「网格给这张图挑中的那一档」，不是最大一档：
      // 查看器外框宽度和网格格子宽度几乎相同，会挑到同一档，
      // 所以预热它才是真的预热了查看器要的那张图（预热最大档会白下一份）。
      const thumb = tileRegistry
        .get(p.id)
        ?.querySelector<HTMLImageElement>('img.smart__full')
      const url = thumb?.currentSrc
      // currentSrc 为空说明这张图还没开始加载（在屏幕外被 lazy 挡着），
      // 那就不预热，等它自己进视口
      if (!url || thumb.complete) continue
      const pre = new Image()
      pre.src = url
    }
  }, [index])

  if (!photo) return null

  const exifLine = [
    photo.exif.focal,
    photo.exif.aperture,
    photo.exif.shutter,
    photo.exif.iso,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const chromeMotion = {
    animate: { opacity: chrome && !closing ? 1 : 0, y: chrome && !closing ? 0 : 14 },
    transition: { duration: 0.42, ease: EASE },
  }

  const enterTo = boxFrom(entry)
  const leaveTo = boxFrom(leaving)
  const frameIdle = { x: 0, y: 0, scale: 1, opacity: 1 }

  return createPortal(
    <motion.div
      ref={rootRef}
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label="照片查看器"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reducedMotion ? 0.15 : 0.34, ease: EASE }}
    >
      <motion.div
        className="viewer__scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: closing ? closeMs / 1000 : 0.44, ease: EASE }}
        onClick={close}
      />

      {/* --- 顶栏 --- */}
      <motion.header className="viewer__bar" {...chromeMotion}>
        <span className="viewer__counter display">
          {String(index + 1).padStart(2, '0')}
          <span className="viewer__counter-total">
            {' '}
            / {String(photos.length).padStart(2, '0')}
          </span>
        </span>

        <div className="viewer__bar-right">
          <button
            type="button"
            className="viewer__toggle"
            onClick={() => setChrome((v) => !v)}
            aria-label={chrome ? '隐藏文字与胶片条' : '显示文字与胶片条'}
            aria-pressed={!chrome}
          >
            {chrome ? '沉浸' : '信息'}
          </button>

          <button type="button" className="viewer__close" onClick={close} aria-label="关闭（Esc）">
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span className="viewer__close-text">关闭</span>
          </button>
        </div>
      </motion.header>

      {/* --- 舞台 --- */}
      <div
        ref={attachStage}
        className="viewer__stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onStageClick}
      >
        <button
          type="button"
          className="viewer__nav viewer__nav--prev"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="上一张"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>

        <AnimatePresence initial={false} custom={direction} mode="sync">
          {/* 等舞台量好、尺寸确定后再挂载，转场才有正确的终点 */}
          {box && (
            <motion.div
              className="viewer__frame"
              style={{ width: box.w, height: box.h }}
              initial={
                enterTo
                  ? { ...enterTo, opacity: 0.75 }
                  : { opacity: 0, scale: 0.96 }
              }
              animate={closing ? (leaveTo ?? { opacity: 0, scale: 0.96 }) : frameIdle}
              transition={{
                duration: closing ? closeMs / 1000 : reducedMotion ? 0.18 : 0.62,
                ease: EASE,
              }}
            >
              <AnimatePresence initial={false} custom={direction} mode="sync">
                <motion.div
                  key={photo.id}
                  className="viewer__slide"
                  custom={direction}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: reducedMotion ? 0.18 : 0.46, ease: EASE }}
                >
                  <SmartImage
                    photo={photo}
                    src={photo.src}
                    srcSet={srcSet(photo)}
                    // 用实测的外框宽度当 sizes（而不是 vw）：
                    // 外框宽度和网格格子宽度几乎相同，这样浏览器会挑到和网格
                    // 已经下载过的那一档，点开详情不用再等一次网络。
                    sizes={box ? `${Math.round(box.w)}px` : undefined}
                    alt={photo.title || photo.caption || `拍摄于 ${photo.date} 的照片`}
                    priority
                  />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          className="viewer__nav viewer__nav--next"
          onClick={() => go(1)}
          disabled={index === photos.length - 1}
          aria-label="下一张"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M9 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      {/* --- 底部：文字说明 + 胶片条 --- */}
      <motion.footer className="viewer__foot" {...chromeMotion}>
        <div className="viewer__info">
          {(photo.title || photo.caption || photo.location) && (
            <>
              {photo.title && <h3 className="viewer__title display">{photo.title}</h3>}
              {photo.caption && <p className="viewer__caption">{photo.caption}</p>}
            </>
          )}
          <p className="viewer__facts">
            <span>{formatDateLong(photo.date)}</span>
            {photo.location && (
              <>
                <span className="viewer__facts-dot" aria-hidden="true" />
                <span>{photo.location}</span>
              </>
            )}
            {site.showExif && exifLine && (
              <>
                <span className="viewer__facts-dot" aria-hidden="true" />
                <span>{exifLine}</span>
              </>
            )}
          </p>
        </div>

        {site.filmstrip && photos.length > 1 && (
          <Filmstrip
            photos={photos}
            index={index}
            onSelect={(i) => {
              setDirection(i > index ? 1 : -1)
              onIndexChange(i)
            }}
          />
        )}
      </motion.footer>
    </motion.div>,
    document.body
  )
}
