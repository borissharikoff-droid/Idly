import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SKILLS, GRINDLY_PERK_TABLE, skillLevelFromXP, skillXPProgress, formatSkillTime, categoryToSkillId, getPrestigeCount, getPrestigeTier, canPrestige, prestigeSkill, PRESTIGE_TIERS } from '../../lib/skills'
import { computeWarriorBonuses } from '../../lib/combat'
import { useSessionStore } from '../../stores/sessionStore'
import { useCraftingStore } from '../../stores/craftingStore'
import { useCookingStore } from '../../stores/cookingStore'
import { MOTION } from '../../lib/motion'
import { SkeletonBlock } from '../shared/PageLoading'
import { EmptyState } from '../shared/EmptyState'

// ── Types ────────────────────────────────────────────────────────────────────

interface SkillRow {
  skill_id: string
  total_xp: number
}

interface AppStat {
  app_name: string
  category: string
  total_ms: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAppTime(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

function formatXP(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`
  return `${xp}`
}

const SKILL_VERB: Record<string, string> = {
  coding: 'coded',
  design: 'designed',
  games: 'played',
  social: 'chatted',
  browsing: 'browsed',
  creative: 'created',
  learning: 'studied',
  music: 'listened',
}

function skillVerb(category: string): string {
  return SKILL_VERB[category] ?? 'tracked'
}

// ── Skill grouping ──────────────────────────────────────────────────────────

const PRODUCTION_SKILL_IDS = new Set(['farmer', 'warrior', 'crafter', 'chef', 'grindly'])
const ACTIVITY_SKILLS = SKILLS.filter(s => !PRODUCTION_SKILL_IDS.has(s.id))
const PRODUCTION_SKILLS = SKILLS.filter(s => PRODUCTION_SKILL_IDS.has(s.id))

// ── Perk milestones per production skill ────────────────────────────────────

interface Milestone { level: number; label: string }

const SKILL_MILESTONES: Record<string, Milestone[]> = {
  farmer: [
    { level: 10, label: '-10% grow time · Plant All' },
    { level: 25, label: '-20% grow time · 15% bonus yield' },
    { level: 40, label: '-30% grow time' },
    { level: 45, label: 'Farmhouse unlock' },
    { level: 50, label: 'Compost All' },
    { level: 60, label: '-45% grow time · 45% bonus yield' },
    { level: 80, label: '-60% grow time' },
  ],
  warrior: [
    { level: 5, label: '+1 ATK' },
    { level: 15, label: '+5 HP' },
    { level: 20, label: '+1 ATK' },
    { level: 30, label: '+1 HP Regen' },
    { level: 40, label: '+2 ATK' },
    { level: 50, label: '+2 DEF' },
    { level: 60, label: '+10 HP' },
    { level: 75, label: '+3 ATK · +2 HP Regen' },
    { level: 80, label: '+3 DEF' },
  ],
  crafter: [
    { level: 10, label: '-10% craft time' },
    { level: 25, label: '-20% craft time · 15% double output' },
    { level: 40, label: '-30% craft time' },
    { level: 60, label: '-45% craft time · 45% double output' },
    { level: 80, label: '-60% craft time' },
  ],
  chef: [
    { level: 5, label: 'Unlock Pan' },
    { level: 10, label: '-10% cook time · Unlock Bowl' },
    { level: 15, label: 'Unlock Oven' },
    { level: 25, label: '-20% cook time · Unlock Mortar · 15% double' },
    { level: 40, label: '-30% cook time' },
    { level: 60, label: '-45% cook time · 45% double output' },
    { level: 80, label: '-60% cook time' },
  ],
  grindly: GRINDLY_PERK_TABLE.map(p => ({ level: p.level, label: p.label })),
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PrestigeBadge({ skillId, color, level }: { skillId: string; color: string; level: number }) {
  const prestige = getPrestigeCount(skillId)
  const tier = getPrestigeTier(skillId)
  const borderCol = tier ? tier.borderColor : `${color}20`
  const bgCol = tier ? `${tier.borderColor}10` : `${color}10`
  return (
    <div className="shrink-0 text-center ml-1">
      <div
        className="w-11 h-11 rounded-lg flex flex-col items-center justify-center relative"
        style={{ backgroundColor: bgCol, border: `1.5px solid ${borderCol}` }}
      >
        <span className="text-[10px] text-gray-500 font-mono leading-none">LVL</span>
        <span className="text-base font-mono font-bold leading-tight" style={{ color }}>{level}</span>
        {prestige > 0 && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] leading-none" title={`Prestige ${prestige}`}>
            {'★'.repeat(prestige)}
          </span>
        )}
      </div>
    </div>
  )
}

function PrestigeSection({ skillId, xp, color, onPrestige }: { skillId: string; xp: number; color: string; onPrestige: () => void }) {
  const prestige = getPrestigeCount(skillId)
  const tier = getPrestigeTier(skillId)
  const canDo = canPrestige(skillId, xp)
  if (prestige === 0 && !canDo) return null
  return (
    <div className="pt-2 border-t border-white/[0.04]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Prestige</span>
        <div className="flex items-center gap-1.5">
          {tier && (
            <span className="text-[10px] font-mono font-bold" style={{ color: tier.borderColor }}>
              {tier.label} {'★'.repeat(prestige)}
            </span>
          )}
          {prestige === 0 && <span className="text-[10px] text-gray-600 font-mono">None</span>}
        </div>
      </div>
      {prestige > 0 && (
        <p className="text-[9px] text-gray-500 font-mono mt-0.5">+{prestige * 2}% XP bonus active</p>
      )}
      {canDo && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrestige() }}
          className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition-colors"
          style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
        >
          Prestige (Reset to LVL 0 for +2% XP)
        </button>
      )}
    </div>
  )
}

/** Thin milestone track showing level 0–99 progress with perk markers. */
function MilestoneTrack({ level, milestones, color }: { level: number; milestones: Milestone[]; color: string }) {
  return (
    <div className="relative h-[3px] rounded-full bg-white/[0.03] mt-1.5">
      <div
        className="absolute h-full rounded-full opacity-20"
        style={{ backgroundColor: color, width: `${Math.min(100, (level / 99) * 100)}%` }}
      />
      {milestones.map(m => {
        const reached = level >= m.level
        return (
          <div
            key={m.level}
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(m.level / 99) * 100}%`,
              width: 5,
              height: 5,
              backgroundColor: reached ? color : '#4b5563',
              opacity: reached ? 0.7 : 0.35,
              transform: 'translate(-50%, -50%)',
            }}
            title={`LVL ${m.level}: ${m.label}`}
          />
        )
      })}
      {/* Current position indicator */}
      {level > 0 && level < 99 && (
        <div
          className="absolute top-1/2 rounded-full border"
          style={{
            left: `${(level / 99) * 100}%`,
            width: 7,
            height: 7,
            backgroundColor: color,
            borderColor: '#1e1e2e',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  )
}

/** Perk roadmap: shows next 3 upcoming milestones in expanded detail. */
function PerkRoadmap({ level, milestones, color }: { level: number; milestones: Milestone[]; color: string }) {
  const upcoming = milestones.filter(m => m.level > level)
  const reached = milestones.filter(m => m.level <= level)
  // Show up to 3: fill with most recent reached if fewer than 3 upcoming
  const fillCount = Math.max(0, 3 - upcoming.length)
  const display = [...reached.slice(-fillCount), ...upcoming.slice(0, 3)]
  if (display.length === 0) return null
  return (
    <div className="pt-2 border-t border-white/[0.04]">
      <span className="text-[10px] text-gray-500 font-mono uppercase">Perk milestones</span>
      <div className="mt-1.5 space-y-1">
        {display.map(m => {
          const done = level >= m.level
          const isNext = !done && upcoming[0]?.level === m.level
          return (
            <div key={m.level} className="flex items-center gap-2 text-[10px]">
              <span
                className={`font-mono w-7 text-right shrink-0 ${done ? 'text-gray-600' : isNext ? 'font-bold' : 'text-gray-400'}`}
                style={isNext ? { color } : undefined}
              >
                {m.level}
              </span>
              <span className={`${done ? 'text-gray-600' : isNext ? 'text-gray-300' : 'text-gray-500'}`}>
                {done ? '✓ ' : isNext ? '→ ' : ''}{m.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Floating "+N XP" ticker that animates on XP gain. */
function XpTicker({ amount, color, tickKey }: { amount: number; color: string; tickKey: number }) {
  if (amount <= 0) return null
  return (
    <motion.span
      key={tickKey}
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 0, y: -18 }}
      transition={{ duration: 1.8, ease: 'easeOut' }}
      className="absolute -top-1 right-12 text-[10px] font-mono font-bold pointer-events-none"
      style={{ color }}
    >
      +{amount} XP
    </motion.span>
  )
}

/** Section header divider between skill groups. */
function SectionHeader({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-1">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
        <span className="text-xs">{icon}</span> {label}
      </span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function SkillsPage() {
  const [skillData, setSkillData] = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [topAppsBySkill, setTopAppsBySkill] = useState<Record<string, { app_name: string; total_ms: number }[]>>({})
  const [topAppsLoadingBySkill, setTopAppsLoadingBySkill] = useState<Record<string, boolean>>({})
  const [prestigeConfirm, setPrestigeConfirm] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { status, currentActivity, sessionSkillXP } = useSessionStore()
  const craftXp = useCraftingStore((s) => s.craftXp)
  const hydrateCrafting = useCraftingStore((s) => s.hydrate)
  const cookXp = useCookingStore((s) => s.cookXp)
  const hydrateCooking = useCookingStore((s) => s.hydrate)
  const levelingSkillId = status === 'running' && currentActivity ? categoryToSkillId(currentActivity.category) : null
  const hasMountedRef = useRef(false)
  useEffect(() => { hasMountedRef.current = true }, [])
  useEffect(() => { hydrateCrafting() }, [hydrateCrafting])
  useEffect(() => { hydrateCooking() }, [hydrateCooking])

  // XP ticker state
  const prevSessionXPRef = useRef<Record<string, number>>({})
  const [xpTick, setXpTick] = useState<{ skillId: string; amount: number; key: number } | null>(null)

  useEffect(() => {
    if (status !== 'running' || !levelingSkillId) {
      prevSessionXPRef.current = {}
      return
    }
    const prev = prevSessionXPRef.current[levelingSkillId] ?? 0
    const cur = sessionSkillXP[levelingSkillId] ?? 0
    const delta = cur - prev
    if (delta > 0 && prev > 0) {
      setXpTick({ skillId: levelingSkillId, amount: delta, key: Date.now() })
    }
    prevSessionXPRef.current = { ...sessionSkillXP }
  }, [sessionSkillXP, levelingSkillId, status])

  const liveById = useMemo(() => {
    const base = new Map(skillData.map((r) => [r.skill_id, r.total_xp]))
    if (status === 'running') {
      for (const [id, xp] of Object.entries(sessionSkillXP)) {
        base.set(id, (base.get(id) ?? 0) + xp)
      }
    }
    base.set('crafter', craftXp)
    base.set('chef', cookXp)
    return base
  }, [skillData, status, sessionSkillXP, craftXp, cookXp])

  const handleToggleExpand = (skillId: string) => {
    const isExpanded = expandedId === skillId
    if (isExpanded) {
      setExpandedId(null)
      return
    }
    if (!topAppsBySkill[skillId]) {
      setTopAppsLoadingBySkill((prev) => ({ ...prev, [skillId]: true }))
    }
    setExpandedId(skillId)
  }

  const handlePrestige = (skillId: string) => {
    const result = prestigeSkill(skillId)
    if (result) {
      setPrestigeConfirm(null)
      setReloadKey((k) => k + 1)
    }
  }

  const load = async () => {
    setLoading(true)
    const api = window.electronAPI
    if (api?.db?.getAllSkillXP) {
      const rows = (await api.db.getAllSkillXP()) as SkillRow[]
      setSkillData(rows)
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
        setSkillData(Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp })))
      } catch {
        setSkillData([])
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [reloadKey])

  // Load top 3 apps for expanded skill
  useEffect(() => {
    if (!expandedId) return
    if (topAppsBySkill[expandedId]) return
    const skill = SKILLS.find((s) => s.id === expandedId)
    if (!skill) return
    if (skill.category === 'farming' || skill.category === 'crafting' || skill.category === 'warrior' || skill.category === 'cooking' || skill.category === 'grindly') return
    const api = window.electronAPI
    if (!api?.db?.getAppUsageStats) return
    setTopAppsLoadingBySkill((prev) => ({ ...prev, [expandedId]: true }))
    api.db.getAppUsageStats().then((raw) => {
      const apps = (raw as AppStat[]) || []
      const forCategory = apps
        .filter((a) => a.category === skill.category)
        .slice(0, 3)
        .map((a) => ({ app_name: a.app_name, total_ms: a.total_ms }))
      setTopAppsBySkill((prev) => ({ ...prev, [expandedId]: forCategory }))
    }).catch(() => {
      setTopAppsBySkill((prev) => ({ ...prev, [expandedId]: [] }))
    }).finally(() => {
      setTopAppsLoadingBySkill((prev) => ({ ...prev, [expandedId]: false }))
    })
  }, [expandedId, topAppsBySkill])

  const totalLevel = SKILLS.reduce((sum, s) => sum + skillLevelFromXP(liveById.get(s.id) ?? 0), 0)

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderExpandedDetails(skill: typeof SKILLS[0], xp: number, level: number) {
    const { current, needed } = skillXPProgress(xp)
    const milestones = SKILL_MILESTONES[skill.id]
    const isProduction = PRODUCTION_SKILL_IDS.has(skill.id)

    return (
      <div className="mx-1 px-3 py-2.5 rounded-b-xl bg-discord-card/50 border border-t-0 border-white/[0.04] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Next level</span>
          <span className="text-[11px] font-mono text-white">LVL {level + 1}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">XP remaining</span>
          <span className="text-[11px] font-mono" style={{ color: skill.color }}>{formatXP(needed - current)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Time to next</span>
          <span className="text-[11px] font-mono text-gray-300">
            {isProduction ? 'via in-game actions' : `~${Math.ceil((needed - current) / 3600)}h`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Total XP</span>
          <span className="text-[11px] font-mono text-gray-300">{formatXP(xp)}</span>
        </div>

        {/* Source / top apps section */}
        <div className="pt-2 border-t border-white/[0.04] min-h-[74px]">
          {skill.category === 'farming' ? (
            <>
              <span className="text-[10px] text-gray-500 font-mono uppercase">XP Source</span>
              <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">Earned by planting and harvesting crops in the Farm tab.</p>
              <p className="mt-0.5 text-[9px] text-gray-600 font-mono">Plant +10–160 XP · Harvest +50–800 XP</p>
            </>
          ) : skill.category === 'warrior' ? (() => {
            const wLevel = skillLevelFromXP(xp)
            const bonuses = computeWarriorBonuses(wLevel)
            const bonusParts = [bonuses.atk > 0 && `+${bonuses.atk} ATK`, bonuses.hp > 0 && `+${bonuses.hp} HP`, bonuses.hpRegen > 0 && `+${bonuses.hpRegen} Regen`, bonuses.def > 0 && `+${bonuses.def} DEF`].filter(Boolean)
            return (
              <>
                <span className="text-[10px] text-gray-500 font-mono uppercase">XP Source</span>
                <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">Earned by defeating enemies in the Arena.</p>
                <p className="mt-0.5 text-[9px] text-gray-600 font-mono">Mob +30–90K XP · Boss +120–15K XP</p>
                {bonusParts.length > 0 && (
                  <p className="mt-1.5 text-[10px] font-mono" style={{ color: '#EF4444' }}>Bonuses: {bonusParts.join(' · ')}</p>
                )}
              </>
            )
          })() : skill.category === 'crafting' ? (
            <>
              <span className="text-[10px] text-gray-500 font-mono uppercase">XP Source</span>
              <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">Earned by crafting items in the Craft tab.</p>
              <p className="mt-0.5 text-[9px] text-gray-600 font-mono">XP per craft varies by recipe tier</p>
            </>
          ) : skill.category === 'cooking' ? (
            <>
              <span className="text-[10px] text-gray-500 font-mono uppercase">XP Source</span>
              <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">Earned by cooking food in the Cook tab.</p>
              <p className="mt-0.5 text-[9px] text-gray-600 font-mono">XP per cook varies by recipe · Mastery grants bonus XP</p>
            </>
          ) : skill.category === 'grindly' ? (
            <>
              <span className="text-[10px] text-gray-500 font-mono uppercase">XP Source</span>
              <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">Earned passively based on total skill levels across all skills.</p>
            </>
          ) : (
            <>
              <span className="text-[10px] text-gray-500 font-mono uppercase">Top apps</span>
              {topAppsLoadingBySkill[skill.id] ? (
                <div className="mt-1.5 space-y-1.5">
                  {[1, 2, 3].map((row) => (
                    <div key={row} className="flex items-center justify-between">
                      <SkeletonBlock className="h-2.5 w-24" />
                      <SkeletonBlock className="h-2.5 w-10" />
                    </div>
                  ))}
                </div>
              ) : topAppsBySkill[skill.id] && topAppsBySkill[skill.id].length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {topAppsBySkill[skill.id].map((a) => (
                    <div key={a.app_name} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-300 truncate">{a.app_name}</span>
                      <span className="text-gray-500 font-mono shrink-0 ml-2">{formatAppTime(a.total_ms)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[10px] text-gray-600">No app data yet.</p>
              )}
            </>
          )}
        </div>

        {/* Perk roadmap (production skills only) */}
        {milestones && <PerkRoadmap level={level} milestones={milestones} color={skill.color} />}

        <PrestigeSection skillId={skill.id} xp={xp} color={skill.color} onPrestige={() => setPrestigeConfirm(skill.id)} />
      </div>
    )
  }

  function renderSkillCard(skill: typeof SKILLS[0], i: number, isLeveling: boolean) {
    const xp = liveById.get(skill.id) ?? 0
    const level = skillLevelFromXP(xp)
    const { current, needed } = skillXPProgress(xp)
    const pct = needed > 0 ? Math.min(100, (current / needed) * 100) : 100
    const timeStr = formatSkillTime(xp)
    const isExpanded = expandedId === skill.id
    const milestones = SKILL_MILESTONES[skill.id]
    const showTicker = isLeveling && xpTick && xpTick.skillId === skill.id

    // Check if next level is a perk milestone
    const nextIsMilestone = milestones?.some(m => m.level === level + 1)

    return (
      <motion.div
        key={skill.id}
        initial={hasMountedRef.current ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: hasMountedRef.current ? 0 : Math.min(i * MOTION.stagger.tight * 2, 0.2), duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
      >
        <button
          type="button"
          onClick={() => handleToggleExpand(skill.id)}
          className={`w-full rounded-xl border transition-all duration-200 text-left relative overflow-hidden group ${
            isLeveling
              ? 'bg-discord-card border-cyber-neon/40 shadow-[0_0_20px_rgba(0,255,136,0.08)]'
              : 'bg-discord-card/80 border-white/[0.06] hover:border-white/10'
          }`}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
            style={{ backgroundColor: skill.color, opacity: level > 1 ? 0.8 : 0.2 }}
          />

          <div className="pl-4 pr-3 py-3 flex items-center gap-3 relative">
            {/* Icon */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
              style={{ backgroundColor: `${skill.color}15`, border: `1px solid ${skill.color}30` }}
            >
              {skill.icon}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-semibold text-white truncate">{skill.name}</span>
                {isLeveling && (
                  <span
                    className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0"
                    style={{ backgroundColor: `${skill.color}25`, color: skill.color, border: `1px solid ${skill.color}40` }}
                  >
                    active
                  </span>
                )}
                {nextIsMilestone && !isLeveling && (
                  <span className="text-[8px] font-mono text-amber-400/70 shrink-0" title={`LVL ${level + 1} unlocks a perk`}>★</span>
                )}
              </div>
              {/* XP bar */}
              <div className="relative">
                <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: skill.color }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </div>
                {/* Milestone star at bar end when next level is milestone */}
                {nextIsMilestone && (
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: '#fbbf24', boxShadow: '0 0 4px #fbbf2480' }}
                    title={`LVL ${level + 1}: ${milestones?.find(m => m.level === level + 1)?.label}`}
                  />
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-500 font-mono">{formatXP(current)} / {formatXP(needed)} XP</span>
                <span className="text-[10px] text-gray-600 font-mono">
                  {PRODUCTION_SKILL_IDS.has(skill.id) ? `${formatXP(xp)} XP` : `${timeStr} ${skillVerb(skill.category)}`}
                </span>
              </div>
              {/* Milestone track for production skills */}
              {milestones && <MilestoneTrack level={level} milestones={milestones} color={skill.color} />}
            </div>

            {/* Level badge */}
            <PrestigeBadge skillId={skill.id} color={skill.color} level={level} />

            {/* Live XP ticker */}
            <AnimatePresence>
              {showTicker && <XpTicker amount={xpTick.amount} color={skill.color} tickKey={xpTick.key} />}
            </AnimatePresence>
          </div>
        </button>

        {/* Expanded details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
              className="overflow-hidden"
            >
              {renderExpandedDetails(skill, xp, level)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 pb-20 max-w-lg mx-auto">
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-discord-card/70 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <SkeletonBlock className="w-8 h-8" />
                <div className="space-y-1.5">
                  <SkeletonBlock className="h-4 w-20" />
                  <SkeletonBlock className="h-2.5 w-28" />
                </div>
              </div>
              <div className="space-y-1.5">
                <SkeletonBlock className="h-5 w-8" />
                <SkeletonBlock className="h-2.5 w-12" />
              </div>
            </div>
          </div>
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="rounded-xl border border-white/10 bg-discord-card/70 p-3">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="w-10 h-10" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="h-1.5 w-full" />
                  <div className="flex items-center justify-between">
                    <SkeletonBlock className="h-2.5 w-24" />
                    <SkeletonBlock className="h-2.5 w-16" />
                  </div>
                </div>
                <SkeletonBlock className="w-11 h-11" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  const activeSkill = levelingSkillId ? SKILLS.find(s => s.id === levelingSkillId) : null
  const activitySkillsFiltered = ACTIVITY_SKILLS.filter(s => s.id !== levelingSkillId)
  const productionSkillsFiltered = PRODUCTION_SKILLS.filter(s => s.id !== levelingSkillId)

  return (
    <motion.div
      initial={MOTION.page.initial}
      animate={MOTION.page.animate}
      exit={MOTION.page.exit}
      className="p-4 pb-20 max-w-lg mx-auto overflow-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyber-neon/20 to-cyber-neon/5 border border-cyber-neon/30 flex items-center justify-center">
            <span className="text-cyber-neon text-sm">⚔</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Skills</h1>
            <p className="text-[10px] text-gray-500 font-mono">LEVEL UP YOUR CRAFT</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-cyber-neon font-mono text-lg font-bold leading-tight">{totalLevel}</p>
          <p className="text-[10px] text-gray-500 font-mono">TOTAL LVL</p>
        </div>
      </div>

      {/* Empty state */}
      {!levelingSkillId && totalLevel <= 8 && skillData.length === 0 && (
        <EmptyState title="No skill XP yet" description="Start a grind and work in your apps to level up skills." icon="⚔" className="mb-4" />
      )}

      {/* Active skill — always on top */}
      {activeSkill && (
        <div className="mb-4">
          {renderSkillCard(activeSkill, 0, true)}
        </div>
      )}

      {/* Activity Skills section */}
      {activitySkillsFiltered.length > 0 && (
        <>
          <SectionHeader label="Activity Skills" icon="📊" />
          <div className="space-y-2.5 mb-4">
            {activitySkillsFiltered.map((skill, i) => renderSkillCard(skill, i, false))}
          </div>
        </>
      )}

      {/* Production Skills section */}
      {productionSkillsFiltered.length > 0 && (
        <>
          <SectionHeader label="Production Skills" icon="⚒️" />
          <div className="space-y-2.5">
            {productionSkillsFiltered.map((skill, i) => renderSkillCard(skill, i, false))}
          </div>
        </>
      )}

      {/* Prestige confirmation modal */}
      <AnimatePresence>
        {prestigeConfirm && (() => {
          const skill = SKILLS.find((s) => s.id === prestigeConfirm)
          if (!skill) return null
          const nextPrestige = getPrestigeCount(prestigeConfirm) + 1
          const nextTier = PRESTIGE_TIERS[nextPrestige - 1]
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setPrestigeConfirm(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-discord-card rounded-xl border border-white/10 p-5 max-w-xs w-full space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <span className="text-2xl">{skill.icon}</span>
                  <h3 className="text-sm font-bold text-white mt-1">Prestige {skill.name}?</h3>
                  {nextTier && (
                    <p className="text-[11px] font-mono mt-1" style={{ color: nextTier.borderColor }}>
                      {nextTier.label} Tier {'★'.repeat(nextPrestige)}
                    </p>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 space-y-1">
                  <p>This will <span className="text-red-400 font-bold">reset your {skill.name} to LVL 0</span>.</p>
                  <p>You gain a permanent <span className="text-cyber-neon font-bold">+2% XP bonus</span> for this skill.</p>
                  {nextTier?.reward && (
                    <p>Reward: <span className="text-white">{nextTier.reward.label}</span></p>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPrestigeConfirm(null)}
                    className="flex-1 py-2 rounded-lg text-[11px] font-mono text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrestige(prestigeConfirm)}
                    className="flex-1 py-2 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition-colors"
                    style={{ backgroundColor: `${skill.color}25`, color: skill.color, border: `1px solid ${skill.color}40` }}
                  >
                    Prestige
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </motion.div>
  )
}
