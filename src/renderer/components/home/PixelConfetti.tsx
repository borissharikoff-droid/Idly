import { motion } from 'framer-motion'
import { PIXEL_CONFETTI_COLORS } from '../../lib/uiConstants'

const SIZE = 6

interface PixelConfettiProps {
  /** Center X/Y as 0–1 (e.g. 0.5 = middle). Default center. */
  originX?: number
  originY?: number
  /** Accent color for a few particles; rest use palette. */
  accentColor?: string
  /** Duration in seconds. */
  duration?: number
  /** Number of particles. */
  count?: number
}

export function PixelConfetti({ originX = 0.5, originY = 0.5, accentColor, duration = 2.2, count = 14 }: PixelConfettiProps) {
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
    const speed = 120 + Math.random() * 180
    const color = i < 3 && accentColor ? accentColor : PIXEL_CONFETTI_COLORS[i % PIXEL_CONFETTI_COLORS.length]
    const delay = Math.random() * 0.15
    const x = Math.cos(angle) * speed
    const y = Math.sin(angle) * speed - 40
    return { x, y, color, delay, rotation: Math.random() * 360 }
  })

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-none"
          style={{
            left: `${originX * 100}%`,
            top: `${originY * 100}%`,
            width: SIZE,
            height: SIZE,
            backgroundColor: p.color,
            marginLeft: -SIZE / 2,
            marginTop: -SIZE / 2,
            boxShadow: `0 0 ${SIZE}px ${p.color}60`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: [1, 1, 0],
            rotate: p.rotation + 180,
          }}
          transition={{
            duration,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}
