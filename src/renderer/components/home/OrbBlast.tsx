import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'

// ─── Key insight ─────────────────────────────────────────────────────────────
//
// Glow  = inset-0 radial-gradient at high opacity → looks like light source
// Сгусток = sized div + border-radius:50% + filter:blur → looks like physical mass
//
// The blur rounds the edges without washing out the color.
// Moderate opacity (0.38–0.52) keeps it dense, not transparent.

// ─── Types ───────────────────────────────────────────────────────────────────

type Variant = 'expand' | 'pulse' | 'drift' | 'breathe'

interface OrbState {
  id:      number
  color:   string   // solid color
  color2:  string   // radial center (slightly lighter)
  variant: Variant
  x:       number   // px from center (randomized)
  y:       number   // px from center (randomized)
  size:    number   // px diameter
  blur:    number   // px blur radius
  peak:    number   // max opacity 0.35–0.52
  dur:     number   // total duration (s)
  // for drift variant
  dx:      number   // drift x px
  dy:      number   // drift y px
  // border-radius for organic shape
  br:      string
}

// ─── Color palette ───────────────────────────────────────────────────────────

const COLORS_START = [
  { base: '#16a34a', light: '#4ade80' },   // forest green
  { base: '#2563eb', light: '#60a5fa' },   // royal blue
  { base: '#7c3aed', light: '#a78bfa' },   // violet
  { base: '#0891b2', light: '#22d3ee' },   // cyan
  { base: '#b45309', light: '#fbbf24' },   // amber
  { base: '#be185d', light: '#f472b6' },   // rose
  { base: '#0f766e', light: '#2dd4bf' },   // teal
  { base: '#c2410c', light: '#fb923c' },   // orange
]

const COLORS_STOP = [
  { base: '#b91c1c', light: '#f87171' },   // red
  { base: '#c2410c', light: '#fb923c' },   // orange-red
  { base: '#991b1b', light: '#ef4444' },   // deep crimson
]

const VARIANTS: Variant[] = ['expand', 'pulse', 'drift', 'breathe']

// Organic border-radius shapes — look like a blob, not a perfect circle
const SHAPES = [
  '60% 40% 55% 45% / 45% 60% 40% 55%',
  '50% 65% 45% 60% / 60% 45% 55% 40%',
  '70% 35% 60% 40% / 40% 65% 35% 65%',
  '45% 55% 65% 35% / 55% 45% 55% 45%',
  '55% 45% 50% 50% / 50% 55% 45% 55%',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

let seq = 0
const rnd  = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const rndI = (lo: number, hi: number) => Math.round(rnd(lo, hi))
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const sign = () => (Math.random() > 0.5 ? 1 : -1)

function buildOrb(isStart: boolean): OrbState {
  const { base, light } = pick(isStart ? COLORS_START : COLORS_STOP)
  return {
    id:      ++seq,
    color:   base,
    color2:  light,
    variant: pick(VARIANTS),
    x:       rnd(-60, 60),
    y:       rnd(-80, 130),
    size:    rndI(320, 500),
    blur:    rndI(70, 110),
    peak:    rnd(0.36, 0.52),
    dur:     rnd(2.6, 4.2),
    dx:      sign() * rnd(20, 55),
    dy:      sign() * rnd(15, 45),
    br:      pick(SHAPES),
  }
}

// ─── Variant animation configs ────────────────────────────────────────────────
//
//   expand  — springs in from tiny, holds, eases out. Clean and punchy.
//   pulse   — springs in, contracts slightly, re-expands, then fades. Heartbeat.
//   drift   — springs in while drifting sideways, fades while continuing drift.
//   breathe — slow swell, long hold, gentle dissolve. Meditative.

function getMotion(v: Variant, _dur: number, peak: number, dx: number, dy: number) {
  switch (v) {
    case 'expand':
      return {
        opacity: [0, peak, peak * 0.85, 0],
        scale:   [0.15, 1.0, 1.05, 0.88],
        x:       [0, 0, 0, 0],
        y:       [0, 0, 0, 0],
        times:   [0, 0.18, 0.50, 1],
        ease:    ['easeOut', 'easeInOut', 'easeIn'] as const,
      }
    case 'pulse':
      return {
        opacity: [0, peak, peak * 0.7, peak * 0.9, 0],
        scale:   [0.1, 1.0, 0.82, 1.04, 0.90],
        x:       [0, 0, 0, 0, 0],
        y:       [0, 0, 0, 0, 0],
        times:   [0, 0.15, 0.38, 0.58, 1],
        ease:    ['easeOut', 'easeInOut', 'easeOut', 'easeIn'] as const,
      }
    case 'drift':
      return {
        opacity: [0, peak, peak * 0.75, 0],
        scale:   [0.2, 1.0, 1.02, 0.85],
        x:       [0, dx * 0.3, dx * 0.7, dx],
        y:       [0, dy * 0.3, dy * 0.7, dy],
        times:   [0, 0.20, 0.55, 1],
        ease:    ['easeOut', 'easeInOut', 'easeIn'] as const,
      }
    case 'breathe':
      return {
        opacity: [0, peak * 0.6, peak, peak * 0.85, peak * 0.4, 0],
        scale:   [0.3, 0.85, 1.0,  1.06, 1.0,       0.88],
        x:       [0, 0, 0, 0, 0, 0],
        y:       [0, 0, 0, 0, 0, 0],
        times:   [0, 0.12, 0.32, 0.55, 0.78, 1],
        ease:    ['easeOut', 'easeOut', 'easeInOut', 'easeInOut', 'easeIn'] as const,
      }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrbBlast() {
  const status  = useSessionStore((s) => s.status)
  const prevRef = useRef(status)
  const [orb, setOrb] = useState<OrbState | null>(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = status

    let isStart: boolean | null = null
    if ((prev === 'idle' || prev === 'paused') && status === 'running')         isStart = true
    else if ((prev === 'running' || prev === 'paused') && status === 'idle')    isStart = false
    else if (prev === 'running' && status === 'paused')                         isStart = false
    if (isStart === null) return

    setOrb(buildOrb(isStart))
  }, [status])

  return (
    <AnimatePresence>
      {orb && (() => {
        const m = getMotion(orb.variant, orb.dur, orb.peak, orb.dx, orb.dy)
        return (
          <motion.div
            key={orb.id}
            className="fixed pointer-events-none"
            style={{
              // Center the blob at (50% + random offset)
              left:            `calc(50% + ${orb.x}px)`,
              top:             `calc(50% + ${orb.y}px)`,
              width:           orb.size,
              height:          orb.size,
              transform:       'translate(-50%, -50%)',
              borderRadius:    orb.br,
              background:      `radial-gradient(ellipse 60% 60% at 50% 50%, ${orb.color2} 0%, ${orb.color} 45%, ${orb.color}88 75%, transparent 100%)`,
              filter:          `blur(${orb.blur}px)`,
              willChange:      'transform, opacity',
              zIndex:          -1,
              // Disable transform so Framer can own it
              translateX:      0,
              translateY:      0,
            }}
            initial={{ opacity: 0, scale: 0.15, x: 0, y: 0 }}
            animate={{
              opacity: m.opacity,
              scale:   m.scale,
              x:       m.x,
              y:       m.y,
            }}
            transition={{
              duration: orb.dur,
              times:    m.times,
              ease:     m.ease,
            }}
            onAnimationComplete={() => setOrb(null)}
          />
        )
      })()}
    </AnimatePresence>
  )
}
