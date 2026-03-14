import { useMemo, useState, useEffect } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { motion, AnimatePresence } from 'framer-motion'
import { SessionDetail } from './SessionDetail'
import { TrendsChart } from './TrendsChart'
import { OverviewAnalysis } from './OverviewAnalysis'
import { detectPersona, generateInsights } from '../../lib/persona'
import type { Insight } from '../../lib/persona'
import { CATEGORY_COLORS, CATEGORY_EMOJI, CATEGORY_LABELS } from '../../lib/uiConstants'
import { PageLoading } from '../shared/PageLoading'
import { EmptyState } from '../shared/EmptyState'
import { SkeletonBlock } from '../shared/PageLoading'

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

interface SiteStat {
  domain: string
  total_ms: number
  sample_title: string
}

interface FocusBlock {
  start_time: number
  end_time: number
  total_seconds: number
  dominant_app: string
  categories: string[]
}

interface DistractionMetrics {
  distraction_seconds: number
  focus_seconds: number
  distraction_switches: number
  longest_focus_minutes: number
  top_distractions: { app_name: string; total_seconds: number }[]
}

interface PeriodComparison {
  current: { total_seconds: number; sessions_count: number; total_keystrokes: number }
  previous: { total_seconds: number; sessions_count: number; total_keystrokes: number }
}

interface RefinedLabel {
  app_name: string
  window_title: string
  refined_category: string
  confidence: number
  reason: string
}

interface HabitItem {
  title: string
  detail: string
  type: 'good' | 'risk'
}

