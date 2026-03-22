import { useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import mascotImg from '../../assets/mascot.png'
import { MOTION } from '../../lib/motion'

const BG_ICONS: {
  emoji: string; x: number; y: number; size: number
  depth: number; rotate: number; floatDur: number
  exitX: number; exitY: number
}[] = [
  { emoji: '🎁', x: -4, y: 5,   size: 20, depth: 1.8, rotate: -12, floatDur: 2.8, exitX: -60, exitY: -40 },
  { emoji: '⚡', x: 92, y: 2,   size: 18, depth: 2.2, rotate: 15,  floatDur: 2.2, exitX: 60,  exitY: -50 },
  { emoji: '🎯', x: -2, y: 78,  size: 17, depth: 1.5, rotate: 8,   floatDur: 3.2, exitX: -55, exitY: 35  },
  { emoji: '👥', x: 94, y: 80,  size: 18, depth: 2.0, rotate: -10, floatDur: 2.6, exitX: 65,  exitY: 40  },
  { emoji: '🏆', x: 96, y: 42,  size: 19, depth: 1.6, rotate: 5,   floatDur: 3.0, exitX: 70,  exitY: 5   },
  { emoji: '⭐', x: -3, y: 42,  size: 16, depth: 2.4, rotate: -20, floatDur: 2.4, exitX: -65, exitY: -10 },
  { emoji: '🔥', x: 18, y: 96,  size: 17, depth: 1.3, rotate: 12,  floatDur: 2.0, exitX: -30, exitY: 55  },
  { emoji: '💎', x: 78, y: 95,  size: 16, depth: 1.9, rotate: -8,  floatDur: 3.4, exitX: 45,  exitY: 50  },
]

export function WelcomeBanner() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const px = (e.clientX - cx) / (rect.width / 2)
    const py = (e.clientY - cy) / (rect.height / 2)
    setTilt({ x: px, y: py })
  }, [])

  const handleMouseEnter = useCallback(() => setHovering(true), [])
  const handleMouseLeave = useCallback(() => {
    setHovering(false)
    setTilt({ x: 0, y: 0 })
  }, [])

  const mascotX = tilt.x * 6
  const mascotY = tilt.y * -4
  const textX = tilt.x * 3
  const textY = tilt.y * -2
  const glowX = 50 + tilt.x * 15
  const glowY = 20 + tilt.y * 10

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.6,
        y: -20,
        filter: 'blur(8px)',
        transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
      }}
      transition={{ duration: MOTION.duration.slow, ease: MOTION.easing }}
      className="w-full max-w-[240px]"
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative select-none"
        style={{
          transform: hovering
            ? `perspective(400px) rotateY(${tilt.x * 4}deg) rotateX(${tilt.y * -4}deg)`
            : 'perspective(400px) rotateY(0deg) rotateX(0deg)',
          transition: hovering ? 'transform 0.08s ease-out' : 'transform 0.4s ease-out',
        }}
      >
        {/* Floating parallax icons */}
        {BG_ICONS.map((icon, i) => (
          <motion.span
            key={i}
            className="absolute pointer-events-none select-none z-0"
            style={{
              left: `${icon.x}%`,
              top: `${icon.y}%`,
              fontSize: icon.size,
            }}
            initial={{ opacity: 0, scale: 0.3, rotate: icon.rotate }}
            animate={{
              opacity: hovering ? 0.45 : 0.10,
              scale: hovering ? 1.15 : 0.85,
              rotate: hovering ? icon.rotate + (i % 2 === 0 ? 8 : -8) : icon.rotate,
              x: tilt.x * icon.depth * 5,
              y: hovering ? tilt.y * icon.depth * -4 : 0,
              filter: hovering ? 'grayscale(0) drop-shadow(0 0 4px rgba(255,255,255,0.15))' : 'grayscale(0.6)',
            }}
            exit={{
              x: icon.exitX,
              y: icon.exitY,
              opacity: 0,
              scale: 1.5,
              rotate: icon.rotate + (i % 2 === 0 ? 40 : -40),
              filter: 'grayscale(0)',
              transition: {
                duration: 0.45,
                delay: i * 0.02,
                ease: [0.2, 0, 0, 1],
              },
            }}
            transition={{
              x: { type: 'spring', stiffness: 180, damping: 22 },
              y: { type: 'spring', stiffness: 180, damping: 22 },
              opacity: { duration: 0.3 },
              scale: { type: 'spring', stiffness: 300, damping: 18 },
              rotate: { type: 'spring', stiffness: 120, damping: 14 },
              filter: { duration: 0.3 },
            }}
          >
            <span
              className="inline-block"
              style={{
                animation: `iconFloat${i % 4} ${icon.floatDur}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            >
              {icon.emoji}
            </span>
          </motion.span>
        ))}

        {/* Card body */}
        <motion.div
          className="relative rounded border border-white/[0.07] overflow-hidden z-10"
          style={{
            background: 'linear-gradient(165deg, rgba(88,101,242,0.10) 0%, rgba(30,31,40,0.95) 45%, rgba(0,255,136,0.03) 100%)',
          }}
          exit={{
            scale: 0.85,
            opacity: 0,
            boxShadow: '0 0 40px rgba(0,255,136,0.3)',
            transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
          }}
        >
          <div
            className="absolute w-24 h-24 rounded-full pointer-events-none blur-2xl"
            style={{
              background: 'radial-gradient(circle, rgba(88,101,242,0.18), transparent 70%)',
              left: `${glowX}%`,
              top: `${glowY}%`,
              transform: 'translate(-50%, -50%)',
              transition: hovering ? 'left 0.1s, top 0.1s' : 'left 0.4s, top 0.4s',
            }}
          />

          <div className="flex flex-col items-center px-4 pt-3 pb-3 relative">
            <motion.img
              src={mascotImg}
              alt="Grindly"
              className="w-11 h-11 object-contain mb-1.5 drop-shadow-[0_0_8px_rgba(88,101,242,0.25)]"
              draggable={false}
              animate={{ x: mascotX, y: mascotY }}
              exit={{
                y: -30,
                scale: 1.3,
                opacity: 0,
                transition: { duration: 0.35, ease: [0.2, 0, 0, 1] },
              }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            />

            <motion.div
              className="text-center"
              animate={{ x: textX, y: textY }}
              exit={{
                y: 10,
                opacity: 0,
                transition: { duration: 0.25, ease: [0.4, 0, 1, 1] },
              }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <p className="text-white font-semibold text-body leading-tight mb-1.5">
                Welcome to Grindly
              </p>

              <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-caption text-gray-300/90">
                <span>track time</span>
                <span className="text-white/15">&middot;</span>
                <span>get loot</span>
                <span className="text-white/15">&middot;</span>
                <span>level up</span>
                <span className="text-white/15">&middot;</span>
                <span>compete</span>
              </div>

              <p className="text-accent/60 text-caption mt-1.5">{'<3'}</p>
            </motion.div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  )
}
