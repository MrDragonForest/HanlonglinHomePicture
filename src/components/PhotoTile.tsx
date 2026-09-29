import { useCallback } from 'react'
import { motion } from 'framer-motion'
import type { PhotoView } from '../types'
import { site } from '../data/site.config'
import { SmartImage } from './SmartImage'
import { assetUrl } from '../lib/photos'
import { tileRegistry } from '../lib/tileRegistry'

interface Props {
  photo: PhotoView
  onOpen: (index: number) => void
  priority?: boolean
}

const HOVER_SPRING = { type: 'spring', stiffness: 320, damping: 34, mass: 0.7 } as const

export function PhotoTile({ photo, onOpen, priority }: Props) {
  const registerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) tileRegistry.set(photo.id, el)
      else tileRegistry.delete(photo.id)
    },
    [photo.id]
  )

  const caption = photo.title || photo.caption

  return (
    <motion.div
      ref={registerRef}
      className="tile"
      data-orientation={photo.orientation}
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.button
        type="button"
        className="tile__hit"
        onClick={() => onOpen(photo.index)}
        whileHover={{ scale: 1.018 }}
        whileTap={{ scale: 0.995 }}
        transition={HOVER_SPRING}
        aria-label={`查看第 ${photo.index + 1} 张照片${caption ? `：${caption}` : ''}`}
      >
        <SmartImage
          photo={photo}
          src={assetUrl(photo.thumb)}
          sizes="(max-width: 660px) 92vw, (max-width: 1080px) 46vw, 30vw"
          alt={caption || `拍摄于 ${photo.date} 的照片`}
          priority={priority}
        />

        <span className="tile__veil" aria-hidden="true" />

        <span className="tile__meta">
          <span className="tile__date">{photo.takenAt.slice(11, 16)}</span>
          {caption && <span className="tile__caption">{caption}</span>}
        </span>

        {site.showExif && photo.exif.aperture && (
          <span className="tile__exif" aria-hidden="true">
            {[photo.exif.focal, photo.exif.aperture, photo.exif.shutter]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </motion.button>
    </motion.div>
  )
}
