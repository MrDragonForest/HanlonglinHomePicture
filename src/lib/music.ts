/**
 * 背景音乐。
 *
 * 把音频文件丢进 src/assets/music/ 就会自动出现在播放列表里，不需要改代码。
 * 支持 .mp3 / .m4a / .ogg / .wav。
 *
 * 注意版权：公开仓库和公开网站上请使用可商用免版权音乐，README 里列了几个来源。
 */

const modules = import.meta.glob('../assets/music/*.{mp3,m4a,ogg,wav,flac}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export interface Track {
  /** 文件名去掉扩展名，作为展示名 */
  name: string
  url: string
}

export const tracks: Track[] = Object.entries(modules)
  .map(([path, url]) => ({
    name: decodeURIComponent(path.split('/').pop() ?? '').replace(/\.[^.]+$/, ''),
    url,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh'))

export const hasMusic = tracks.length > 0
