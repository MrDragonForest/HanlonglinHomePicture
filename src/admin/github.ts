/**
 * 直接用 GitHub 的 Git Data API 提交一批文件。
 * 流程：取分支最新 commit → 建 blob → 建 tree → 建 commit → 移动分支指针。
 * 整批照片只产生一个 commit，历史干净，也不会出现「提交到一半失败」的半成品。
 */

const API = 'https://api.github.com'

export interface RepoConfig {
  owner: string
  repo: string
  branch: string
  token: string
}

export interface CommitFile {
  /** 仓库里的完整路径，例如 public/photos/2026-09-14/xxx-view.webp */
  path: string
  /** 文件内容，base64（不带 data URL 前缀） */
  base64: string
}

export interface CommitResult {
  commitSha: string
  url: string
  files: number
}

async function request<T>(cfg: RepoConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    let message = `HTTP ${res.status}`
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (parsed.message) message = parsed.message
    } catch {
      /* 保留默认信息 */
    }
    if (res.status === 401) message = `Token 无效或已过期（${message}）`
    if (res.status === 403) message = `没有写权限，检查 Token 是否勾了 Contents 读写（${message}）`
    if (res.status === 404) message = `找不到 ${cfg.owner}/${cfg.repo}，或 Token 无权访问（${message}）`
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

interface RepoInfo {
  full_name: string
  default_branch: string
  private: boolean
  permissions?: { push?: boolean }
}

/** 验证仓库和 Token 能不能用得上 */
export async function verifyRepo(cfg: RepoConfig): Promise<RepoInfo> {
  const info = await request<RepoInfo>(cfg, `/repos/${cfg.owner}/${cfg.repo}`)
  if (info.permissions && info.permissions.push === false) {
    throw new Error('这个 Token 对该仓库没有写权限')
  }
  return info
}

interface ContentResponse {
  content: string
  sha: string
  encoding: string
}

/** 读仓库里的文本文件，不存在返回 null */
export async function readTextFile(cfg: RepoConfig, path: string): Promise<string | null> {
  try {
    const res = await request<ContentResponse>(
      cfg,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`
    )
    if (res.encoding !== 'base64') return null
    // 文件内容可能含中文，base64 要先转成字节再按 UTF-8 解，不能直接 atob
    const bytes = Uint8Array.from(atob(res.content.replace(/\n/g, '')), (ch) => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch (err) {
    if (err instanceof Error && err.message.includes('找不到')) return null
    throw err
  }
}

/** Blob → base64。用 FileReader 而不是手写转换，大文件也不会爆栈 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export interface CommitOptions {
  message: string
  files: CommitFile[]
  onProgress?: (done: number, total: number, label: string) => void
}

export async function commitFiles(cfg: RepoConfig, options: CommitOptions): Promise<CommitResult> {
  const { files, onProgress } = options
  const base = `/repos/${cfg.owner}/${cfg.repo}`

  // 1. 分支当前的 commit
  const ref = await request<{ object: { sha: string } }>(
    cfg,
    `${base}/git/ref/heads/${encodeURIComponent(cfg.branch)}`
  )
  const parentSha = ref.object.sha

  // 2. 该 commit 的 tree，作为新 tree 的基底（这样只改动的文件会进 commit）
  const parentCommit = await request<{ tree: { sha: string } }>(
    cfg,
    `${base}/git/commits/${parentSha}`
  )

  // 3. 逐个上传 blob
  const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = []
  let done = 0
  for (const file of files) {
    const blob = await request<{ sha: string }>(cfg, `${base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.base64, encoding: 'base64' }),
    })
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
    done++
    onProgress?.(done, files.length, file.path.split('/').pop() ?? file.path)
  }

  // 4. 新 tree
  const newTree = await request<{ sha: string }>(cfg, `${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
  })

  // 5. 新 commit
  const commit = await request<{ sha: string; html_url: string }>(cfg, `${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: options.message,
      tree: newTree.sha,
      parents: [parentSha],
    }),
  })

  // 6. 把分支指过去
  await request(cfg, `${base}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  })

  return { commitSha: commit.sha, url: commit.html_url, files: files.length }
}
