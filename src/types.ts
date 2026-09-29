export type Orientation = 'portrait' | 'square' | 'landscape' | 'panorama'

export interface PhotoExif {
  lens: string | null
  focal: string | null
  aperture: string | null
  shutter: string | null
  iso: string | null
}

/** 由 scripts/build-photos.mjs 生成的图片信息，全部是客观数据 */
export interface Photo {
  id: string
  album: string
  date: string
  takenAt: string
  src: string
  thumb: string
  width: number
  height: number
  aspect: number
  orientation: Orientation
  bytes: number
  lqip: string
  color: string
  camera: string | null
  exif: PhotoExif
}

export interface Manifest {
  generatedAt: string
  count: number
  dates: string[]
  photos: Photo[]
}

/** 手写文案，存在 src/data/captions.json，重新生成照片时不会被覆盖 */
export interface Caption {
  title?: string
  caption?: string
  location?: string
}

export type CaptionMap = Record<string, Caption>

/** 图片信息 + 文案，前端实际使用的形状 */
export interface PhotoView extends Photo {
  index: number
  title: string
  caption: string
  location: string
}

/** 按拍摄日分组后的一个相册段落 */
export interface DayGroup {
  date: string
  label: string
  photos: PhotoView[]
}
