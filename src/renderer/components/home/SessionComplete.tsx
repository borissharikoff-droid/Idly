import { useEffect, useMemo, useState, useRef } from 'react'
import { fmt } from '../../lib/format'
import { motion } from 'framer-motion'
import { useSessionStore, type SkillXPGain } from '../../stores/sessionStore'
import { getDailyActivities } from '../../services/dailyActivityService'
import { useAlertStore } from '../../stores/alertStore'
import { useAuthStore } from '../../stores/authStore'
import { ConfettiEffect } from '../animations/ConfettiEffect'
import { playClickSound, playLevelUpSound, playXpRevealSound } from '../../lib/sounds'
import { getSkillById, skillXPProgress } from '../../lib/skills'
import { MOTION } from '../../lib/motion'

const AUTO_DISMISS_MS = 20000
const CARD_STAGGER_MS = 190
const XP_COUNT_MS = 950
const CARDS_START_MS = 480

interface SessionCompleteProps {
  onNavigateFriends?: () => void
  hasFriends?: boolean
}

function useCountUp(target: number, durationMs: number, delayMs: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    setValue(0)
    if (target <= 0) return
    let rafId: number
    const timer = setTimeout(() => {
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min((now - start) / durationMs, 1)
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
        setValue(Math.round(eased * target))
        if (p < 1) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }, delayMs)
    return () => { clearTimeout(timer); cancelAnimationFrame(rafId) }
  }, [target, durationMs, delayMs])
  return value
}

