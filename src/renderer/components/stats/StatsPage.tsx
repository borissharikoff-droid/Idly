import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SessionDetail } from './SessionDetail'
import { detectPersona, generateInsights } from '../../lib/persona'
import type { Insight } from '../../lib/persona'

export interface SessionRecord {
  id: string
  start_time: number
  end_time: number
  duration_seconds: number
  summary: string | null
}

interface AppStat {
  app_name: string
  category: string
  total_ms: number
}

interface CatStat {
  category: string
  total_ms: number
}

interface WindowStat {
  app_name: string
  window_title: string
  category: string
  total_ms: number
}

interface HourlyStat {
  hour: number
  total_ms: number
}

/** Exclude the Idly app from stats */
function isIdlyApp(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const n = name.toLowerCase()
  return n.includes('grinder') || n.includes('idly') || n === 'grind tracker' || n === 'grind_tracker'
}

const CATEGORY_COLORS: Record<string, string> = {
  coding: '#00ff88',
  design: '#ff6b9d',
  creative: '#e879f9',
  learning: '#facc15',
  music: '#5865F2',
  games: '#ed4245',
  social: '#faa61a',
  browsing: '#57F287',
  other: '#99aab5',
}

const CATEGORY_EMOJI: Record<string, string> = {
  coding: '💻',
  design: '🎨',
  creative: '🎬',
  learning: '📚',
  music: '🎵',
  games: '🎮',
  social: '💬',
  browsing: '🌐',
  other: '📱',
}

