import { useMemo } from 'react'
import { site } from '../data/site.config'
import { groupByDay } from '../lib/photos'
import { buildLayout, useColumnCount, useMasonry } from '../hooks/useLayout'
import type { PhotoView } from '../types'
import { PhotoTile } from './PhotoTile'

interface Props {
  onOpen: (index: number) => void
}

export function Gallery({ onOpen }: Props) {
  const [containerRef, columns] = useColumnCount(site.gridMinColumnWidth, 4)
  const groups = useMemo(() => groupByDay(), [])

  return (
    <main className="gallery" ref={containerRef}>
      {groups.map((group) => (
        <section className="day" key={group.date}>
          <DayHeader date={group.date} label={group.label} count={group.photos.length} />

          {buildLayout(group.photos).map((block) =>
            block.kind === 'full' ? (
              <FullWidthRow key={block.key} photo={block.photo} onOpen={onOpen} />
            ) : (
              <MasonryRow
                key={block.key}
                photos={block.photos}
                columnCount={columns}
                onOpen={onOpen}
              />
            )
          )}
        </section>
      ))}

      <footer className="gallery__end">
        <span className="rule" />
        <p className="gallery__end-text">— 到此为止，日子还在继续 —</p>
      </footer>
    </main>
  )
}

function DayHeader({ date, label, count }: { date: string; label: string; count: number }) {
  const day = date.slice(8)
  return (
    <div className="day__head">
      <div className="day__head-left">
        <h2 className="day__month">{label}</h2>
        <span className="day__day display">{day}</span>
      </div>
      <div className="day__head-right">
        <span className="day__count">{count} 张</span>
      </div>
      <span className="day__rule" aria-hidden="true" />
    </div>
  )
}

function MasonryRow({
  photos,
  columnCount,
  onOpen,
}: {
  photos: PhotoView[]
  columnCount: number
  onOpen: (index: number) => void
}) {
  const columns = useMasonry(photos, columnCount)

  return (
    <div className="masonry" data-columns={columnCount}>
      {columns.map((column, i) => (
        <div className="masonry__col" key={i}>
          {column.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              onOpen={onOpen}
              priority={photo.index < 4}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 长图（全景）单独占一整行 */
function FullWidthRow({
  photo,
  onOpen,
}: {
  photo: PhotoView
  onOpen: (index: number) => void
}) {
  return (
    <div className="panorama">
      <PhotoTile photo={photo} onOpen={onOpen} />
    </div>
  )
}