function SkillXPCard({ gain, index }: { gain: SkillXPGain; index: number }) {
  const skill = getSkillById(gain.skillId)
  if (!skill) return null

  const leveledUp = gain.levelAfter > gain.levelBefore
  const delayMs = CARDS_START_MS + index * CARD_STAGGER_MS
  const xpDisplayed = useCountUp(gain.xp, XP_COUNT_MS, delayMs + 60)

  const afterProgress = skillXPProgress(gain.totalXpAfter)
  const widthAfter = afterProgress.needed > 0
    ? Math.min((afterProgress.current / afterProgress.needed) * 100, 100)
    : 100

  useEffect(() => {
    const t = setTimeout(() => {
      if (leveledUp) playLevelUpSound()
      else playXpRevealSound()
    }, delayMs)
    return () => clearTimeout(t)
  }, [delayMs, leveledUp])

  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delayMs / 1000, duration: 0.32, ease: MOTION.easing }}
      className={`relative overflow-hidden rounded border px-3 py-2.5 ${
        leveledUp
          ? 'border-accent/50 bg-accent/[0.05] shadow-[0_0_18px_rgba(88,101,242,0.10)]'
          : 'border-white/[0.07] bg-surface-1/60'
      }`}
    >
      {/* level-up radial flash */}
      {leveledUp && (
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.65, delay: (delayMs + 180) / 1000 }}
          style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,255,136,0.20) 0%, transparent 70%)' }}
        />
      )}

      <div className="flex items-center gap-2.5">
        <motion.span
          className="text-xl leading-none shrink-0"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: (delayMs - 40) / 1000, ...MOTION.spring.pop }}
        >
          {skill.icon}
        </motion.span>

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-white truncate">{skill.name}</span>
              {leveledUp && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: (delayMs + 380) / 1000, ...MOTION.spring.pop }}
                  className="shrink-0 text-micro font-bold px-1.5 py-0.5 rounded-full border border-accent/50 text-accent bg-accent/15 leading-tight"
                >
                  LVL UP
                </motion.span>
              )}
            </div>
            <span className="text-xs font-mono font-bold text-accent tabular-nums shrink-0">
              +{fmt(xpDisplayed)}
            </span>
          </div>

          {/* XP bar */}
          <div className="h-1.5 rounded-full bg-surface-0/80 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: skill.color }}
              initial={{ width: '0%' }}
              animate={{ width: `${widthAfter}%` }}
              transition={{ delay: (delayMs + 100) / 1000, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          {/* Level / percent */}
          <div className="flex justify-between items-center mt-1">
            <span className="text-micro font-mono text-gray-600">
              {leveledUp ? `Lvl.${gain.levelBefore} → Lvl.${gain.levelAfter}` : `Lvl.${gain.levelAfter}`}
            </span>
            <span className="text-micro font-mono text-gray-600">{Math.round(widthAfter)}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function SessionComplete({ onNavigateFriends, hasFriends }: SessionCompleteProps = {}) {
  const { lastSessionSummary, skillXPGains, streakMultiplier, sessionSkillXPEarned, sessionRewards, newAchievements, dismissComplete } =
    useSessionStore()
  const hasLootOpen = useAlertStore((s) => s.currentAlert !== null)
  const user = useAuthStore((s) => s.user)
  const showFriendsCTA = useMemo(
    () => user && !hasFriends && onNavigateFriends,
    [user, hasFriends, onNavigateFriends],
  )
  const [progress, setProgress] = useState(100)
  const elapsedRef = useRef(0)

  const totalXP = useMemo(() => skillXPGains.reduce((s, g) => s + g.xp, 0), [skillXPGains])
  const animatedTotal = useCountUp(totalXP, 1000, 220)

  // Daily quest snapshot taken at session-complete time (synchronous localStorage read)
  const { dailyDone, dailyTotal } = useMemo(() => {
    const daily = getDailyActivities()
    return { dailyDone: daily.filter((q) => q.completed).length, dailyTotal: daily.length }
  }, [])

  // Find the skill closest to leveling up that didn't level up this session
  const coachingTip = useMemo(() => {
    const candidates = skillXPGains
      .filter((g) => g.levelAfter < 99)
      .map((g) => {
        const prog = skillXPProgress(g.totalXpAfter)
        const pct = prog.needed > 0 ? prog.current / prog.needed : 0
        return { skillId: g.skillId, level: g.levelAfter, xpNeeded: prog.needed - prog.current, pct }
      })
      .filter((g) => g.pct >= 0.5 && g.pct < 1)
      .sort((a, b) => b.pct - a.pct)
    return candidates[0] ?? null
  }, [skillXPGains])

  useEffect(() => {
    const interval = setInterval(() => {
      if (hasLootOpen) return
      elapsedRef.current += 50
      const remaining = Math.max(0, 100 - (elapsedRef.current / AUTO_DISMISS_MS) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        dismissComplete()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [dismissComplete, hasLootOpen])

  const handleDismiss = () => {
    playClickSound()
    dismissComplete()
  }

  const handleCTAClick = (navigate?: () => void) => {
    playClickSound()
    dismissComplete()
    navigate?.()
  }

  return (
    <>
      <ConfettiEffect />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
        className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.88, opacity: 0, y: 18 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={MOTION.spring.soft}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[320px] max-h-[86vh] rounded-card bg-surface-2 border border-accent/25 shadow-[0_0_48px_rgba(88,101,242,0.10)] overflow-hidden flex flex-col"
        >
          <div className="overflow-y-auto overflow-x-hidden px-5 pt-5 pb-3 space-y-3 min-h-0">
            {/* Header */}
            <div className="text-center">
              <motion.div
                className="text-3xl mb-1.5"
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={MOTION.spring.pop}
              >
                🎉
              </motion.div>
              <h3 className="text-base font-bold text-accent">GG, grind complete!</h3>
              {lastSessionSummary && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: MOTION.duration.base }}
                  className="text-white text-xl font-mono font-bold mt-0.5 tabular-nums"
                >
                  {lastSessionSummary.durationFormatted}
                </motion.p>
              )}

              {/* Total XP pill */}
              {sessionSkillXPEarned > 0 && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.18, ...MOTION.spring.soft }}
                  className="inline-flex items-center gap-2 mt-2.5 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/25"
                >
                  <span className="text-caption text-gray-400 font-medium">Total earned</span>
                  <span className="text-sm font-mono font-bold text-accent tabular-nums">
                    +{fmt(animatedTotal)} XP
                  </span>
                  {streakMultiplier > 1 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.4, ...MOTION.spring.pop }}
                      className="text-micro font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    >
                      🔥 ×{streakMultiplier}
                    </motion.span>
                  )}
                </motion.div>
              )}
            </div>

            {/* Skill XP cards */}
            {skillXPGains.length > 0 && (
              <div className="space-y-2">
                {skillXPGains.map((g, i) => (
                  <SkillXPCard key={g.skillId} gain={g} index={i} />
                ))}
              </div>
            )}

            {/* New achievements unlocked this session */}
            {newAchievements.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-1.5"
              >
                <p className="text-micro font-mono text-amber-400/60 uppercase tracking-widest text-center">
                  Achievement{newAchievements.length > 1 ? 's' : ''} unlocked
                </p>
                {newAchievements.map((ach, i) => (
                  <motion.div
                    key={ach.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.75 + i * 0.1, duration: 0.28 }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded border border-amber-400/20 bg-amber-400/[0.05]"
                  >
                    <span className="text-base shrink-0">🏆</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-caption font-semibold text-amber-300 truncate">{ach.name}</div>
                      <div className="text-micro text-gray-500 truncate">{ach.description}</div>
                    </div>
                    {ach.xpReward > 0 && (
                      <span className="text-micro font-mono text-accent shrink-0">+{ach.xpReward}</span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Rewards */}
            {sessionRewards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="flex flex-wrap justify-center gap-1"
              >
                {sessionRewards.map((reward, i) => (
                  <span
                    key={i}
                    className="text-micro px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent"
                  >
                    {reward.avatar && reward.avatar} {reward.title && `"${reward.title}"`}
                  </span>
                ))}
              </motion.div>
            )}

            {/* Coaching tip — closest skill to next level */}
            {coachingTip && (() => {
              const skill = getSkillById(coachingTip.skillId)
              if (!skill) return null
              const mins = Math.ceil(coachingTip.xpNeeded / 60)
              return (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 }}
                  className="text-center"
                >
                  <span className="text-micro font-mono text-gray-600">
                    {skill.icon} {skill.name} Lv.{coachingTip.level} — {fmt(coachingTip.xpNeeded)} XP away (≈{mins}m)
                  </span>
                </motion.div>
              )
            })()}

            {/* Daily quest progress */}
            {dailyTotal > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
                className="text-center"
              >
                <span className="text-micro font-mono text-gray-600">
                  {dailyDone === dailyTotal
                    ? `✓ All ${dailyTotal} daily quests done`
                    : `${dailyDone}/${dailyTotal} daily quests · ${dailyTotal - dailyDone} left`}
                </span>
              </motion.div>
            )}

            {/* CTAs */}
            {showFriendsCTA && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="flex flex-wrap justify-center gap-2"
              >
                <button
                  onClick={() => handleCTAClick(onNavigateFriends)}
                  className="px-3 py-1.5 rounded bg-accent/10 border border-accent/25 text-accent text-caption font-medium hover:bg-accent/20 transition-colors"
                >
                  👥 Add a friend
                </button>
              </motion.div>
            )}
          </div>

          {/* Sticky bottom: button + auto-dismiss bar */}
          <div className="shrink-0 px-5 pb-4 pt-2 border-t border-white/[0.05]">
            <motion.button
              onClick={handleDismiss}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="w-full py-2 rounded bg-accent/12 border border-accent/30 text-accent text-xs font-bold hover:bg-accent/20 transition-colors"
            >
              ✓ nice
            </motion.button>
          </div>
          <div className="h-0.5 bg-surface-0/50 shrink-0">
            <div
              className="h-full bg-accent/50 transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}
