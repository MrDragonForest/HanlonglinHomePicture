import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { site } from '../data/site.config'
import { photos as bundledPhotos } from '../lib/photos'
import { mergeManifest } from '../shared/photoMeta.mjs'
import {
  blobToBase64,
  commitFiles,
  readTextFile,
  textToBase64,
  verifyRepo,
} from './github'
import type { CommitResult, RepoConfig } from './github'
import { defaultOutput, prepare } from './compress'
import type { Prepared } from './compress'

const CONFIG_KEY = 'gallery:github'
const MANIFEST_PATH = 'src/data/photos.json'
const CAPTIONS_PATH = 'src/data/captions.json'

interface StoredConfig extends RepoConfig {
  /** 图片在仓库里的目录，和 scripts/photos.config.mjs 的 outDir 对应 */
  assetsDir: string
}

const emptyConfig: StoredConfig = {
  owner: '',
  repo: '',
  branch: 'main',
  token: '',
  assetsDir: 'public/photos',
}

function loadConfig(): StoredConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...emptyConfig, ...(JSON.parse(raw) as Partial<StoredConfig>) }
  } catch {
    /* 忽略 */
  }
  return { ...emptyConfig }
}

interface Editable {
  uid: string
  name: string
  prepared: Prepared | null
  status: 'working' | 'ready' | 'error'
  error?: string
  title: string
  caption: string
  location: string
}