const CATEGORY_LABELS: Record<string, string> = {
  coding: 'Code Editor',
  design: 'Design',
  creative: 'Creative',
  learning: 'Learning',
  music: 'Music',
  games: 'Games',
  social: 'Social',
  browsing: 'Browsing',
  other: 'Other',
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatMs(ms: number): string {
  return formatDuration(Math.round(ms / 1000))
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

type TimeFilter = 'today' | 'week' | 'all'

function getFilterMs(filter: TimeFilter): number {
  if (filter === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (filter === 'week') return Date.now() - 7 * 86400000
  return 0
}

export function StatsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TimeFilter>('all')

  const [totalSessions, setTotalSessions] = useState(0)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [appUsage, setAppUsage] = useState<AppStat[]>([])
  const [categoryStats, setCategoryStats] = useState<CatStat[]>([])
  const [contextSwitches, setContextSwitches] = useState(0)
  const [streak, setStreak] = useState(0)
  const [insights, setInsights] = useState<Insight[]>([])
  const [windowStats, setWindowStats] = useState<WindowStat[]>([])
  const [hourly, setHourly] = useState<HourlyStat[]>([])
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    const sinceMs = getFilterMs(filter)
    const api = window.electronAPI

    if (api?.db) {
      const [sessionsData, apps, cats, switches, sessionCount, secs, streakVal, winStats, hourlyData, keys] = await Promise.all([
        api.db.getSessions(50),
        api.db.getAppUsageStats(sinceMs),
        api.db.getCategoryStats(sinceMs),
        api.db.getContextSwitchCount(sinceMs),
        api.db.getSessionCount(sinceMs),
        api.db.getTotalSeconds(sinceMs),
        api.db.getStreak(),
        api.db.getWindowTitleStats(sinceMs),
        api.db.getHourlyDistribution(sinceMs),
        api.db.getTotalKeystrokes(sinceMs),
      ])

      const allSessions = (sessionsData as SessionRecord[]) || []
      const filteredSessions = sinceMs > 0 ? allSessions.filter((s) => s.start_time >= sinceMs) : allSessions

      setSessions(filteredSessions)
      const filteredApps = ((apps as AppStat[]) || []).filter((a) => !isIdlyApp(a.app_name))
      setAppUsage(filteredApps)
      setCategoryStats((cats as CatStat[]) || [])
      setContextSwitches(switches as number)
      setTotalSessions(sessionCount as number)
      setTotalSeconds(secs as number)
      setStreak(streakVal as number)
      setWindowStats(((winStats as WindowStat[]) || []).filter((w) => !isIdlyApp(w.app_name)))
      setHourly((hourlyData as HourlyStat[]) || [])
      setTotalKeystrokes(keys as number)

      setInsights(generateInsights({
        appUsage: filteredApps,
        categoryStats: (cats as CatStat[]) || [],
        contextSwitches: switches as number,
        totalSessions: sessionCount as number,
        totalSeconds: secs as number,
        streak: streakVal as number,
      }))
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('idly_sessions') || '[]') as SessionRecord[]
        const filtered = sinceMs > 0 ? stored.filter((s) => s.start_time >= sinceMs) : stored
        setSessions(filtered)
        setTotalSessions(filtered.length)
        setTotalSeconds(filtered.reduce((sum, s) => sum + s.duration_seconds, 0))
      } catch { /* ignore */ }
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [filter])

  const persona = detectPersona(categoryStats)
  const totalCatMs = categoryStats.reduce((s, c) => s + c.total_ms, 0)
  const avgSessionMin = totalSessions > 0 ? Math.round(totalSeconds / totalSessions / 60) : 0

  // Build deep breakdown: category -> apps -> window titles
  const categoryGroups = categoryStats.map((cat) => {
    const apps = appUsage.filter((a) => a.category === cat.category)
    const appsWithTitles = apps.map((app) => {
      const titles = windowStats
        .filter((w) => w.app_name === app.app_name && w.category === cat.category)
        .slice(0, 5)
      return { ...app, titles }
    })
    const pct = totalCatMs > 0 ? (cat.total_ms / totalCatMs) * 100 : 0
    return {
      ...cat,
      pct,
      label: CATEGORY_LABELS[cat.category] || cat.category,
      emoji: CATEGORY_EMOJI[cat.category] || '📱',
      color: CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.other,
      apps: appsWithTitles,
    }
  })

  // Hourly chart data
  const maxHourMs = Math.max(...hourly.map((h) => h.total_ms), 1)

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 text-gray-500 text-sm font-mono animate-pulse">
        Loading...
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="p-4 pb-2 space-y-3"
    >
      <AnimatePresence mode="wait">
        {selectedId ? (
          <motion.div key="detail" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <SessionDetail sessionId={selectedId} onBack={() => setSelectedId(null)} />
          </motion.div>
        ) : (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Stats</h2>
                {totalSessions > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-discord-card border border-white/10 text-gray-400 font-mono">
                    {persona.emoji} {persona.label}
                  </span>
                )}
              </div>
              <button onClick={() => loadData()} className="w-7 h-7 rounded-lg bg-discord-card border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors" title="Refresh">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            </div>

            {/* Time filter */}
            <div className="flex gap-1.5">
              {(['today', 'week', 'all'] as TimeFilter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-mono transition-all ${filter === f ? 'bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon' : 'bg-discord-card border border-white/5 text-gray-500 hover:text-white'}`}>
                  {f === 'today' ? 'Today' : f === 'week' ? '7 days' : 'All time'}
                </button>
              ))}
            </div>

            {/* Overview — single block */}
            <div className="rounded-xl bg-discord-card border border-white/10 p-3">
              <p className="text-sm text-white font-medium">
                {totalSessions > 0 ? (
                  <>
                    <span className="font-mono text-cyber-neon">{totalSessions}</span> grinds
                    <span className="text-gray-500 mx-1.5">·</span>
                    <span className="font-mono text-cyber-neon">{formatDuration(totalSeconds)}</span> total
                    {streak > 0 && (
                      <>
                        <span className="text-gray-500 mx-1.5">·</span>
                        <span className="font-mono text-cyber-neon">{streak}</span> day streak
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-gray-500">No grinds in this period</span>
                )}
              </p>
              {totalSessions > 0 && (
                <p className="text-[10px] text-gray-500 mt-1 font-mono">
                  ~{avgSessionMin} min avg session
                </p>
              )}
            </div>

            {/* Insights */}
            {insights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Insights</p>
                {insights.map((ins, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                      ins.type === 'tip' ? 'border-yellow-500/20 bg-yellow-500/5' :
                      ins.type === 'praise' ? 'border-cyber-neon/20 bg-cyber-neon/5' :
                      ins.type === 'warning' ? 'border-discord-red/20 bg-discord-red/5' :
                      'border-discord-accent/20 bg-discord-accent/5'
                    }`}
                  >
                    <span className="text-sm">{ins.icon}</span>
                    <span className="text-xs text-gray-300">{ins.text}</span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Apps & windows — where you spent time */}
            {categoryGroups.length > 0 && (
              <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2.5">Apps & windows</p>

                {/* Timeline bar */}
                <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-3">
                  {categoryGroups.filter((c) => c.pct >= 0.5).map((cat) => (
                    <motion.div key={cat.category} initial={{ width: 0 }} animate={{ width: `${cat.pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-sm" style={{ backgroundColor: cat.color }} />
                  ))}
                </div>

                {/* Category list with nested apps and window titles */}
                <div className="space-y-1">
                  {categoryGroups.map((group, gi) => {
                    const isExpanded = expandedCat === group.category
                    return (
                      <motion.div key={group.category} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: gi * 0.03 }}>
                        <button
                          type="button"
                          onClick={() => setExpandedCat(isExpanded ? null : group.category)}
                          className="w-full flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-white/[0.02] transition-colors text-left"
                        >
                          <span className="text-sm shrink-0">{group.emoji}</span>
                          <span className="text-xs font-semibold text-white flex-1 min-w-0 truncate">{group.label}</span>
                          <span className="text-xs font-mono font-bold shrink-0" style={{ color: group.color }}>{Math.round(group.pct)}%</span>
                          <span className="text-[10px] text-gray-600 font-mono shrink-0 w-14 text-right">{formatMs(group.total_ms)}</span>
                          <span className={`text-gray-600 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                        </button>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="pl-7 pr-1 pb-2 space-y-1">
                                {group.apps.map((app) => (
                                  <div key={app.app_name}>
                                    <div className="flex items-center gap-2 py-0.5">
                                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }} />
                                      <span className="text-[11px] text-gray-300 truncate flex-1 min-w-0">{app.app_name}</span>
                                      <span className="text-[10px] text-gray-500 font-mono shrink-0">{formatMs(app.total_ms)}</span>
                                    </div>
                                    {/* Window titles */}
                                    {app.titles.length > 0 && (
                                      <div className="pl-4 space-y-0.5">
                                        {app.titles.map((t, ti) => (
                                          <div key={ti} className="flex items-center gap-1.5 py-0.5">
                                            <span className="text-[9px] text-gray-700 shrink-0">—</span>
                                            <span className="text-[10px] text-gray-500 truncate flex-1 min-w-0">{t.window_title}</span>
                                            <span className="text-[9px] text-gray-600 font-mono shrink-0">{formatMs(t.total_ms)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Hourly Distribution */}
            {hourly.length > 0 && (
              <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2.5">Hourly Activity</p>
                <div className="flex items-end gap-[2px] h-12">
                  {Array.from({ length: 24 }, (_, h) => {
                    const data = hourly.find((d) => d.hour === h)
                    const ms = data?.total_ms || 0
                    const pct = maxHourMs > 0 ? (ms / maxHourMs) * 100 : 0
                    return (
                      <div key={h} className="flex-1 flex flex-col items-center" title={`${h}:00 — ${formatMs(ms)}`}>
                        <div className="w-full rounded-t-sm bg-cyber-neon/20 relative overflow-hidden" style={{ height: `${Math.max(pct, 2)}%` }}>
                          <div className="absolute inset-0 bg-cyber-neon/60 rounded-t-sm" style={{ height: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-gray-600 font-mono">0:00</span>
                  <span className="text-[10px] text-gray-600 font-mono">6:00</span>
                  <span className="text-[10px] text-gray-600 font-mono">12:00</span>
                  <span className="text-[10px] text-gray-600 font-mono">18:00</span>
                  <span className="text-[10px] text-gray-600 font-mono">23:00</span>
                </div>
              </div>
            )}

            {/* Session history */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2">Sessions</p>
              {sessions.length === 0 ? (
                <div className="rounded-xl bg-discord-card/50 border border-white/5 p-5 text-center">
                  <p className="text-gray-500 text-sm">No grinds yet</p>
                  <p className="text-gray-600 text-xs mt-1">Hit GRIND on Home to start</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {sessions.slice(0, 20).map((s, i) => (
                    <motion.button key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedId(s.id)}
                      className="w-full flex items-center gap-2.5 rounded-lg bg-discord-card/60 border border-white/5 px-3 py-2 hover:border-white/10 transition-colors text-left"
                    >
                      <span className="font-mono text-cyber-neon text-xs font-bold w-12 shrink-0">{formatDuration(s.duration_seconds)}</span>
                      <span className="text-xs text-gray-400 flex-1">{formatDate(s.start_time)}</span>
                      <span className="text-[10px] text-gray-600">{formatTime(s.start_time)}</span>
                      <span className="text-gray-700 text-xs">›</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
