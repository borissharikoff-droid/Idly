import { useEffect, useRef, useState, useCallback } from 'react'
import { playClickSound } from '../../lib/sounds'
import { getStreakMultiplier } from '../../lib/xp'

interface StreakOverlayProps {
  streak: number
  onClose: () => void
}


// ── Streak tier theming ──
interface StreakTier {
  icon: string
  label: string
  subtitle: string
  color: string
  glowColor: string
  bgGradient: string
}

function getStreakTier(streak: number): StreakTier {
  if (streak >= 30) return {
    icon: '\u{1F451}', // crown
    label: 'LEGENDARY',
    subtitle: 'Absolutely unstoppable.',
    color: '#facc15',
    glowColor: 'rgba(250,204,21,0.4)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(120,80,0,0.5) 0%, rgba(0,0,0,1) 65%)',
  }
  if (streak >= 14) return {
    icon: '\u{26A1}', // lightning
    label: 'ELECTRIFYING',
    subtitle: 'Two weeks strong!',
    color: '#38bdf8',
    glowColor: 'rgba(56,189,248,0.35)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(10,40,80,0.6) 0%, rgba(0,0,0,1) 65%)',
  }
  if (streak >= 7) return {
    icon: '\u{2B50}', // star
    label: 'BLAZING',
    subtitle: 'One week of pure grind!',
    color: '#c084fc',
    glowColor: 'rgba(192,132,252,0.3)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(50,20,70,0.55) 0%, rgba(0,0,0,1) 65%)',
  }
  if (streak >= 3) return {
    icon: '\u{1F525}', // fire
    label: 'WARMING UP',
    subtitle: 'Building momentum!',
    color: '#ff8c00',
    glowColor: 'rgba(255,140,0,0.3)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(60,20,0,0.55) 0%, rgba(0,0,0,1) 65%)',
  }
  return {
    icon: '\u{1F525}', // fire
    label: 'STREAK STARTED',
    subtitle: 'Keep grinding.',
    color: '#ff8c00',
    glowColor: 'rgba(255,140,0,0.25)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(40,15,0,0.5) 0%, rgba(0,0,0,1) 65%)',
  }
}


// ── Floating particles ──
interface Particle { id: number; x: number; dur: number; size: number; color: string; drift: number }