export function AdminPage() {
  const [config, setConfig] = useState<StoredConfig>(loadConfig)
  const [batchLocation, setBatchLocation] = useState('')
  const [items, setItems] = useState<Editable[]>([])
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [repoStatus, setRepoStatus] = useState<{ ok: boolean; text: string } | null>(null)

  // 已经在用的 id，避免新照片覆盖旧的
  const takenIds = useRef<Set<string>>(new Set(bundledPhotos.map((p) => p.id)))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    } catch {
      /* 忽略 */
    }
  }, [config])

  const ready = useMemo(() => items.filter((it) => it.status === 'ready' && it.prepared), [items])
  const working = items.some((it) => it.status === 'working')
  const totalBytes = useMemo(
    () =>
      ready.reduce(
        (n, it) =>
          n + (it.prepared?.rungs.reduce((s, r) => s + r.blob.size, 0) ?? 0),
        0
      ),
    [ready]
  )

  const configured = Boolean(config.owner && config.repo && config.token)
  /** 清单里的路径前缀（相对 public），例如 'photos' */
  const manifestPrefix = config.assetsDir.replace(/^public\//, '').replace(/\/+$/, '')
  /** 仓库里的目录，例如 'public/photos' */
  const repoDir = config.assetsDir.replace(/\/+$/, '')

  const patch = useCallback((uid: string, next: Partial<Editable>) => {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...next } : it)))
  }, [])

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setResult(null)
      setError(null)

      const slots: Editable[] = files.map((file, i) => ({
        uid: `${Date.now()}-${i}-${file.name}-${file.size}`,
        name: file.name,
        prepared: null,
        status: 'working',
        title: '',
        caption: '',
        location: batchLocation,
      }))
      setItems((prev) => [...prev, ...slots])

      // 逐张处理：手机拍的原图很大，并发解码容易把内存打满
      for (let i = 0; i < files.length; i++) {
        const slot = slots[i]
        try {
          const prepared = await prepare(files[i], {
            ...defaultOutput,
            album: site.title,
            takenIds: takenIds.current,
            photoDir: manifestPrefix,
          })
          patch(slot.uid, { prepared, status: 'ready' })
        } catch (err) {
          patch(slot.uid, {
            status: 'error',
            error: friendlyError(files[i], err instanceof Error ? err.message : String(err)),
          })
        }
      }
    },
    [batchLocation, manifestPrefix, patch]
  )

  const checkRepo = async () => {
    setChecking(true)
    setRepoStatus(null)
    try {
      const info = await verifyRepo(config)
      // 顺手把仓库里清单的 id 读进来，避免重名
      const text = await readTextFile(config, MANIFEST_PATH)
      if (text) {
        const manifest = JSON.parse(text) as { photos?: { id: string }[] }
        for (const p of manifest.photos ?? []) takenIds.current.add(p.id)
      }
      setRepoStatus({ ok: true, text: `连接正常：${info.full_name}（分支 ${config.branch}）` })
    } catch (err) {
      setRepoStatus({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setChecking(false)
    }
  }

  const publish = async () => {
    if (!configured || ready.length === 0 || publishing) return
    setPublishing(true)
    setResult(null)
    setError(null)
    setStatusLine('读取仓库里现有的清单…')

    try {
      const [manifestText, captionsText] = await Promise.all([
        readTextFile(config, MANIFEST_PATH),
        readTextFile(config, CAPTIONS_PATH),
      ])

      const manifest = manifestText
        ? (JSON.parse(manifestText) as { photos?: Record<string, unknown>[] })
        : null
      const captions = captionsText
        ? (JSON.parse(captionsText) as Record<string, Record<string, string>>)
        : {}

      const records = ready.map((it) => it.prepared!.record as Record<string, unknown>)
      const nextManifest = mergeManifest(manifest, records)

      // 文案只写用户真填了的字段，留空的保持空缺
      const nextCaptions = { ...captions }
      for (const item of ready) {
        const id = item.prepared!.record.id as string
        const entry: Record<string, string> = {}
        if (item.title.trim()) entry.title = item.title.trim()
        if (item.caption.trim()) entry.caption = item.caption.trim()
        if (item.location.trim()) entry.location = item.location.trim()
        if (Object.keys(entry).length > 0) nextCaptions[id] = entry
      }

      setStatusLine(`压缩包已就绪，开始上传 ${ready.length} 张…`)
      const uploadCount = ready.reduce((n, it) => n + it.prepared!.rungs.length, 0)
      setProgress({ done: 0, total: uploadCount + 2 })

      const files = []
      let done = 0
      for (const item of ready) {
        const p = item.prepared!
        const dir = `${repoDir}/${p.taken.date}`
        for (const rung of p.rungs) {
          files.push({
            path: `${dir}/${p.slug}-${rung.w}.${p.ext}`,
            base64: await blobToBase64(rung.blob),
          })
          done += 1
          setProgress({ done, total: uploadCount + 2 })
        }
      }

      files.push({
        path: MANIFEST_PATH,
        base64: textToBase64(JSON.stringify(nextManifest, null, 2) + '\n'),
      })
      setProgress({ done: done + 1, total: uploadCount + 2 })
      files.push({
        path: CAPTIONS_PATH,
        base64: textToBase64(JSON.stringify(nextCaptions, null, 2) + '\n'),
      })

      setStatusLine('正在创建提交…')
      const dates = [...new Set(ready.map((it) => it.prepared!.taken.date))].sort()
      const commit = await commitFiles(config, {
        message: `照片：新增 ${ready.length} 张（${dates.join('、')}）`,
        files,
      })

      setProgress(null)
      setStatusLine(null)
      setResult(commit)
      setItems([])
    } catch (err) {
      setProgress(null)
      setStatusLine(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="admin">
      <header className="admin__head">
        <div>
          <p className="label">后台</p>
          <h1 className="admin__title display">添加照片</h1>
        </div>
        <a className="admin__back label" href="#/">
          ← 回到相册
        </a>
      </header>

      <section className="card">
        <h2 className="card__title">GitHub 仓库</h2>
        <p className="card__hint">
          需要一枚<b>细粒度 Token</b>，权限只勾这一个仓库的{' '}
          <code>Contents: Read and write</code>。Token 只留在这台设备的浏览器里，不会提交进仓库。
        </p>

        <div className="grid4">
          <Field label="用户名 / 组织">
            <input
              value={config.owner}
              onChange={(e) => setConfig({ ...config, owner: e.target.value.trim() })}
              placeholder="hanlonglin"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="仓库名">
            <input
              value={config.repo}
              onChange={(e) => setConfig({ ...config, repo: e.target.value.trim() })}
              placeholder="my-picture-project"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="分支">
            <input
              value={config.branch}
              onChange={(e) => setConfig({ ...config, branch: e.target.value.trim() })}
              placeholder="main"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="图片目录">
            <input
              value={config.assetsDir}
              onChange={(e) => setConfig({ ...config, assetsDir: e.target.value.trim() })}
              placeholder="public/photos"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>

        <Field label="Token">
          <input
            type="password"
            value={config.token}
            onChange={(e) => setConfig({ ...config, token: e.target.value.trim() })}
            placeholder="github_pat_..."
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <div className="card__actions">
          <button
            type="button"
            className="btn"
            onClick={checkRepo}
            disabled={!configured || checking}
          >
            {checking ? '检查中…' : '验证连接'}
          </button>
          {repoStatus && (
            <span className="status" data-ok={repoStatus.ok}>
              {repoStatus.text}
            </span>
          )}
        </div>
      </section>

      <section
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')))
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <span className="dropzone__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </span>
        <p className="dropzone__main">点击选择，或把照片拖进来</p>
        <p className="dropzone__sub">
          可一次选多张。浏览器会按 {defaultOutput.ladder.join(' / ')}px 出一套多档图再上传（前端用 srcset 按屏幕密度自己挑），并按拍摄日期自动分目录。
        </p>
      </section>

      {items.length > 0 && (
        <section className="batch">
          <div className="batch__bar">
            <span className="batch__count">
              {items.length} 张 · 就绪 {ready.length}
              {totalBytes > 0 && ` · ${formatBytes(totalBytes)}`}
            </span>

            <label className="batch__loc">
              <span>统一地点</span>
              <input
                value={batchLocation}
                placeholder="例如：长春 · 净月潭"
                onChange={(e) => setBatchLocation(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  setItems((prev) => prev.map((it) => ({ ...it, location: batchLocation })))
                }
              >
                套用全部
              </button>
            </label>
          </div>

          <ul className="items">
            {items.map((item) => (
              <li className="item" key={item.uid} data-status={item.status}>
                <div className="item__thumb" style={{ backgroundColor: item.prepared?.color }}>
                  {item.prepared ? (
                    <img src={item.prepared.preview} alt="" />
                  ) : (
                    <span className="item__spinner" aria-hidden="true" />
                  )}
                </div>

                <div className="item__body">
                  {item.status === 'error' ? (
                    <p className="item__error">{item.error}</p>
                  ) : item.prepared ? (
                    <>
                      <div className="item__facts">
                        <span className="item__date">{item.prepared.taken.date}</span>
                        <span>{item.prepared.taken.time.slice(0, 5)}</span>
                        <span>
                          {item.prepared.width}×{item.prepared.height}
                        </span>
                        <span>
                          {formatBytes(
                            item.prepared.rungs.reduce((s, r) => s + r.blob.size, 0)
                          )}
                        </span>
                        {item.prepared.meta.camera && <span>{item.prepared.meta.camera}</span>}
                      </div>
                      <div className="item__fields">
                        <input
                          value={item.title}
                          placeholder="标题（可留空）"
                          onChange={(e) => patch(item.uid, { title: e.target.value })}
                        />
                        <input
                          value={item.caption}
                          placeholder="说明文字（可留空）"
                          onChange={(e) => patch(item.uid, { caption: e.target.value })}
                        />
                        <input
                          value={item.location}
                          placeholder="地点（可留空）"
                          onChange={(e) => patch(item.uid, { location: e.target.value })}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="item__pending">{item.name} · 处理中…</p>
                  )}
                </div>

                <button
                  type="button"
                  className="item__remove"
                  onClick={() => setItems((prev) => prev.filter((it) => it.uid !== item.uid))}
                  aria-label={`移除 ${item.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {progress && (
        <div className="progressbar" role="progressbar" aria-valuenow={progress.done}>
          <span
            className="progressbar__fill"
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
          <span className="progressbar__text">
            {statusLine ?? `${progress.done} / ${progress.total}`}
          </span>
        </div>
      )}

      {error && <p className="publish-error">上传失败：{error}</p>}

      {result && (
        <p className="publish-ok">
          已提交 {result.files} 个文件 ·{' '}
          <a href={result.url} target="_blank" rel="noreferrer noopener">
            在 GitHub 上查看这次提交
          </a>
          <span className="publish-ok__note">
            图片已经进仓库了。等自动部署跑完（或手动 npm run build 后重新发布），相册里就会出现。
          </span>
        </p>
      )}

      <div className="publish-bar">
        <span className="publish-bar__info">
          {!configured
            ? '先填好仓库信息'
            : working
              ? '还有照片在处理中…'
              : ready.length === 0
                ? '还没有可上传的照片'
                : `待上传 ${ready.length} 张 · ${formatBytes(totalBytes)}`}
        </span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={publish}
          disabled={!configured || ready.length === 0 || publishing}
        >
          {publishing ? '正在上传…' : '保存并发布'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

function friendlyError(file: File, message: string): string {
  if (/\.(heic|heif)$/i.test(file.name) || /could not be decoded|decode|heic|heif/i.test(message)) {
    return `${file.name}：浏览器解不开这个格式。HEIC/HEIF 需要先在手机里转成 JPEG，或者用电脑上的 npm run photos 处理。`
  }
  return `${file.name}：${message}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
