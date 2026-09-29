/**
 * 浏览器端把原始照片压成网页用的图片。
 * 逻辑和 scripts/build-photos.mjs 对齐：同样的宽度档位、同样的画质、同样按拍摄日期分目录。
 */
import exifr from 'exifr'
import { buildPhotoRecord, classify, toLocalParts } from '../shared/photoMeta.mjs'
import type { PhotoExif } from '../types'

/** 还没上传的一档衍生图：blob 在内存里，w 是它的真实像素宽度 */
export interface PreparedRung {
  /** 这一档的真实像素宽度 */
  w: number
  blob: Blob
}

export interface Prepared {
  key: string
  file: File
  /** 列表里显示的预览，小尺寸 data URL */
  preview: string
  slug: string
  taken: { date: string; time: string }
  width: number
  height: number
  color: string
  lqip: string
  rungs: PreparedRung[]
  ext: string
  record: Record<string, unknown>
  meta: { camera: string | null; exif: PhotoExif }
}

export interface OutputSettings {
  /** 按宽度排的档位，前端用 srcset 让浏览器自己挑，和本地脚本保持一致 */
  ladder: number[]
  /** 横图多一档（全屏查看器里宽度会撑开） */
  wideLadder: number[]
  /** 全景图是整行铺满，再多一档更宽的 */
  panoramaLadder: number[]
  quality: number
}

export const defaultOutput: OutputSettings = {
  ladder: [420, 640, 960, 1440],
  wideLadder: [420, 640, 960, 1440, 1920],
  panoramaLadder: [420, 960, 1440, 2880],
  quality: 0.76,
}

const EXIF_FIELDS = [
  'DateTimeOriginal',
  'DateTimeDigitized',
  'CreateDate',
  'ModifyDate',
  'Make',
  'Model',
  'LensModel',
  'FNumber',
  'ExposureTime',
  'ISO',
  'FocalLength',
  'Orientation',
  'ExifImageWidth',
  'ExifImageHeight',
]

/** 测一次浏览器能不能编码 WebP，不行就退回 JPEG */
let encoder: { type: string; ext: string } | null = null

function pickEncoder(): { type: string; ext: string } {
  if (encoder) return encoder
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const webp = probe.toDataURL('image/webp').startsWith('data:image/webp')
  encoder = webp ? { type: 'image/webp', ext: 'webp' } : { type: 'image/jpeg', ext: 'jpg' }
  return encoder
}

/** 文件名里的非 ASCII 字符换成短横线，URL 干净、也不用处理转义 */
export function toSlug(name: string, fallback: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  const slug = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return slug || fallback
}

/**
 * EXIF 方向 → canvas 变换矩阵 [a,b,c,d,e,f]。
 * 每种取值都把「原图框」映射到「摆正后的框」，s 是统一缩放系数。
 */
function orientationMatrix(o: number, bw: number, bh: number, s: number) {
  switch (o) {
    case 2:
      return [-s, 0, 0, s, s * bw, 0]
    case 3:
      return [-s, 0, 0, -s, s * bw, s * bh]
    case 4:
      return [s, 0, 0, -s, 0, s * bh]
    case 5:
      return [0, s, s, 0, 0, 0]
    case 6:
      return [0, s, -s, 0, s * bh, 0]
    case 7:
      return [0, -s, -s, 0, s * bh, s * bw]
    case 8:
      return [0, -s, s, 0, 0, s * bw]
    default:
      return [s, 0, 0, s, 0, 0]
  }
}

/**
 * 有些浏览器解码时已经按 EXIF 把图摆正了。
 * 用 EXIF 里记录的原始像素尺寸判断一下，免得再摆一次变成歪的。
 */
function alreadyUpright(bitmap: ImageBitmap, exif: Record<string, unknown>, o: number) {
  const rawW = Number(exif.ExifImageWidth ?? 0)
  const rawH = Number(exif.ExifImageHeight ?? 0)
  if (!rawW || !rawH) return false
  const expectedW = o >= 5 ? rawH : rawW
  return Math.abs(bitmap.width - expectedW) <= 1
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'none' })
  } catch {
    // 个别浏览器不认这个选项，退回到默认行为
    return await createImageBitmap(file)
  }
}

/** 按原比例缩放并摆正，画到 canvas 上 */
function drawScaled(
  bitmap: ImageBitmap,
  orientation: number,
  scale: number
): HTMLCanvasElement {
  const bw = bitmap.width
  const bh = bitmap.height
  const swap = orientation >= 5
  const ow = swap ? bh : bw
  const oh = swap ? bw : bh

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(ow * scale))
  canvas.height = Math.max(1, Math.round(oh * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(...(orientationMatrix(orientation, bw, bh, scale) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]))
  ctx.drawImage(bitmap, 0, 0)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const { type } = pickEncoder()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))),
      type,
      quality
    )
  })
}

