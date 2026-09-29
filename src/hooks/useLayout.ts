import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PhotoView } from '../types'

/**
 * 把一段照片切成「马赛克区」和「通栏区」两种块。
 * 连续的非长图合成一个马赛克区；每张长图（全景）单独占一整行，因为它横过来才好看。
 */
export type LayoutBlock =
  | { kind: 'masonry'; key: string; photos: PhotoView[] }
  | { kind: 'full'; key: string; photo: PhotoView }

export function buildLayout(photos: PhotoView[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = []
  let run: PhotoView[] = []

  const flush = () => {
    if (run.length > 0) {
      blocks.push({ kind: 'masonry', key: `m-${run[0].id}`, photos: run })
      run = []
    }
  }

  for (const p of photos) {
    if (p.orientation === 'panorama') {
      flush()
      blocks.push({ kind: 'full', key: `f-${p.id}`, photo: p })
    } else {
      run.push(p)
    }
  }
  flush()

  return blocks
}

/** 观察容器宽度，决定一行放几张。用容器宽度而不是视口宽度，侧边栏之类的改动也能正确响应。 */
export function useColumnCount(
  minColumnWidth: number,
  max = 4
): [React.RefObject<HTMLElement>, number] {
  const ref = useRef<HTMLElement>(null)
  const [count, setCount] = useState(() => compute(window.innerWidth, minColumnWidth, max))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const width = el.clientWidth
      setCount(compute(width, minColumnWidth, max))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [minColumnWidth, max])

  return [ref, count]
}

function compute(width: number, minColumnWidth: number, max: number): number {
  if (width < 660) return 1
  return Math.max(1, Math.min(max, Math.floor(width / minColumnWidth)))
}

/**
 * 把照片按「当前最矮的一列」分配，得到紧密无空洞的排版，同时基本保持从左到右的时间顺序。
 * 高度用 1/aspect 估算 —— 列宽相同，所以相对高度就是 宽/高 的倒数。
 */
export function useMasonry(photos: PhotoView[], columnCount: number): PhotoView[][] {
  return useMemo(() => {
    if (columnCount <= 1) return [photos]

    const columns: PhotoView[][] = Array.from({ length: columnCount }, () => [])
    const heights = new Array<number>(columnCount).fill(0)

    for (const photo of photos) {
      let target = 0
      for (let i = 1; i < columnCount; i++) {
        if (heights[i] < heights[target] - 1e-6) target = i
      }
      columns[target].push(photo)
      heights[target] += 1 / photo.aspect
    }

    return columns
  }, [photos, columnCount])
}

/** 元素进入视口后置为可见，用于逐张浮现 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.12) {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (shown) return

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
            return
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [threshold, shown])

  return [ref, shown] as const
}
