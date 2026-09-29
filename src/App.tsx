import { useEffect, useState } from 'react'
import { Hero } from './components/Hero'
import { Gallery } from './components/Gallery'
import { Viewer } from './components/Viewer'
import { ThemeSwitch } from './components/ThemeSwitch'
import { MusicPlayer } from './components/MusicPlayer'
import { AdminPage } from './admin/AdminPage'
import { useHashRoute } from './hooks/useHashRoute'
import { useTheme, usePrefersReducedMotion } from './hooks/useTheme'
import { photos, photoCount } from './lib/photos'
import { site } from './data/site.config'

import './styles/tokens.css'
import './styles/base.css'
import './styles/hero.css'
import './styles/gallery.css'
import './styles/viewer.css'
import './styles/chrome.css'
import './styles/admin.css'

export default function App() {
  const route = useHashRoute()

  return route === 'admin' ? <AdminPage /> : <AlbumPage />
}

function AlbumPage() {
  const { theme, toggle } = useTheme()
  const reducedMotion = usePrefersReducedMotion()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // 查看器打开时锁住背景滚动
  useEffect(() => {
    document.body.classList.toggle('is-locked', viewerIndex !== null)
    return () => document.body.classList.remove('is-locked')
  }, [viewerIndex])

  if (photoCount === 0) {
    return (
      <>
        <div className="grain" aria-hidden="true" />
        <ThemeSwitch theme={theme} onToggle={toggle} />
        <div className="empty">
          <p className="label">还没有照片</p>
          <h1 className="display empty__title">{site.title}</h1>
          <p className="empty__hint">
            把原始照片放进项目里的照片文件夹，再运行 <code>npm run photos</code>{' '}
            生成网页用的图片。
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <ThemeSwitch theme={theme} onToggle={toggle} />
      <MusicPlayer />

      <Hero />
      <Gallery onOpen={setViewerIndex} />

      <footer className="foot">
        <div className="shell foot__inner">
          <span className="foot__sign display">{site.signature}</span>
          <a className="foot__link label" href="#/admin">
            管理照片
          </a>
        </div>
      </footer>

      {/* 查看器自己负责退场动画（放完才调 onClose），所以不套 AnimatePresence */}
      {viewerIndex !== null && (
        <Viewer
          photos={photos}
          index={viewerIndex}
          reducedMotion={reducedMotion}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  )
}