/** 24px 的模糊占位图，连同主色一起用来做「先模糊后清晰」 */
function makeLqip(bitmap: ImageBitmap, orientation: number, ow: number, oh: number) {
  const scale = 24 / Math.max(ow, oh)
  const canvas = drawScaled(bitmap, orientation, scale)

  const ctx = canvas.getContext('2d')
  let color = '#8a7b6b'
  if (ctx) {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let r = 0
    let g = 0
    let b = 0
    const pixels = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
    }
    const hex = (v: number) =>
      Math.round(v / pixels)
        .toString(16)
        .padStart(2, '0')
    color = `#${hex(r)}${hex(g)}${hex(b)}`
  }

  // 画布很小，直接出 data URL 比转 Blob 再读回来省事
  const { type } = pickEncoder()
  return { lqip: canvas.toDataURL(type, 0.32), color }
}

export interface PrepareOptions extends OutputSettings {
  album: string
  /** 已经用过的 id，用来避免重名 */
  takenIds: Set<string>
  /** 照片在仓库里的目录，例如 public/photos */
  photoDir: string
}

export async function prepare(file: File, options: PrepareOptions): Promise<Prepared> {
  const exif = ((await exifr.parse(file, {
    pick: EXIF_FIELDS,
    translateValues: false,
    reviveValues: true,
  })) ?? {}) as Record<string, unknown>

  const taken =
    toLocalParts(
      exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.CreateDate ?? exif.ModifyDate
    ) ?? toLocalParts(file.lastModified ? new Date(file.lastModified) : null)

  if (!taken) throw new Error('读不出拍摄时间')

  const bitmap = await decode(file)

  let orientation = Number(exif.Orientation ?? 1) || 1
  if (orientation >= 2 && alreadyUpright(bitmap, exif, orientation)) orientation = 1

  const swap = orientation >= 5
  const width = swap ? bitmap.height : bitmap.width
  const height = swap ? bitmap.width : bitmap.height
  if (!width || !height) throw new Error('读不出图片尺寸')

  // 目录名用拍摄日期，和本地脚本保持一致
  const relDir = taken.date
  const slug = uniqueSlug(relDir, file.name, options.takenIds)
  const id = `${relDir}/${slug}`

  const { ext } = pickEncoder()
  const longestEdge = Math.max(width, height)

  // 和本地脚本一样按「宽度」出档位；源图比档位还窄时不放大，
  // 于是几档可能算出同一个宽度，去重后避免上传几份一样的文件
  const shape = classify(width / height)
  const widths = [
    ...new Set(
      (shape === 'panorama'
        ? options.panoramaLadder
        : shape === 'landscape'
          ? options.wideLadder
          : options.ladder
      ).map((w) => Math.min(w, width))
    ),
  ]

  const rungs: PreparedRung[] = await Promise.all(
    widths.map(async (w) => {
      const canvas = drawScaled(bitmap, orientation, w / width)
      return { w: canvas.width, blob: await toBlob(canvas, options.quality) }
    })
  )

  const { lqip, color } = makeLqip(bitmap, orientation, width, height)

  // 预览用 320px，别把整张原图塞进内存当 data URL
  const previewCanvas = drawScaled(bitmap, orientation, Math.min(1, 320 / longestEdge))
  const preview = previewCanvas.toDataURL('image/jpeg', 0.7)

  bitmap.close()

  const dir = `${options.photoDir.replace(/\/+$/, '')}/${relDir}`
  const LADDER = rungs.map((r) => ({
    w: r.w,
    src: `${dir}/${slug}-${r.w}.${ext}`,
    bytes: r.blob.size,
  }))
  const record = buildPhotoRecord({
    id,
    album: options.album,
    taken,
    width,
    height,
    ladder: LADDER,
    lqip,
    color,
    exif,
  }) as Record<string, unknown>

  const exifOut = record.exif as PhotoExif

  return {
    key: `${id}-${file.size}-${file.lastModified}`,
    file,
    preview,
    slug,
    taken,
    width,
    height,
    color,
    lqip,
    rungs,
    ext,
    record,
    meta: { camera: record.camera as string | null, exif: exifOut },
  }
}

/** 和已有照片重名时加 -2、-3 这样的后缀 */
function uniqueSlug(date: string, fileName: string, takenIds: Set<string>): string {
  const base = toSlug(fileName, 'photo')
  let slug = base
  let n = 2
  while (takenIds.has(`${date}/${slug}`)) {
    slug = `${base}-${n++}`
  }
  takenIds.add(`${date}/${slug}`)
  return slug
}
