/**
 * 纯函数小工具，Node 端的照片处理脚本和浏览器端的上传页共用一份，
 * 免得两边各写一套、时间久了结果对不上。
 *
 * 这个文件里不能出现 fs / path 之类的 Node 专有依赖，浏览器也要能跑。
 */

/** 把宽高比归类成排版用的四种 */
export function classify(aspect) {
  if (aspect >= 1.9) return 'panorama'
  if (aspect >= 1.1) return 'landscape'
  if (aspect >= 0.9) return 'square'
  return 'portrait'
}

/**
 * 把 EXIF 时间统一成 { date: 'YYYY-MM-DD', time: 'HH:MM:SS' }。
 * 全程按字符串处理，不经过 Date 的时区换算，避免把日期挪成前一天。
 */
export function toLocalParts(value) {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const p = (n, w = 2) => String(n).padStart(w, '0')
    return {
      date: `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`,
      time: `${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}`,
    }
  }

  // EXIF 常见写法："2026:09:14 10:56:05"
  const m = String(value).match(
    /^(\d{4})[-:](\d{2})[-:](\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/
  )
  if (!m) return null

  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}` }
}

/** 去掉小数末尾多余的 0：f/1.8 而不是 f/1.80 */
export function tidy(n, digits = 1) {
  return Number(n.toFixed(digits)).toString()
}

/** Make 是 "Canon"、Model 是 "Canon EOS 5D Mark IV"，直接拼会出现 "Canon Canon ..." */
export function formatCamera(make, model) {
  const parts = [make, model].filter(Boolean).map((s) => String(s).trim())
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  const [brand, name] = parts
  return name.toLowerCase().startsWith(brand.toLowerCase()) ? name : `${brand} ${name}`
}

export function formatFocal(focal) {
  if (!focal) return null
  return `${Math.round(focal)}mm`
}

export function formatExposure(seconds) {
  if (!seconds) return null
  if (seconds >= 1) return `${tidy(seconds, 1)}s`
  return `1/${Math.round(1 / seconds)}s`
}

/** 由宽高和 EXIF 拼出清单里那条记录（不含文案） */
export function buildPhotoRecord({
  id,
  album,
  taken,
  width,
  height,
  viewPath,
  thumbPath,
  viewBytes,
  thumbBytes,
  lqip,
  color,
  exif,
}) {
  const aspect = width / height
  return {
    id,
    album,
    date: taken.date,
    takenAt: `${taken.date}T${taken.time}`,
    src: viewPath,
    thumb: thumbPath,
    width,
    height,
    aspect: Number(aspect.toFixed(4)),
    orientation: classify(aspect),
    bytes: viewBytes + thumbBytes,
    lqip,
    color,
    camera: formatCamera(exif.Make, exif.Model),
    exif: {
      lens: exif.LensModel ?? null,
      focal: formatFocal(exif.FocalLength),
      aperture: exif.FNumber ? `f/${tidy(exif.FNumber)}` : null,
      shutter: formatExposure(exif.ExposureTime),
      iso: exif.ISO ? `ISO ${exif.ISO}` : null,
    },
  }
}

/** 把新照片并进清单：同 id 覆盖，按拍摄时间倒序 */
export function mergeManifest(manifest, records) {
  const byId = new Map()
  for (const p of manifest?.photos ?? []) byId.set(p.id, p)
  for (const r of records) byId.set(r.id, r)

  const photos = [...byId.values()].sort((a, b) =>
    a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0
  )

  return {
    generatedAt: new Date().toISOString(),
    count: photos.length,
    dates: [...new Set(photos.map((p) => p.date))].sort().reverse(),
    photos,
  }
}