/** Exclude the Grindly app from stats */
function isGrindlyApp(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const n = name.toLowerCase()
  return n.includes('grinder') || n.includes('grindly') || n === 'grind tracker' || n === 'grind_tracker'
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

type TimeFilter = 'today' | 'week' | 'month' | 'all' | 'custom'

function getFilterMs(filter: TimeFilter, customDays: number): number {
  if (filter === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (filter === 'week') return Date.now() - 7 * 86400000
  if (filter === 'month') return Date.now() - 30 * 86400000
  if (filter === 'custom') return Date.now() - Math.max(1, customDays) * 86400000
  return 0
}

function getPeriodLabel(filter: TimeFilter, customDays: number): string {
  if (filter === 'today') return 'Today'
  if (filter === 'week') return 'Last 7 days'
  if (filter === 'month') return 'Last 30 days'
  if (filter === 'custom') return `Last ${Math.max(1, customDays)} days`
  return 'All time'
}

function getComparisonWindow(filter: TimeFilter, customDays: number): {
  currentSince: number
  currentUntil: number
  previousSince: number
  previousUntil: number
} {
  const now = Date.now()
  if (filter === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const currentSince = start.getTime()
    const previousSince = currentSince - 86400000
    return { currentSince, currentUntil: now, previousSince, previousUntil: currentSince }
  }
  if (filter === 'week') {
    const currentSince = now - 7 * 86400000
    const previousSince = currentSince - 7 * 86400000
    return { currentSince, currentUntil: now, previousSince, previousUntil: currentSince }
  }
  const days = filter === 'month' ? 30 : filter === 'custom' ? Math.max(1, customDays) : 30
  const currentSince = now - days * 86400000
  const previousSince = currentSince - days * 86400000
  return { currentSince, currentUntil: now, previousSince, previousUntil: currentSince }
}

function toPct(v: number, total: number): number {
  if (!total) return 0
  return Math.round((v / total) * 100)
}

function rangeToTrendDays(filter: TimeFilter, customDays: number): number {
  if (filter === 'today') return 1
  if (filter === 'week') return 7
  if (filter === 'month') return 30
  if (filter === 'custom') return Math.max(1, customDays)
  return 90
}

function scoreLabel(value: number, goodAt: number, warnAt: number): { tone: 'good' | 'warn' | 'risk'; text: string } {
  if (value >= goodAt) return { tone: 'good', text: 'Good' }
  if (value >= warnAt) return { tone: 'warn', text: 'Needs attention' }
  return { tone: 'risk', text: 'High risk' }
}

function focusTone(score: number): 'good' | 'warn' | 'risk' {
  if (score >= 70) return 'good'
  if (score >= 40) return 'warn'
  return 'risk'
}

function distractionTone(score: number): 'good' | 'warn' | 'risk' {
  if (score <= 30) return 'good'
  if (score <= 50) return 'warn'
  return 'risk'
}

function buildHabitItems(params: {
  focusScore: number
  distractionScore: number
  contextSwitches: number
  totalSessions: number
  topCategory?: { label: string; pct: number } | null
  topDistraction?: { app_name: string; total_seconds: number } | null
}): HabitItem[] {
  const items: HabitItem[] = []
  const switchesPerSession = params.totalSessions > 0 ? params.contextSwitches / params.totalSessions : 0

  if (params.focusScore >= 70) {
    items.push({
      type: 'good',
      title: 'Strong focus quality',
      detail: `${params.focusScore}% of tracked time is focused work.`,
    })
  } else {
    items.push({
      type: 'risk',
      title: 'Focus quality is low',
      detail: `${params.focusScore}% focus suggests frequent interruptions.`,
    })
  }

  if (switchesPerSession > 12) {
    items.push({
      type: 'risk',
      title: 'Frequent context switching',
      detail: `About ${Math.round(switchesPerSession)} app switches per session. Try batching similar tasks.`,
    })
  } else if (params.totalSessions > 0) {
    items.push({
      type: 'good',
      title: 'Steady session flow',
      detail: `${Math.round(switchesPerSession)} app switches per session keeps context stable.`,
    })
  }

  if (params.topCategory && params.topCategory.pct >= 45) {
    items.push({
      type: 'good',
      title: 'Clear work priority',
      detail: `${params.topCategory.label} takes ${Math.round(params.topCategory.pct)}% of your time.`,
    })
  }

  if (params.distractionScore >= 35 && params.topDistraction) {
    items.push({
      type: 'risk',
      title: 'Main distraction source',
      detail: `${params.topDistraction.app_name} consumed ${formatDuration(params.topDistraction.total_seconds)} of distracting time.`,
    })
  }

  return items.slice(0, 4)
}

function buildSessionStory(session: SessionRecord): string {
  const start = new Date(session.start_time)
  const hour = start.getHours()
  const mood = hour < 12 ? 'Morning session' : hour < 18 ? 'Daytime session' : 'Evening session'
  const length = session.duration_seconds >= 3600 ? 'long push' : session.duration_seconds >= 1800 ? 'solid block' : 'short sprint'
  return `${mood}: ${length} (${formatDuration(session.duration_seconds)}).`
}

export function StatsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEscapeHandler(() => setSelectedId(null), selectedId !== null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<TimeFilter>('all')
  const [customDays, setCustomDays] = useState(14)

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
  const [siteUsage, setSiteUsage] = useState<SiteStat[]>([])
  const [focusBlocks, setFocusBlocks] = useState<FocusBlock[]>([])
  const [distractionMetrics, setDistractionMetrics] = useState<DistractionMetrics | null>(null)
  const [periodComparison, setPeriodComparison] = useState<PeriodComparison | null>(null)
  const [aiRefineEnabled, setAiRefineEnabled] = useState(false)
  const [aiRefining, setAiRefining] = useState(false)
  const [aiRefined, setAiRefined] = useState<RefinedLabel[]>([])
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  const loadData = async (resetPage = true) => {
    const useFullLoader = sessions.length === 0 && resetPage
    if (useFullLoader) setLoading(true)
    else setRefreshing(true)
    const sinceMs = getFilterMs(filter, customDays)
    const comparison = getComparisonWindow(filter, customDays)
    const api = window.electronAPI
    const pageOffset = resetPage ? 0 : offset

    if (api?.db) {
      const [sessionsData, apps, cats, switches, sessionCount, secs, streakVal, winStats, hourlyData, keys, sites, blocks, distraction, comparisonData] = await Promise.all([
        api.db.getSessionsPage(20, pageOffset, sinceMs),
        api.db.getAppUsageStats(sinceMs),
        api.db.getCategoryStats(sinceMs),
        api.db.getContextSwitchCount(sinceMs),
        api.db.getSessionCount(sinceMs),
        api.db.getTotalSeconds(sinceMs),
        api.db.getStreak(),
        api.db.getWindowTitleStats(sinceMs),
        api.db.getHourlyDistribution(sinceMs),
        api.db.getTotalKeystrokes(sinceMs),
        api.db.getSiteUsageStats(sinceMs),
        api.db.getFocusBlocks(sinceMs, 20),
        api.db.getDistractionMetrics(sinceMs),
        api.db.getPeriodComparison(comparison.currentSince, comparison.currentUntil, comparison.previousSince, comparison.previousUntil),
      ])

      const pageSessions = (sessionsData as SessionRecord[]) || []
      const filteredSessions = sinceMs > 0 ? pageSessions.filter((s) => s.start_time >= sinceMs) : pageSessions

      if (resetPage) {
        setSessions(filteredSessions)
        setOffset(filteredSessions.length)
      } else {
        setSessions((prev) => [...prev, ...filteredSessions])
        setOffset((prev) => prev + filteredSessions.length)
      }
      setHasMore(filteredSessions.length >= 20)
      const filteredApps = ((apps as AppStat[]) || []).filter((a) => !isGrindlyApp(a.app_name))
      setAppUsage(filteredApps)
      setCategoryStats((cats as CatStat[]) || [])
      setContextSwitches(switches as number)
      setTotalSessions(sessionCount as number)
      setTotalSeconds(secs as number)
      setStreak(streakVal as number)
      setWindowStats(((winStats as WindowStat[]) || []).filter((w) => !isGrindlyApp(w.app_name)))
      setHourly((hourlyData as HourlyStat[]) || [])
      setTotalKeystrokes(keys as number)
      setSiteUsage((sites as SiteStat[]) || [])
      setFocusBlocks((blocks as FocusBlock[]) || [])
      setDistractionMetrics((distraction as DistractionMetrics) || null)
      setPeriodComparison((comparisonData as PeriodComparison) || null)

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
        const stored = JSON.parse(localStorage.getItem('grindly_sessions') || '[]') as SessionRecord[]
        const filtered = sinceMs > 0 ? stored.filter((s) => s.start_time >= sinceMs) : stored
        setSessions(filtered)
        setTotalSessions(filtered.length)
        setTotalSeconds(filtered.reduce((sum, s) => sum + s.duration_seconds, 0))
      } catch { /* ignore */ }
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { loadData(true) }, [filter, customDays])
  const persona = detectPersona(categoryStats)
  const totalCatMs = categoryStats.reduce((s, c) => s + c.total_ms, 0)
  const avgSessionMin = totalSessions > 0 ? Math.round(totalSeconds / totalSessions / 60) : 0
  const focusSeconds = distractionMetrics?.focus_seconds || 0
  const distractionSeconds = distractionMetrics?.distraction_seconds || 0
  const trackableSeconds = focusSeconds + distractionSeconds
  const focusScore = toPct(focusSeconds, trackableSeconds)
  const distractionScore = toPct(distractionSeconds, trackableSeconds)
  const focusStatus = scoreLabel(focusScore, 70, 40)
  const distractionStatus = scoreLabel(100 - distractionScore, 70, 50)
  const focusVisualTone = focusTone(focusScore)
  const distractionVisualTone = distractionTone(distractionScore)
  const comparisonDelta = useMemo(() => {
    if (filter === 'all') return 0
    if (!periodComparison) return 0
    return periodComparison.current.total_seconds - periodComparison.previous.total_seconds
  }, [periodComparison, filter])
  const browserCandidates = useMemo(() => {
    return windowStats
      .filter((w) => ['browsing', 'other'].includes(w.category))
      .filter((w) => /chrome|edge|firefox|browser|arc|vivaldi|brave/i.test(w.app_name))
      .slice(0, 15)
  }, [windowStats])

  useEffect(() => {
    if (!aiRefineEnabled) return
    if (browserCandidates.length === 0) {
      setAiRefined([])
      return
    }
    const run = async () => {
      const api = window.electronAPI
      if (!api?.ai?.refineActivityLabels) return
      setAiRefining(true)
      try {
        const result = await api.ai.refineActivityLabels(
          browserCandidates.map((row) => ({
            app_name: row.app_name,
            window_title: row.window_title,
            current_category: row.category,
          })),
        )
        setAiRefined((result as RefinedLabel[]) || [])
      } catch {
        setAiRefined([])
      } finally {
        setAiRefining(false)
      }
    }
    run()
  }, [aiRefineEnabled, browserCandidates])

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
  const topProductive = categoryGroups
    .filter((group) => ['coding', 'design', 'creative', 'learning'].includes(group.category))
    .slice(0, 3)
  const topDistracting = categoryGroups
    .filter((group) => ['social', 'games', 'other'].includes(group.category))
    .slice(0, 3)
  const topCategory = categoryGroups[0] ? { label: categoryGroups[0].label, pct: categoryGroups[0].pct } : null
  const topDistraction = distractionMetrics?.top_distractions?.[0] || null
  const habitItems = useMemo(
    () => buildHabitItems({
      focusScore,
      distractionScore,
      contextSwitches,
      totalSessions,
      topCategory,
      topDistraction,
    }),
    [focusScore, distractionScore, contextSwitches, totalSessions, topCategory, topDistraction],
  )
  const trendDays = rangeToTrendDays(filter, customDays)

  // Hourly chart data
  const maxHourMs = Math.max(...hourly.map((h) => h.total_ms), 1)

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-xl border border-white/10 bg-discord-card/70 p-3">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-7 w-7" />
          </div>
          <div className="mt-3 flex gap-1.5">
            {[1, 2, 3, 4].map((pill) => <SkeletonBlock key={pill} className="h-8 flex-1" />)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-discord-card/70 p-3">
          <SkeletonBlock className="h-3 w-24 mb-3" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((card) => <SkeletonBlock key={card} className="h-14 w-full" />)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-discord-card/70 p-3 space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          {[1, 2, 3, 4].map((line) => <SkeletonBlock key={line} className="h-10 w-full" />)}
        </div>
        <PageLoading label="Loading stats..." />
      </div>
    )
  }

  return (
    <div className="p-4 pb-3 space-y-4 overflow-x-hidden">
      <AnimatePresence mode="wait">
        {selectedId ? (
          <motion.div key="detail" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 1 }} transition={{ duration: 0 }}>
            <SessionDetail sessionId={selectedId} onBack={() => setSelectedId(null)} />
          </motion.div>
        ) : (
          <div key="overview" className="space-y-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[28px] leading-none font-semibold text-white">Activity Insights</h2>
                <span className={`text-[11px] w-[62px] transition-opacity ${refreshing ? 'text-cyber-neon/80 opacity-100' : 'opacity-0'}`}>Updating...</span>
                {totalSessions > 0 && (
                  <div>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-full bg-discord-card border border-white/10 text-gray-300 inline-flex items-center justify-center min-w-[148px]"
                    >
                      <span>Activity style: {persona.emoji} {persona.label}</span>
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => loadData(true)} className="w-7 h-7 rounded-lg bg-discord-card border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors" title="Refresh">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            </div>

            {/* Time filter */}
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-2">
              {(['today', 'week', 'month', 'all', 'custom'] as TimeFilter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  filter === f
                    ? 'bg-white/12 border border-white/25 text-white'
                    : 'bg-discord-card border border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                }`}>
                  {f === 'today' ? 'Today' : f === 'week' ? '7d' : f === 'month' ? '30d' : f === 'custom' ? 'Custom' : 'All'}
                </button>
              ))}
              </div>
              {filter === 'custom' && (
                <div className="rounded-lg bg-discord-card border border-white/10 p-2 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-mono">Period</span>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={customDays}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (Number.isFinite(next)) setCustomDays(Math.max(1, Math.min(3650, Math.round(next))))
                    }}
                    className="w-24 rounded-md border border-white/10 bg-discord-darker px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyber-neon/40"
                  />
                  <span className="text-xs text-gray-400">days back from today</span>
                </div>
              )}
            </div>

            {/* 1/5 Health Snapshot */}
            <div className="rounded-2xl bg-discord-card/85 border border-white/10 p-4 space-y-3">
              <p className="text-xs font-semibold tracking-wide text-gray-300">Health Snapshot</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[11px] text-gray-400">Tracked time</p>
                  <p className="text-white text-base font-semibold">⏱ {formatDuration(totalSeconds)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Total active time in this period.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[11px] text-gray-400">Focus quality</p>
                  <p className={`text-base font-semibold ${
                    focusVisualTone === 'good' ? 'text-cyber-neon' : focusVisualTone === 'warn' ? 'text-amber-300' : 'text-rose-300'
                  }`}>{focusScore}%</p>
                  <p className="text-[10px] text-gray-500 mt-1">{focusStatus.text}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[11px] text-gray-400">Distraction share</p>
                  <p className={`text-base font-semibold ${
                    distractionVisualTone === 'good' ? 'text-cyber-neon' : distractionVisualTone === 'warn' ? 'text-amber-300' : 'text-rose-300'
                  }`}>{distractionScore}%</p>
                  <p className="text-[10px] text-gray-500 mt-1">{distractionStatus.text}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[11px] text-gray-400">Context switches</p>
                  <p className="text-white text-base font-semibold">↔ {contextSwitches}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Lower usually means deeper focus.</p>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-discord-darker/40 p-3">
                <p className="text-[11px] text-gray-400">
                  {totalSessions} sessions • ~{avgSessionMin} min/session • {totalKeystrokes} keystrokes • consistency streak {streak}d
                </p>
                {comparisonDelta !== 0 && (
                  <p className={`text-[11px] mt-1 ${comparisonDelta > 0 ? 'text-cyber-neon' : 'text-amber-300'}`}>
                    {comparisonDelta > 0 ? '+' : ''}{Math.round(comparisonDelta / 60)} min vs previous matching period
                  </p>
                )}
              </div>
            </div>

            {/* 2/5 Habits & Risks */}
            {habitItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold tracking-wide text-gray-300">Habits & Risks</p>
                {habitItems.map((item, i) => (
                  <div key={i}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      item.type === 'good' ? 'border-cyber-neon/20 bg-cyber-neon/5' : 'border-amber-400/25 bg-amber-400/10'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs ${
                      item.type === 'good' ? 'bg-cyber-neon/15 text-cyber-neon' : 'bg-amber-400/15 text-amber-300'
                    }`}>{item.type === 'good' ? '✓' : '!'}</span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-200 font-medium">{item.title}</p>
                      <p className="text-[11px] text-gray-400">{item.detail}</p>
                    </div>
                  </div>
                ))}
                {insights.length > 0 && (
                  <div className="rounded-lg border border-white/10 bg-discord-card/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Quick tips</p>
                    <div className="space-y-1">
                      {insights.slice(0, 2).map((ins, i) => (
                        <p key={`${ins.text}-${i}`} className="text-[11px] text-gray-400">{ins.icon} {ins.text}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3/5 Where Time Goes */}
            {categoryGroups.length > 0 && (
              <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
                <p className="text-xs font-semibold tracking-wide text-gray-300 mb-2.5">Where Time Goes</p>

                {/* Timeline bar */}
                <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-3">
                  {categoryGroups.filter((c) => c.pct >= 0.5).map((cat) => (
                    <div key={cat.category} className="h-full rounded-sm" style={{ width: `${cat.pct}%`, backgroundColor: cat.color }} />
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                  <div className="rounded-xl border border-cyber-neon/20 bg-cyber-neon/5 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-cyber-neon/80 mb-1">Top productive categories</p>
                    {topProductive.length > 0 ? (
                      topProductive.map((item) => (
                        <div key={item.category} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-300 flex-1 truncate">{item.label}</span>
                          <span className="text-cyber-neon font-mono">{Math.round(item.pct)}%</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-gray-500">No productive category data yet.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-amber-300 mb-1">Top distraction categories</p>
                    {topDistracting.length > 0 ? (
                      topDistracting.map((item) => (
                        <div key={item.category} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-300 flex-1 truncate">{item.label}</span>
                          <span className="text-amber-300 font-mono">{Math.round(item.pct)}%</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-gray-500">No distraction categories in this period.</p>
                    )}
                  </div>
                </div>

                {/* Category list with nested apps and window titles */}
                <div className="space-y-1">
                  {categoryGroups.map((group) => {
                    const isExpanded = expandedCat === group.category
                    return (
                      <div key={group.category}>
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
                      </div>
                    )
                  })}
                </div>

                {siteUsage.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/5">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Top websites</p>
                    <div className="space-y-1">
                      {siteUsage.slice(0, 6).map((site) => (
                        <div key={site.domain} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 flex-1 truncate">{site.domain}</span>
                          <span className="text-gray-600 font-mono">{formatMs(site.total_ms)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 pt-2 border-t border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Smart category cleanup (optional)</p>
                    <button
                      onClick={() => setAiRefineEnabled((v) => !v)}
                      className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                        aiRefineEnabled
                          ? 'text-cyber-neon border-cyber-neon/30 bg-cyber-neon/10'
                          : 'text-gray-500 border-white/10 hover:text-white'
                      }`}
                    >
                      {aiRefineEnabled ? 'Enabled' : 'Enable'}
                    </button>
                  </div>
                  {aiRefineEnabled && (
                    <>
                      {aiRefining && <p className="text-[10px] text-gray-500 font-mono">Clarifying ambiguous browser titles...</p>}
                      {!aiRefining && aiRefined.length === 0 && (
                        <p className="text-[10px] text-gray-600 font-mono">No suggestions yet, or AI service is unavailable.</p>
                      )}
                      {!aiRefining && aiRefined.length > 0 && (
                        <div className="space-y-1">
                          {aiRefined.slice(0, 6).map((row, idx) => (
                            <div key={`${row.window_title}-${idx}`} className="text-[10px] text-gray-400">
                              <span className="text-cyber-neon font-mono">{row.refined_category}</span>
                              <span className="text-gray-600"> ({Math.round(row.confidence * 100)}%)</span>
                              <span className="text-gray-500"> - {row.window_title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 4/5 Distraction Patterns */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
              <p className="text-xs font-semibold tracking-wide text-gray-300 mb-2">Distraction Patterns</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[10px] text-gray-500 font-mono">Distraction time</p>
                  <p className="text-amber-300 font-mono text-sm">{formatDuration(distractionSeconds)}</p>
                  <p className="text-[10px] text-gray-600 mt-1">Time spent in distracting categories.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[10px] text-gray-500 font-mono">Focus blocks</p>
                  <p className="text-white font-mono text-sm">{focusBlocks.length}</p>
                  <p className="text-[10px] text-gray-600 mt-1">Blocks of sustained focus activity.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[10px] text-gray-500 font-mono">Distraction switches</p>
                  <p className="text-white font-mono text-sm">{distractionMetrics?.distraction_switches || 0}</p>
                  <p className="text-[10px] text-gray-600 mt-1">Switches from focus work into distractions.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-discord-darker/60 p-3">
                  <p className="text-[10px] text-gray-500 font-mono">Longest focus run</p>
                  <p className="text-cyber-neon font-mono text-sm">{distractionMetrics?.longest_focus_minutes || 0}m</p>
                  <p className="text-[10px] text-gray-600 mt-1">Your best uninterrupted focus streak.</p>
                </div>
              </div>
              {distractionMetrics && distractionMetrics.top_distractions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {distractionMetrics.top_distractions.slice(0, 4).map((d) => (
                    <div key={d.app_name} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 flex-1 truncate">{d.app_name}</span>
                      <span className="text-gray-600 font-mono">{formatDuration(d.total_seconds)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5/5 Recent Sessions */}
            <div>
              <p className="text-xs font-semibold tracking-wide text-gray-300 mb-2">Recent Sessions</p>
              {sessions.length === 0 ? (
                <EmptyState title="No sessions yet" description="Start a session from Home to see behavior insights." icon="📊" />
              ) : (
                <div className="space-y-1">
                  {sessions.slice(0, 10).map((s) => (
                    <button key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="w-full rounded-lg bg-discord-card/60 border border-white/5 px-3 py-2 hover:border-white/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-cyber-neon text-xs font-bold w-12 shrink-0">{formatDuration(s.duration_seconds)}</span>
                        <span className="text-xs text-gray-400 flex-1">{formatDate(s.start_time)}</span>
                        <span className="text-[10px] text-gray-600">{formatTime(s.start_time)}</span>
                        <span className="text-gray-700 text-xs">›</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">{buildSessionStory(s)}</p>
                    </button>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => loadData(false)}
                      className="w-full rounded-lg border border-white/10 bg-discord-card/40 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Load more sessions
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 6/6 Trend Over Time */}
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-gray-300">Trend Over Time</p>
              {hourly.length > 0 && (
                <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2.5">Most Active Hours</p>
                  <div className="flex items-end gap-0.5 h-12">
                    {Array.from({ length: 24 }, (_, h) => {
                      const data = hourly.find((d) => d.hour === h)
                      const ms = data?.total_ms || 0
                      const pct = maxHourMs > 0 ? (ms / maxHourMs) * 100 : 0
                      return (
                        <div key={h} className="flex-1 h-full flex items-end" title={`${h}:00 — ${formatMs(ms)}`}>
                          <div className="w-full rounded-t-sm bg-cyber-neon/20" style={{ height: `${Math.max(pct, 2)}%` }} />
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
              <TrendsChart days={trendDays} periodLabel={getPeriodLabel(filter, customDays)} showRangeControls={false} />
            </div>

            <OverviewAnalysis
              totalSessions={totalSessions}
              totalSeconds={totalSeconds}
              contextSwitches={contextSwitches}
              totalKeystrokes={totalKeystrokes}
              appUsage={appUsage}
              categoryStats={categoryStats}
              windowTitles={windowStats}
              periodLabel={getPeriodLabel(filter, customDays)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
