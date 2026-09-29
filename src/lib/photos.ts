import type {
  Manifest,
  CaptionMap,
  Photo,
  PhotoView,
  DayGroup,
  Orientation,
} from '../types'
import manifestRaw from '../data/photos.json'
import captionsRaw from '../data/captions.json'

const manifest = manifestRaw as unknown as Manifest
const captions = captionsRaw as unknown as CaptionMap

/**
 * 部署到 GitHub Pages 子路径时 Vite 会把 BASE_URL 设成 '/仓库名/'。
 * 清单里的路径是不带前导斜杠的相对路径，这里统一拼接。
 */
const BASE = import.meta.env.BASE_URL

export function assetUrl(path: string): string {
  return `${BASE}${path.replace(/^\/+/, '')}`
}

/** 合并客观图片信息与手写文案 */
export const photos: PhotoView[] = manifest.photos.map((p, index) => {
  const cap = captions[p.id] ?? {}
  return {
    ...p,
    index,
    title: cap.title?.trim() ?? '',
    caption: cap.caption?.trim() ?? '',
    location: cap.location?.trim() ?? '',
  }
})

/**
 * 把衍生图阶梯展开成 srcset。
 * w 描述符用的是文件真实像素宽度，浏览器据此挑一档，
 * 保证挑到的那一档宽度 ≥ 当前的 CSS 宽度 × 设备像素比，也就是不放大。
 */
export function srcSet(photo: Photo): string {
  return photo.ladder.map((r) => `${assetUrl(r.src)} ${r.w}w`).join(', ')
}

/**
 * 网格格子的 sizes。
 *
 * 断点必须和 useLayout 的 useColumnCount 对齐（最小列宽 380，最多 4 列），
 * 百分比则按内容宽度反推出来，和 gallery.css 的 --shell / --gutter / --gap 一致：
 *   < 760 → 1 列，列宽 = 90vw
 *   760–1139 → 2 列，列宽 = (90vw − 1.8vw) / 2 ≈ 44.1vw
 *   1140–1519 → 3 列，列宽 = (90vw − 3.6vw) / 3 ≈ 28.8vw
 *   ≥ 1520 → 4 列，宽度由外壳上限 1560 决定，列宽固定 335px
 *
 * 这里必须尽量准：sizes 偏大会让浏览器挑到高一档的图（白下载几十 KB），
 * 偏小则会挑到糊的。写死百分比是因为改动列数/间距时这里也要跟着改一次，
 * 所以下面这段注释要一起改。
 */
const TILE_SIZES =
  '(max-width: 759px) 90vw, (max-width: 1139px) 44vw, (max-width: 1519px) 29vw, 335px'

/** 全景图在排版里独占一整行，宽度就是内容宽度 */
const PANORAMA_SIZES = '(max-width: 1559px) 90vw, 1416px'

export function tileSizes(orientation: Orientation): string {
  return orientation === 'panorama' ? PANORAMA_SIZES : TILE_SIZES
}

export const photoCount = photos.length
export const manifestGeneratedAt = manifest.generatedAt

/** 取出全部照片里最早和最晚的拍摄时间，用于开场区 */
export const dateRange = (() => {
  if (photos.length === 0) return { from: '', to: '' }
  const sorted = [...photos].sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1))
  return { from: sorted[0].takenAt, to: sorted[sorted.length - 1].takenAt }
})()

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-09-14 → 2026 · 09 · 14 */
export function formatDateDotted(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y} · ${m} · ${d}`
}

/** 2026-09-14 → 2026 年 9 月 14 日 星期一 */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return `${y} 年 ${m} 月 ${d} 日 星期${WEEKDAYS[wd]}`
}

/** 中文月份名，给展开的分组日期用 */
export function formatMonthCN(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return `${y} 年 ${m} 月`
}

/** 分组只显示日和星期，因为分组头已经写了年月 */
export function formatDayCN(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return `${d} 日 · 星期${wd}`
}

/**
 * 按拍摄日分组，日期新的在前。
 *
 * 组内保持清单里的顺序（清单本身就是按拍摄时间倒序），不再重排：
 * 查看器是按下标翻页的，这里的顺序必须和 photos 一致，
 * 否则左右方向键相对网格方向是反的。
 */
export function groupByDay(list: PhotoView[] = photos): DayGroup[] {
  const map = new Map<string, PhotoView[]>()
  for (const p of list) {
    const bucket = map.get(p.date)
    if (bucket) bucket.push(p)
    else map.set(p.date, [p])
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      label: formatMonthCN(date),
      photos: items,
    }))
}

/** 相邻预加载：查看器里翻页时提前把前后几张拉进缓存 */
export function neighbours(index: number, radius = 2): PhotoView[] {
  const out: PhotoView[] = []
  for (let d = 1; d <= radius; d++) {
    const before = photos[index - d]
    const after = photos[index + d]
    if (before) out.push(before)
    if (after) out.push(after)
  }
  return out
}
