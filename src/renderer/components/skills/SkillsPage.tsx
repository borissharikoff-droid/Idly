import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SKILLS, skillLevelFromXP, skillXPProgress, formatSkillTime, categoryToSkillId } from '../../lib/skills'
import { useSessionStore } from '../../stores/sessionStore'

interface SkillRow {
  skill_id: string
  total_xp: number
}

interface AppStat {
  app_name: string
  category: string
  total_ms: number
}

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

export function SkillsPage() {
  const [skillData, setSkillData] = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [topAppsBySkill, setTopAppsBySkill] = useState<Record<string, { app_name: string; total_ms: number }[]>>({})
  const { status, currentActivity, sessionSkillXP } = useSessionStore()
  const levelingSkillId = status === 'running' && currentActivity ? categoryToSkillId(currentActivity.category) : null
  const hasMountedRef = useRef(false)
  useEffect(() => { hasMountedRef.current = true }, [])

  const liveById = useMemo(() => {
    const base = new Map(skillData.map((r) => [r.skill_id, r.total_xp]))
    if (status === 'running') {
      for (const [id, xp] of Object.entries(sessionSkillXP)) {
        base.set(id, (base.get(id) ?? 0) + xp)
      }
    }
    return base
  }, [skillData, status, sessionSkillXP])

  const load = async () => {
    setLoading(true)
    const api = window.electronAPI
    if (api?.db?.getAllSkillXP) {
      const rows = (await api.db.getAllSkillXP()) as SkillRow[]
      setSkillData(rows)
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('idly_skill_xp') || '{}') as Record<string, number>
        setSkillData(Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp })))
      } catch {
        setSkillData([])
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Load top 3 apps for expanded skill
  useEffect(() => {
    if (!expandedId) return
    const skill = SKILLS.find((s) => s.id === expandedId)
    if (!skill) return
    const api = window.electronAPI
    if (!api?.db?.getAppUsageStats) return
    api.db.getAppUsageStats().then((raw) => {
      const apps = (raw as AppStat[]) || []
      const forCategory = apps
        .filter((a) => a.category === skill.category)
        .slice(0, 3)
        .map((a) => ({ app_name: a.app_name, total_ms: a.total_ms }))
      setTopAppsBySkill((prev) => ({ ...prev, [expandedId]: forCategory }))
    }).catch(() => {})
  }, [expandedId])

  const totalLevel = SKILLS.reduce((sum, s) => sum + skillLevelFromXP(liveById.get(s.id) ?? 0), 0)

  // Active skill on top, rest below
  const levelingFirst = levelingSkillId
    ? [...SKILLS.filter((s) => s.id === levelingSkillId), ...SKILLS.filter((s) => s.id !== levelingSkillId)]
    : SKILLS

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <span className="text-gray-600 text-sm font-mono animate-pulse">Loading skills...</span>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
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
          <p className="text-[10px] text-gray-500 font-mono">TOTAL LV</p>
        </div>
      </div>

      {/* Empty state */}
      {!levelingSkillId && totalLevel <= 8 && skillData.length === 0 && (
        <div className="rounded-xl bg-discord-card/60 border border-white/5 p-5 text-center mb-4">
          <span className="text-2xl block mb-2">⚔</span>
          <p className="text-gray-400 text-sm font-medium mb-1">No skill XP yet</p>
          <p className="text-gray-600 text-xs">Start a grind and work in your apps to level up skills.</p>
        </div>
      )}

      {/* Leveling skill — on top when active */}
      {levelingSkillId && (() => {
        const skill = SKILLS.find((s) => s.id === levelingSkillId)
        if (!skill) return null
        const xp = liveById.get(skill.id) ?? 0
        const level = skillLevelFromXP(xp)
        const { current, needed } = skillXPProgress(xp)
        const pct = needed > 0 ? Math.min(100, (current / needed) * 100) : 100
        const timeStr = formatSkillTime(xp)
        const isExpanded = expandedId === skill.id
        return (
          <div className="mb-4">
            <motion.div
              key={skill.id}
              initial={hasMountedRef.current ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                className="w-full rounded-xl border transition-all duration-200 text-left relative overflow-hidden group bg-discord-card border-cyber-neon/40 shadow-[0_0_20px_rgba(0,255,136,0.08)]"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                  style={{ backgroundColor: skill.color, opacity: level > 1 ? 0.8 : 0.2 }}
                />
                <div className="pl-4 pr-3 py-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                    style={{ backgroundColor: `${skill.color}15`, border: `1px solid ${skill.color}30` }}
                  >
                    {skill.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-white truncate">{skill.name}</span>
                      <span
                        className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0"
                        style={{ backgroundColor: `${skill.color}25`, color: skill.color, border: `1px solid ${skill.color}40` }}
                      >
                        active
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ backgroundColor: skill.color, width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-500 font-mono">{formatXP(current)} / {formatXP(needed)} XP</span>
                      <span className="text-[10px] text-gray-600 font-mono">{timeStr} played</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-center ml-1">
                    <div
                      className="w-11 h-11 rounded-lg flex flex-col items-center justify-center"
                      style={{ backgroundColor: `${skill.color}10`, border: `1px solid ${skill.color}20` }}
                    >
                      <span className="text-[10px] text-gray-500 font-mono leading-none">LV</span>
                      <span className="text-base font-mono font-bold leading-tight" style={{ color: skill.color }}>{level}</span>
                    </div>
                  </div>
                </div>
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mx-1 px-3 py-2.5 rounded-b-xl bg-discord-card/50 border border-t-0 border-white/[0.04] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Next level</span>
                        <span className="text-[11px] font-mono text-white">Lv.{level + 1}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">XP remaining</span>
                        <span className="text-[11px] font-mono" style={{ color: skill.color }}>{formatXP(needed - current)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Time to next</span>
                        <span className="text-[11px] font-mono text-gray-300">~{Math.ceil((needed - current) / 3600)}h</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Total XP</span>
                        <span className="text-[11px] font-mono text-gray-300">{formatXP(xp)}</span>
                      </div>
                      {topAppsBySkill[skill.id] && topAppsBySkill[skill.id].length > 0 && (
                        <div className="pt-2 border-t border-white/[0.04]">
                          <span className="text-[10px] text-gray-500 font-mono uppercase">Top apps</span>
                          <div className="mt-1.5 space-y-1">
                            {topAppsBySkill[skill.id].map((a, i) => (
                              <div key={a.app_name} className="flex items-center justify-between text-[11px]">
                                <span className="text-gray-300 truncate">{a.app_name}</span>
                                <span className="text-gray-500 font-mono shrink-0 ml-2">{formatAppTime(a.total_ms)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )
      })()}

      {/* Separator when leveling */}
      {levelingSkillId && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Other skills</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      )}

      {/* Rest of skills */}
      <div className="space-y-2.5">
        {levelingFirst
          .filter((s) => s.id !== levelingSkillId)
          .map((skill, i) => {
          const xp = liveById.get(skill.id) ?? 0
          const level = skillLevelFromXP(xp)
          const { current, needed } = skillXPProgress(xp)
          const pct = needed > 0 ? Math.min(100, (current / needed) * 100) : 100
          const timeStr = formatSkillTime(xp)
          const isExpanded = expandedId === skill.id
          const isLeveling = levelingSkillId === skill.id

          return (
            <motion.div
              key={skill.id}
              initial={hasMountedRef.current ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: hasMountedRef.current ? 0 : Math.min(i * 0.04, 0.2), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                className={`w-full rounded-xl border transition-all duration-200 text-left relative overflow-hidden group ${
                  isLeveling
                    ? 'bg-discord-card border-cyber-neon/40 shadow-[0_0_20px_rgba(0,255,136,0.08)]'
                    : 'bg-discord-card/80 border-white/[0.06] hover:border-white/10'
                }`}
              >
                {/* Subtle gradient accent on the left */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                  style={{ backgroundColor: skill.color, opacity: level > 1 ? 0.8 : 0.2 }}
                />

                <div className="pl-4 pr-3 py-3 flex items-center gap-3">
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
                    </div>
                    {/* XP bar */}
                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ backgroundColor: skill.color, width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-500 font-mono">{formatXP(current)} / {formatXP(needed)} XP</span>
                      <span className="text-[10px] text-gray-600 font-mono">{timeStr} played</span>
                    </div>
                  </div>

                  {/* Level badge */}
                  <div className="shrink-0 text-center ml-1">
                    <div
                      className="w-11 h-11 rounded-lg flex flex-col items-center justify-center"
                      style={{ backgroundColor: `${skill.color}10`, border: `1px solid ${skill.color}20` }}
                    >
                      <span className="text-[10px] text-gray-500 font-mono leading-none">LV</span>
                      <span className="text-base font-mono font-bold leading-tight" style={{ color: skill.color }}>{level}</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mx-1 px-3 py-2.5 rounded-b-xl bg-discord-card/50 border border-t-0 border-white/[0.04] space-y-2">
                      {/* Progress details */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Next level</span>
                        <span className="text-[11px] font-mono text-white">Lv.{level + 1}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">XP remaining</span>
                        <span className="text-[11px] font-mono" style={{ color: skill.color }}>{formatXP(needed - current)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Time to next</span>
                        <span className="text-[11px] font-mono text-gray-300">~{Math.ceil((needed - current) / 3600)}h</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Total XP</span>
                        <span className="text-[11px] font-mono text-gray-300">{formatXP(xp)}</span>
                      </div>
                      {topAppsBySkill[skill.id] && topAppsBySkill[skill.id].length > 0 && (
                        <div className="pt-2 border-t border-white/[0.04]">
                          <span className="text-[10px] text-gray-500 font-mono uppercase">Top apps</span>
                          <div className="mt-1.5 space-y-1">
                            {topAppsBySkill[skill.id].map((a) => (
                              <div key={a.app_name} className="flex items-center justify-between text-[11px]">
                                <span className="text-gray-300 truncate">{a.app_name}</span>
                                <span className="text-gray-500 font-mono shrink-0 ml-2">{formatAppTime(a.total_ms)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
