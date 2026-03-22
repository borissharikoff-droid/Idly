import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import mascotImg from '../../assets/mascot.png'
import { SKILLS } from '../../lib/skills'
import { MOTION } from '../../lib/motion'
import { Zap, Package, Sword, Shield } from '../../lib/icons'
import { Target, Gift, Monitor, PauseCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const WORK_SKILL_IDS = ['developer', 'designer', 'gamer', 'communicator', 'researcher', 'creator', 'learner', 'listener']

const SKILL_HINT: Record<string, string> = {
  developer:    'VS Code, terminals',
  designer:     'Figma, Photoshop',
  gamer:        'Steam, games',
  communicator: 'Discord, Slack',
  researcher:   'Browser, docs',
  creator:      'Premiere, DaVinci',
  learner:      'Courses, YouTube',
  listener:     'Spotify, music',
}

const DAILY_GOALS = [
  { label: '30 min',  tag: 'Casual',    secs: 1800 },
  { label: '1 hour',  tag: 'Focused',   secs: 3600 },
  { label: '2 hours', tag: 'Dedicated', secs: 7200 },
  { label: '3+ hours',tag: 'Hardcore',  secs: 10800 },
]

const SLIDE = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: MOTION.easing } },
  exit:    { opacity: 0, x: -20, transition: { duration: 0.2, ease: MOTION.easing } },
}

