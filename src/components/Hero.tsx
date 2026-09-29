import { motion } from 'framer-motion'
import { site } from '../data/site.config'
import { dateRange, photoCount, formatDateDotted } from '../lib/photos'

const ease = [0.22, 1, 0.36, 1] as const

const rise = {
  hidden: { opacity: 0, y: 24 },
  shown: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.1, ease, delay },
  }),
}

function rangeLabel(): string {
  const { from, to } = dateRange
  if (!from) return ''
  const a = formatDateDotted(from.slice(0, 10))
  if (from.slice(0, 10) === to.slice(0, 10)) return a
  return `${a} — ${formatDateDotted(to.slice(0, 10))}`
}

/** 按全角逗号切句，末句不可断行，避免出现「过 / 成」这类句中折行 */
function clauses(text: string): string[] {
  const parts = text.split('，')
  if (parts.length === 1) return [text]
  return parts.map((part, i) => (i < parts.length - 1 ? `${part}，` : part))
}

export function Hero() {
  const range = rangeLabel()
  const subtitle = clauses(site.subtitle)

  return (
    <header className="hero">
      <div className="hero__glow" aria-hidden="true" />

      <div className="hero__inner shell">
        <motion.p
          className="label hero__eyebrow"
          variants={rise}
          initial="hidden"
          animate="shown"
          custom={0.1}
        >
          <span className="hero__eyebrow-line" />
          {site.eyebrow}
          <span className="hero__eyebrow-line" />
        </motion.p>

        <motion.h1
          className="display hero__title"
          variants={rise}
          initial="hidden"
          animate="shown"
          custom={0.26}
        >
          {site.title}
        </motion.h1>

        <motion.p
          className="hero__subtitle"
          variants={rise}
          initial="hidden"
          animate="shown"
          custom={0.44}
        >
          {subtitle.map((clause, i) => (
            <span key={clause} className={i === subtitle.length - 1 ? 'hero__subtitle-tail' : undefined}>
              {clause}
            </span>
          ))}
        </motion.p>

        <motion.div
          className="hero__meta"
          variants={rise}
          initial="hidden"
          animate="shown"
          custom={0.62}
        >
          <span className="hero__meta-item">{range}</span>
          <span className="hero__meta-dot" aria-hidden="true" />
          <span className="hero__meta-item">{photoCount} 张照片</span>
        </motion.div>
      </div>

      <motion.div
        className="hero__cue"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 1.1, ease }}
        aria-hidden="true"
      >
        <span className="hero__cue-text">向下滚动</span>
        <span className="hero__cue-line" />
      </motion.div>
    </header>
  )
}
