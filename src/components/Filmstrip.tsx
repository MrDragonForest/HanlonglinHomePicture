import { useEffect, useRef } from 'react'
import type { PhotoView } from '../types'
import { assetUrl } from '../lib/photos'

interface Props {
  photos: PhotoView[]
  index: number
  onSelect: (index: number) => void
}

export function Filmstrip({ photos, index, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])

  // 把当前这张挪到胶片条中间。直接算 scrollLeft，不用 scrollIntoView，
  // 免得顺带把整页也滚动了。
  useEffect(() => {
    const scroller = scrollerRef.current
    const item = itemsRef.current[index]
    if (!scroller || !item) return

    const target = item.offsetLeft - (scroller.clientWidth - item.clientWidth) / 2
    scroller.scrollTo({
      left: Math.max(0, target),
      behavior: 'smooth',
    })
  }, [index])

  return (
    <div className="strip" ref={scrollerRef}>
      <div className="strip__track">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            ref={(el) => {
              itemsRef.current[i] = el
            }}
            className="strip__item"
            data-active={i === index}
            style={{ backgroundColor: photo.color }}
            onClick={() => onSelect(i)}
            aria-label={`第 ${i + 1} 张`}
            aria-current={i === index}
          >
            <img
              src={assetUrl(photo.thumb)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