const FEATURES: { Icon: LucideIcon; color: string; bg: string; label: string; sub: string }[] = [
  { Icon: Zap,     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: '8 skills to level up',     sub: 'Developer, Designer, Gamer...' },
  { Icon: Package, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Loot drops from real work', sub: 'Gear, chests, rare items' },
  { Icon: Sword,   color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Dungeons, raids & guilds',   sub: 'Fight bosses, party with friends' },
]

const TIPS: { Icon: LucideIcon; text: string }[] = [
  { Icon: Monitor,     text: 'Works with any app — coding, YouTube, games' },
  { Icon: PauseCircle, text: 'Auto-pauses when you go AFK' },
  { Icon: Shield,      text: 'Unlock Arena after your first session' },
]

interface Props {
  onDone: () => void
}

export function OnboardingWizard({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [goalSecs, setGoalSecs] = useState(3600)

  const workSkills = SKILLS.filter((s) => WORK_SKILL_IDS.includes(s.id))

  function toggleSkill(id: string) {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function complete() {
    if (selectedSkills.length > 0) {
      localStorage.setItem('grindly_primary_skills', JSON.stringify(selectedSkills))
    }
    localStorage.setItem('grindly_daily_goal_secs', String(goalSecs))
    localStorage.setItem('grindly_first_chest_pending', '1')
    localStorage.setItem('grindly_onboarding_done', '1')
    onDone()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-surface-0/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
    >
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === step ? 20 : 6,
              height: 6,
              background: i <= step ? 'var(--color-accent, #5865F2)' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-[320px]">
        <AnimatePresence mode="wait">

          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <motion.div key="step0" {...SLIDE} className="flex flex-col items-center gap-4 text-center">
              <motion.img
                src={mascotImg}
                alt="Grindly"
                className="w-24 h-24 drop-shadow-[0_0_16px_rgba(88,101,242,0.4)]"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                draggable={false}
              />
              <div>
                <h1 className="text-lg font-bold text-white mb-1">Welcome to Grindly</h1>
                <p className="text-sm text-gray-400">Your work is your grind.</p>
              </div>

              <div className="w-full rounded-card border border-white/8 bg-surface-1 divide-y divide-white/5">
                {FEATURES.map((f) => (
                  <div key={f.label} className="flex items-center gap-3 px-3 py-2.5">
                    <span
                      className="shrink-0 flex items-center justify-center rounded w-7 h-7"
                      style={{ background: f.bg }}
                    >
                      <f.Icon size={15} color={f.color} strokeWidth={1.75} />
                    </span>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-medium text-white">{f.label}</p>
                      <p className="text-caption text-gray-500 truncate">{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <motion.button
                onClick={() => setStep(1)}
                className="w-full py-2.5 rounded bg-accent text-white font-bold text-sm active:scale-[0.98] transition-transform"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                Let's go →
              </motion.button>
            </motion.div>
          )}

          {/* ── Step 1: Skill picker ── */}
          {step === 1 && (
            <motion.div key="step1" {...SLIDE} className="flex flex-col gap-4">
              <div className="text-center">
                <h2 className="text-base font-bold text-white">What do you spend most time on?</h2>
                <p className="text-xs text-gray-500 mt-0.5">Picked skills show on your home screen with live progress</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {workSkills.map((skill) => {
                  const selected = selectedSkills.includes(skill.id)
                  return (
                    <button
                      key={skill.id}
                      onClick={() => toggleSkill(skill.id)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded border transition-all active:scale-95 text-left"
                      style={{
                        borderColor: selected ? skill.color : 'rgba(255,255,255,0.08)',
                        background:  selected ? `${skill.color}18` : 'rgba(255,255,255,0.03)',
                        boxShadow:   selected ? `0 0 8px ${skill.color}30` : 'none',
                      }}
                    >
                      <span className="text-xl leading-none shrink-0">{skill.icon}</span>
                      <div className="min-w-0">
                        <p className="text-caption font-semibold leading-tight"
                          style={{ color: selected ? skill.color : 'rgba(255,255,255,0.7)' }}>
                          {skill.name}
                        </p>
                        <p className="text-micro text-gray-600 leading-tight truncate">
                          {SKILL_HINT[skill.id]}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setStep(0)}
                  className="px-3 py-2 rounded border border-white/10 text-gray-400 text-xs hover:border-white/20 transition-colors"
                >
                  ← Back
                </button>
                <motion.button
                  onClick={() => setStep(2)}
                  className="flex-1 py-2 rounded bg-accent text-white font-bold text-sm active:scale-[0.98] transition-transform"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Next →
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Daily goal ── */}
          {step === 2 && (
            <motion.div key="step2" {...SLIDE} className="flex flex-col gap-4">
              <div className="text-center">
                <h2 className="text-base font-bold text-white">Daily grind goal</h2>
                <p className="text-xs text-gray-500 mt-0.5">How much focused work per day?</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DAILY_GOALS.map((g) => {
                  const active = goalSecs === g.secs
                  return (
                    <button
                      key={g.secs}
                      onClick={() => setGoalSecs(g.secs)}
                      className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded border transition-all active:scale-95"
                      style={{
                        borderColor: active ? 'rgba(88,101,242,0.6)' : 'rgba(255,255,255,0.08)',
                        background:  active ? 'rgba(88,101,242,0.12)' : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <span className="text-sm font-bold text-white">{g.label}</span>
                      <span className="text-caption text-gray-500">{g.tag}</span>
                    </button>
                  )
                })}
              </div>

              <p className="text-caption text-gray-600 text-center">
                You can change this anytime in Settings
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-3 py-2 rounded border border-white/10 text-gray-400 text-xs hover:border-white/20 transition-colors"
                >
                  ← Back
                </button>
                <motion.button
                  onClick={() => setStep(3)}
                  className="flex-1 py-2 rounded bg-accent text-white font-bold text-sm active:scale-[0.98] transition-transform"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Next →
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: First mission ── */}
          {step === 3 && (
            <motion.div key="step3" {...SLIDE} className="flex flex-col items-center gap-4 text-center">
              <span
                className="flex items-center justify-center rounded w-10 h-10"
                style={{ background: 'rgba(88,101,242,0.15)' }}
              >
                <Target size={20} color="#818cf8" strokeWidth={1.75} />
              </span>

              <div>
                <h2 className="text-base font-bold text-white mb-1">First mission</h2>
                <p className="text-body text-gray-400 leading-relaxed">
                  Keep Grindly open while you work.<br />
                  XP drops every 30 seconds.
                </p>
              </div>

              {/* Guaranteed chest callout */}
              <div
                className="w-full rounded-card border px-3 py-3 flex items-center gap-3 text-left"
                style={{ borderColor: 'rgba(88,101,242,0.25)', background: 'rgba(88,101,242,0.08)' }}
              >
                <span
                  className="shrink-0 flex items-center justify-center rounded w-8 h-8"
                  style={{ background: 'rgba(96,165,250,0.15)' }}
                >
                  <Gift size={16} color="#60a5fa" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">Grind 10 minutes</p>
                  <p className="text-caption text-gray-400">Guaranteed chest drop — your first loot</p>
                </div>
              </div>

              {/* Tips */}
              <div className="w-full rounded-card border border-white/8 bg-surface-1 divide-y divide-white/5 text-left">
                {TIPS.map((tip) => (
                  <div key={tip.text} className="flex items-center gap-2.5 px-3 py-2">
                    <tip.Icon size={12} color="#64748b" strokeWidth={1.75} className="shrink-0" />
                    <p className="text-caption text-gray-400">{tip.text}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setStep(2)}
                  className="px-3 py-2 rounded border border-white/10 text-gray-400 text-xs hover:border-white/20 transition-colors"
                >
                  ← Back
                </button>
                <motion.button
                  onClick={complete}
                  className="flex-1 py-2.5 rounded bg-accent text-white font-bold text-sm active:scale-[0.98] transition-transform"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Start grinding ⚔️
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  )
}
