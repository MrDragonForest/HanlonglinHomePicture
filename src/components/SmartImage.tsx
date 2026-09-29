import { useEffect, useRef, useState } from 'react'
import type { PhotoView } from '../types'

export interface SmartImageProps {
  photo: PhotoView
  src: string
  alt: string
  className?: string
  sizes?: string
  priority?: boolean
  onLoaded?: () => void
}

/**
 * 三级加载：
 *   1. 先用照片主色铺底（瞬时，无闪烁）
 *   2. 再叠 24px 的模糊占位图放大（几百字节，内联在清单里）
 *   3. 真图加载完成后淡入覆盖
 *
 * 外层容器由父级给定宽高比，所以图片没加载完也不会引起排版跳动。
 */
export function SmartImage({
  photo,
  src,
  alt,
  className,
  sizes,
  priority = false,
  onLoaded,
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // 从缓存直接命中时 onLoad 可能不触发
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true)
      onLoaded?.()
    }
  }, [onLoaded])

  return (
    <div
      className={`smart ${className ?? ''}`}
      style={{ backgroundColor: photo.color }}
      data-loaded={loaded}
    >
      <img className="smart__lqip" src={photo.lqip} alt="" aria-hidden="true" />
      <img
        ref={imgRef}
        className="smart__full"
        src={src}
        alt={alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => {
          setLoaded(true)
          onLoaded?.()
        }}
      />
    </div>
  )
}
