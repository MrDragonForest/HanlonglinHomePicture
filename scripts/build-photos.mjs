#!/usr/bin/env node
/**
 * 把原始大图处理成适合网页的照片集。
 *
 *   npm run photos         增量处理（已存在衍生图的跳过）
 *   npm run photos:force   全量重做
 *
 * 做的事情：
 *   1. 读 EXIF 拍摄时间（拿不到就用文件时间），按 YYYY-MM-DD 分目录
 *   2. 生成 thumb / view 两档 WebP（长边限制，自动按 EXIF 摆正方向）
 *   3. 生成 24px 的 LQIP 模糊占位图 + 主色调，内联进清单
 *   4. 按宽高比归类 portrait / square / landscape / panorama，供前端排版
 *   5. 写 src/data/photos.json
 *
 * 注意：本脚本不会碰 src/data/captions.json —— 你在那里手写的标题和说明
 * 不会被重新生成照片时覆盖。
 */
import { readdir, stat, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import exifr from 'exifr'
import { config } from './photos.config.mjs'
import {
  buildPhotoRecord,
  toLocalParts,
} from '../src/shared/photoMeta.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORCE = process.argv.includes('--force')

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

/** 递归收集目录下的候选图片，跳过未下载完的文件 */
async function collectImages(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await collectImages(full, out)
      continue
    }
    // 百度网盘/迅雷等未下载完成的临时文件
    if (/\.(baiduyun\.p\.downloading|downloading|part|crdownload|!ut)$/i.test(e.name)) continue
    if (e.name.startsWith('.')) continue
    const ext = path.extname(e.name).toLowerCase()
    if (!config.extensions.includes(ext)) continue
    out.push(full)
  }
  return out
}

/** 读原始照片的关键信息与压缩产物。buf 是原图内容，整张只读一次磁盘。 */
async function processOne(buf, meta, exif, taken, baseName, album) {
  const relDir = taken.date

  // EXIF 方向 >= 5 表示宽高对调，用来算摆正后的真实尺寸
  const swapped = (exif.Orientation ?? 1) >= 5
  const srcW = swapped ? meta.height : meta.width
  const srcH = swapped ? meta.width : meta.height
  if (!srcW || !srcH) throw new Error('读不到图片尺寸')

  const aspect = srcW / srcH
  if (!Number.isFinite(aspect)) throw new Error('图片尺寸异常')

  const outDirAbs = path.join(ROOT, config.outDir, relDir)
  await mkdir(outDirAbs, { recursive: true })

  const slug = baseName.replace(/\.[^.]+$/, '')
  const derivatives = {}

  for (const [key, edge] of Object.entries(config.sizes)) {
    const fileName = `${slug}-${key}.webp`
    const abs = path.join(outDirAbs, fileName)
    const rel = `${config.outDir.replace(/^public\//, '')}/${relDir}/${fileName}`

    if (!FORCE && existsSync(abs)) {
      derivatives[key] = { src: rel, bytes: (await stat(abs)).size }
      continue
    }

    const out = await sharp(buf)
      .rotate() // 按 EXIF 摆正
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: config.quality[key], effort: 5 })
      .toBuffer()

    await writeFile(abs, out)
    derivatives[key] = { src: rel, bytes: out.length }
  }

  // LQIP 模糊占位：24px，内联 base64 直接进清单，实现「先模糊色块、后清晰」
  const lqipBuf = await sharp(buf)
    .rotate()
    .resize({ width: config.lqip.edge, height: config.lqip.edge, fit: 'inside' })
    .webp({ quality: config.lqip.quality })
    .toBuffer()

  // 占位块背景色：取整图均值。sharp 的 dominant 对这类照片经常给出接近纯黑的值，均值更稳。
  const stats = await sharp(buf).rotate().resize(64).stats()
  const dominantHex = `#${stats.channels
    .slice(0, 3)
    .map((ch) => Math.round(ch.mean).toString(16).padStart(2, '0'))
    .join('')}`

  return buildPhotoRecord({
    id: `${relDir}/${slug}`,
    album,
    taken,
    width: srcW,
    height: srcH,
    viewPath: derivatives.view.src,
    thumbPath: derivatives.thumb.src,
    viewBytes: derivatives.view.bytes,
    thumbBytes: derivatives.thumb.bytes,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
    color: dominantHex,
    exif,
  })
}

/**
 * 需要的 EXIF 字段。
 * 说明：sharp 0.35 的 metadata().exif 只给原始 Buffer，不解析字段，所以这里用 exifr 解析。
 */
const EXIF_FIELDS = [
  'DateTimeOriginal',
  'DateTimeDigitized',
  'CreateDate',
  'ModifyDate',
  'Make',
  'Model',
  'LensModel',
  'FNumber',
  'ApertureValue',
  'ExposureTime',
  'ShutterSpeedValue',
  'ISO',
  'FocalLength',
  'Orientation',
]