function FloatingParticles({ color, glowColor }: { color: string; glowColor: string }) {
  const [particles, setParticles] = useState<Particle[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    const colors = [color, glowColor, '#fff8', '#fff3']
    const spawn = () => {
      const id = ++idRef.current
      const p: Particle = {
        id,
        x: 10 + Math.random() * 80,
        dur: 1.5 + Math.random() * 2,
        size: 1.5 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        drift: -15 + Math.random() * 30,
      }
      setParticles(prev => [...prev.slice(-20), p])
      setTimeout(() => setParticles(prev => prev.filter(s => s.id !== id)), p.dur * 1000 + 50)
    }
    const iv = setInterval(spawn, 100)
    return () => clearInterval(iv)
  }, [color, glowColor])

  return (
    <>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            bottom: 0,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size + 3}px ${p.color}`,
            animation: `streak-particle-rise ${p.dur}s ease-out forwards`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

// ── Reward info based on streak tier ──
function getRewardInfo(streak: number): { items: { text: string }[] } {
  const multi = getStreakMultiplier(streak)
  const pct = Math.round((multi - 1) * 100)
  const items: { text: string }[] = []

  if (pct > 0) items.push({ text: `+${pct}% XP boost` })
  if (streak >= 7) items.push({ text: '🛡 Shield: miss 1 day without reset' })
  if (streak >= 14) items.push({ text: '📦 Improved chest tier rates' })
  if (streak >= 30) items.push({ text: '⭐ Legendary tier unlocked' })

  return { items }
}

// ── Main component ──
export function StreakOverlay({ streak, onClose }: StreakOverlayProps) {
  const [closing, setClosing] = useState(false)
  const animatedStreak = streak
  const tier = getStreakTier(streak)
  const rewards = getRewardInfo(streak)

  const handleClose = useCallback(() => {
    if (closing) return
    playClickSound()
    setClosing(true)
    setTimeout(onClose, 400)
  }, [closing, onClose])

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      style={{
        backgroundColor: '#000',
        backgroundImage: tier.bgGradient,
        opacity: closing ? 0 : 1,
        transition: 'opacity 0.4s ease-out',
      }}
    >
      {/* Full-screen particle field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <FloatingParticles color={tier.color} glowColor={tier.glowColor} />
      </div>

      {/* Ambient glow behind content */}
      <div
        className="absolute pointer-events-none rounded-full blur-3xl"
        style={{
          width: 300, height: 300,
          left: '50%', top: '50%',
          transform: 'translate(-50%, -55%)',
          background: tier.glowColor,
          animation: 'streak-ambient-pulse 2.5s ease-in-out infinite alternate',
        }}
      />

      <div className="text-center relative z-10">

        {/* Tier icon — animated entrance */}
        <div
          className="text-6xl leading-none mx-auto"
          style={{
            filter: `drop-shadow(0 0 20px ${tier.glowColor})`,
            animation: 'streak-icon-enter 0.8s 0.2s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {tier.icon}
        </div>

        {/* Streak number — counts up from 0 */}
        <p
          className="font-mono font-black tabular-nums leading-none mt-4"
          style={{
            fontSize: 64,
            color: tier.color,
            textShadow: `0 0 40px ${tier.glowColor}, 0 2px 0 rgba(0,0,0,0.4)`,
            animation: 'streak-num-enter 0.7s 0.6s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {animatedStreak}
        </p>

        {/* "day streak" */}
        <p
          className="text-sm font-bold uppercase tracking-[0.3em] mt-2"
          style={{
            color: `${tier.color}bb`,
            animation: 'streak-fade-up 0.5s 1.6s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          day streak
        </p>

        {/* Tier label badge */}
        <div
          className="inline-block mt-3 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{
            border: `1px solid ${tier.color}44`,
            background: `${tier.color}15`,
            color: tier.color,
            animation: 'streak-fade-up 0.5s 1.9s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {tier.label}
        </div>

        {/* Subtitle */}
        <p
          className="text-[13px] mt-2"
          style={{
            color: 'rgba(255,255,255,0.4)',
            animation: 'streak-fade-up 0.5s 2.1s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {tier.subtitle}
        </p>

        {/* Reward chips */}
        {rewards.items.length > 0 && (
          <div
            className="flex flex-wrap justify-center gap-2 mt-4 max-w-[280px] mx-auto"
            style={{ animation: 'streak-fade-up 0.5s 2.5s cubic-bezier(0.16,1,0.3,1) both' }}
          >
            {rewards.items.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  background: `${tier.color}12`,
                  border: `1px solid ${tier.color}30`,
                  color: `${tier.color}dd`,
                }}
              >
                {r.text}
              </div>
            ))}
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleClose}
          className="mt-6 px-12 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-125"
          style={{
            background: `linear-gradient(135deg, ${tier.color}25 0%, ${tier.color}10 100%)`,
            border: `1px solid ${tier.color}40`,
            color: tier.color,
            boxShadow: `0 0 24px ${tier.color}18`,
            animation: 'streak-fade-up 0.4s 2.8s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          Continue
        </button>
      </div>

      <style>{`
        @keyframes streak-icon-enter {
          0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
          50%  { transform: scale(1.2) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes streak-num-enter {
          0%   { transform: scale(0.2) translateY(20px); opacity: 0; filter: blur(10px); }
          60%  { transform: scale(1.06) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
        }
        @keyframes streak-fade-up {
          0%   { transform: translateY(12px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes streak-particle-rise {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0.9; }
          50%  { opacity: 0.7; }
          100% { transform: translateY(-120px) translateX(var(--drift, 0px)) scale(0); opacity: 0; }
        }
        @keyframes streak-ambient-pulse {
          0%   { opacity: 0.3; transform: translate(-50%, -55%) scale(0.85); }
          100% { opacity: 0.55; transform: translate(-50%, -55%) scale(1.15); }
        }
      `}</style>
    </div>
  )
}
