/**
 * 网格里每张照片的 DOM 节点登记处。
 * 查看器用它做两件事：把目标照片滚回视野内；量出缩略图的屏幕位置，
 * 好让全屏图从缩略图的位置和大小长出来、关闭时再缩回去。
 */
const registry = new Map<string, HTMLElement>()

export const tileRegistry = {
  set(id: string, el: HTMLElement) {
    registry.set(id, el)
  },
  delete(id: string) {
    registry.delete(id)
  },
  get(id: string): HTMLElement | undefined {
    return registry.get(id)
  },

  /** 缩略图当前在屏幕上的位置，不在视野内返回 null */
  rect(id: string): DOMRect | null {
    const el = registry.get(id)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const vh = window.innerHeight
    if (rect.bottom < 0 || rect.top > vh) return null
    return rect
  },

  /** 照片不在视野内就立刻（无动画）滚到中间，返回是否滚动过 */
  ensureVisible(id: string): boolean {
    const el = registry.get(id)
    if (!el) return false

    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight
    const fullyVisible = rect.top >= 8 && rect.bottom <= vh - 8
    if (fullyVisible) return false

    // 站点全局设了 scroll-behavior: smooth，这里必须临时换成瞬时，
    // 否则共享元素转场会在页面还在滚动时就开始测量，位置全错。
    const html = document.documentElement
    const previous = html.style.scrollBehavior
    html.style.scrollBehavior = 'auto'
    el.scrollIntoView({ block: 'center' })
    html.style.scrollBehavior = previous
    return true
  },
}