async function readExif(buf) {
  try {
    const out = await exifr.parse(buf, {
      pick: EXIF_FIELDS,
      translateValues: false, // 保持 Orientation 为数字、ISO 为数字
      reviveValues: true, // 把有理数转成小数，例如 1/200 → 0.005
      silentErrors: true,
    })
    return out ?? {}
  } catch {
    return {}
  }
}

/** 拍摄时间：优先 EXIF 拍摄时间，其次数字化时间，最后退到文件修改时间 */
async function resolveTaken(exif, srcPath) {
  return (
    toLocalParts(
      exif.DateTimeOriginal ??
        exif.DateTimeDigitized ??
        exif.CreateDate ??
        exif.ModifyDate
    ) ??
    toLocalParts((await stat(srcPath)).mtime) ?? {
      date: '1970-01-01',
      time: '00:00:00',
    }
  )
}

/** 简单并发池，控制同时处理的图片数量，避免内存爆掉 */
async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  const total = items.length

  async function runner() {
    while (cursor < items.length) {
      const i = cursor++
      try {
        results[i] = { ok: true, value: await worker(items[i], i) }
      } catch (err) {
        results[i] = { ok: false, error: err }
      }
      done++
      const label = items[i].display.padEnd(28)
      const r = results[i]
      process.stdout.write(
        `\r  ${c.dim(`[${done}/${total}]`)} ${label} ` +
          (r.ok ? c.green('✓') : c.red('✗')) +
          '          '
      )
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, total) }, runner))
  process.stdout.write('\n')
  return results
}

async function main() {
  console.log('')
  console.log(c.bold('  📷 处理照片'))
  console.log('')

  const jobs = []

  for (const batch of config.batches) {
    for (const source of batch.sources) {
      const abs = path.join(ROOT, source)
      if (!existsSync(abs)) {
        console.log(`  ${c.yellow('!')} 跳过不存在的目录：${source}`)
        continue
      }
      const files = await collectImages(abs)
      console.log(
        `  ${c.dim('·')} ${source} ${c.dim(`→ 找到 ${files.length} 张`)}`
      )
      for (const f of files) {
        jobs.push({
          file: f,
          baseName: path.basename(f),
          album: batch.album,
          display: path.basename(f),
        })
      }
    }
  }

  if (jobs.length === 0) {
    console.log(`\n  ${c.yellow('没有找到可处理的照片。')}\n`)
    return
  }

  console.log('')
  const started = Date.now()
  const results = await pool(jobs, config.concurrency, async (job) => {
    const buf = await readFile(job.file)
    const meta = await sharp(buf).metadata()
    const exif = await readExif(buf)
    const taken = await resolveTaken(exif, job.file)
    return processOne(buf, meta, exif, taken, job.baseName, job.album)
  })

  const photos = []
  const failures = []
  results.forEach((r, i) => {
    if (r.ok) photos.push(r.value)
    else failures.push({ file: jobs[i].file, error: r.error })
  })

  // 按拍摄时间排序，最新的一天放最前
  photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0))

  const totalBytes = photos.reduce((n, p) => n + p.bytes, 0)
  const byOrientation = photos.reduce((acc, p) => {
    acc[p.orientation] = (acc[p.orientation] ?? 0) + 1
    return acc
  }, {})
  const byDate = [...new Set(photos.map((p) => p.date))].sort().reverse()

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: photos.length,
    dates: byDate,
    photos,
  }

  const manifestPath = path.join(ROOT, config.manifestFile)
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log('')
  console.log(`  完成 ${c.green(String(photos.length))} 张，用时 ${secs}s`)
  console.log(
    `  分类 ${Object.entries(byOrientation)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`
  )
  console.log(`  日期 ${byDate.join(', ')}`)
  console.log(`  衍生图总体积 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  清单写入 ${c.dim(config.manifestFile)}`)

  // 提醒：captions.json 里没有条目的照片，方便补文案
  const captionsPath = path.join(ROOT, 'src/data/captions.json')
  if (existsSync(captionsPath)) {
    try {
      const captions = JSON.parse(await readFile(captionsPath, 'utf8'))
      const missing = photos.filter((p) => !captions[p.id])
      if (missing.length > 0) {
        console.log('')
        console.log(
          `  ${c.cyan('提示')} 有 ${missing.length} 张还没有文案，可在 ${c.dim('src/data/captions.json')} 里补：`
        )
        for (const p of missing.slice(0, 6)) {
          console.log(
            `    ${c.dim('"')}${p.id}${c.dim('"')}: { "title": "", "caption": "" },`
          )
        }
        if (missing.length > 6) console.log(`    ${c.dim(`… 其余 ${missing.length - 6} 张`)}`)
      }
    } catch {
      /* captions.json 格式有问题留给前端报错 */
    }
  }

  if (failures.length > 0) {
    console.log('')
    console.log(`  ${c.red('以下照片处理失败：')}`)
    for (const f of failures) {
      console.log(`    ${path.relative(ROOT, f.file)}`)
      console.log(`      ${c.dim(f.error.message)}`)
    }
  }

  console.log('')
}

main().catch((err) => {
  console.error(`\n  ${c.red('处理失败：')} ${err.stack ?? err.message}\n`)
  process.exit(1)
})
