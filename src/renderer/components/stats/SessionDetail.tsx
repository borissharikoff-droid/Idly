import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AIAnalysis } from './AIAnalysis'
import { MOTION } from '../../lib/motion'
import { CATEGORY_COLORS, CATEGORY_EMOJI, CATEGORY_LABELS } from '../../lib/uiConstants'
import { BackButton } from '../shared/BackButton'
import { PageLoading } from '../shared/PageLoading'
import { EmptyState } from '../shared/EmptyState'
import { ErrorState } from '../shared/ErrorState'

interface SessionDetailProps {
  sessionId: string
  onBack: () => void
}

interface ActivityRow {
  id?: number
  session_id?: string
  app_name: string | null
  window_title: string | null
  category: string | null
  start_time: number
  end_time: number
  keystrokes?: number
}

interface SessionRow {
  id: string
  start_time: number
  end_time: number
  duration_seconds: number
  summary: string | null
}

/** Exclude the Grindly app itself from stats. */
function isGrindlyApp(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const n = name.toLowerCase()
  return n.includes('grinder') || n.includes('grindly') || n === 'grind tracker' || n === 'grind_tracker' || n === 'electron'
}

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  return [h, m, s].map((n) => n.toString().padStart(2, '0')).join(':')
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

interface AppEntry {
  name: string
  seconds: number
  keystrokes: number
  category: string
  titles: { title: string; seconds: number }[]
}

interface CategoryGroup {
  category: string
  label: string
  emoji: string
  color: string
  totalSeconds: number
  totalKeys: number
  pct: number
  apps: AppEntry[]
}

function isFocusCategory(cat: string): boolean {
  return ['coding', 'design', 'creative', 'learning'].includes(cat)
}

function isDistractionCategory(cat: string): boolean {
  return ['social', 'games', 'other'].includes(cat)
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const [session, setSession] = useState<SessionRow | null>(null)
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (api?.db) {
      Promise.all([api.db.getSessionById(sessionId), api.db.getActivitiesBySessionId(sessionId)])
        .then(([s, list]) => {
          if (s) setSession(s as SessionRow)
          else setNotFound(true)
          setActivities((list as ActivityRow[]) || [])
        })
        .catch(() => {
          setLoadError('Failed to load session details.')
        })
    } else {
      try {
        const sessions: SessionRow[] = JSON.parse(localStorage.getItem('grindly_sessions') || '[]')
        const found = sessions.find((s) => s.id === sessionId)
        if (found) setSession(found)
        else setNotFound(true)
        const allActivities = JSON.parse(localStorage.getItem('grindly_activities') || '{}')
        setActivities(allActivities[sessionId] || [])
      } catch {
        setLoadError('Failed to load session details.')
      }
    }
  }, [sessionId])

  // Filter out Grindly
  const filtered = activities.filter((a) => !isGrindlyApp(a.app_name || ''))

  // Aggregate by app with window titles
  const appMap = new Map<string, AppEntry>()
  filtered.forEach((a) => {
    const app = a.app_name || 'Unknown'
    const cat = a.category || 'other'
    const dur = (a.end_time - a.start_time) / 1000
    const keys = a.keystrokes || 0
    const title = a.window_title || ''

    const key = `${app}|${cat}`
    if (!appMap.has(key)) {
      appMap.set(key, { name: app, seconds: 0, keystrokes: 0, category: cat, titles: [] })
    }
    const entry = appMap.get(key)!
    entry.seconds += dur
    entry.keystrokes += keys

    if (title) {
      const existing = entry.titles.find((t) => t.title === title)
      if (existing) existing.seconds += dur
      else entry.titles.push({ title, seconds: dur })
    }
  })

  // Sort titles within each app
  appMap.forEach((entry) => {
    entry.titles.sort((a, b) => b.seconds - a.seconds)
    entry.titles = entry.titles.slice(0, 5) // top 5 titles
  })

  // Group by category
  const catMap = new Map<string, { totalSeconds: number; totalKeys: number; apps: AppEntry[] }>()
  appMap.forEach((entry) => {
    if (!catMap.has(entry.category)) catMap.set(entry.category, { totalSeconds: 0, totalKeys: 0, apps: [] })
    const group = catMap.get(entry.category)!
    group.totalSeconds += entry.seconds
    group.totalKeys += entry.keystrokes
    group.apps.push(entry)
  })

  const totalSeconds = Array.from(catMap.values()).reduce((s, g) => s + g.totalSeconds, 0)
  const totalKeystrokes = filtered.reduce((s, a) => s + (a.keystrokes || 0), 0)

  // Context switches
  let contextSwitches = 0
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i].app_name !== filtered[i - 1].app_name) contextSwitches++
  }

  const categoryGroups: CategoryGroup[] = Array.from(catMap.entries())
    .map(([cat, g]) => {
      g.apps.sort((a, b) => b.seconds - a.seconds)
      return {
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        emoji: CATEGORY_EMOJI[cat] || '📱',
        color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other,
        totalSeconds: g.totalSeconds,
        totalKeys: g.totalKeys,
        pct: totalSeconds > 0 ? (g.totalSeconds / totalSeconds) * 100 : 0,
        apps: g.apps,
      }
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds)

  // Chronological timeline segments
  const timelineSegments = filtered.map((a) => ({
    category: a.category || 'other',
    start: a.start_time,
    end: a.end_time,
    app: a.app_name || 'Unknown',
    color: CATEGORY_COLORS[a.category || 'other'] || CATEGORY_COLORS.other,
  }))

  const interruptionPoints = timelineSegments
    .map((seg, idx) => {
      if (idx === 0) return null
      const prev = timelineSegments[idx - 1]
      if (isFocusCategory(prev.category) && isDistractionCategory(seg.category)) {
        return {
          idx,
          app: seg.app,
          category: seg.category,
          start: seg.start,
        }
      }
      return null
    })
    .filter(Boolean) as { idx: number; app: string; category: string; start: number }[]

  const keysPerMin = session?.duration_seconds ? Math.round(totalKeystrokes / (session.duration_seconds / 60)) : 0
  const switchRatePerMin = session?.duration_seconds ? contextSwitches / (session.duration_seconds / 60) : 0
  const focusRisk =
    switchRatePerMin > 0.7
      ? 'High interruption risk'
      : switchRatePerMin > 0.3
      ? 'Moderate interruption risk'
      : 'Steady focus flow'

  const storyIntro = (() => {
    if (!session) return ''
    if (timelineSegments.length === 0) return 'No tracked activity in this session.'
    const topCategory = categoryGroups[0]
    const topApp = topCategory?.apps[0]
    const pacing = contextSwitches > 25 ? 'highly fragmented' : contextSwitches > 10 ? 'mixed-focus' : 'deep-focus'
    return `Most time was spent in ${topCategory?.label || 'mixed activity'}, mainly in ${topApp?.name || 'multiple apps'}. Pattern: ${pacing}, ${contextSwitches} switches, ${keysPerMin} keys/min.`
  })()

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <EmptyState title="Session not found" description="Try opening another session from the list." icon="🧭" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <ErrorState message={loadError} onRetry={() => window.location.reload()} retryLabel="Reload" />
      </div>
    )
  }

  if (!session) return <PageLoading label="Loading session..." className="mt-2" />

  const sessionDate = new Date(session.start_time)
  const dateStr = sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = sessionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const switchRate = session.duration_seconds > 0 ? (contextSwitches / (session.duration_seconds / 60)).toFixed(1) : '0'

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-mono">{dateStr.toUpperCase()}, {timeStr}</span>
            <span className="text-lg font-mono font-bold text-white">{formatDuration(session.duration_seconds)}</span>
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-discord-card/80 border border-white/5 p-2 text-center">
          <p className="text-sm font-mono font-bold text-white">{formatNum(totalKeystrokes)}</p>
          <p className="text-[10px] text-gray-500 font-mono">keys ({keysPerMin}/min)</p>
        </div>
        <div className="rounded-lg bg-discord-card/80 border border-white/5 p-2 text-center">
          <p className="text-sm font-mono font-bold text-white">{contextSwitches}</p>
          <p className="text-[10px] text-gray-500 font-mono">switches ({switchRate}/min)</p>
        </div>
        <div className="rounded-lg bg-discord-card/80 border border-white/5 p-2 text-center">
          <p className="text-sm font-mono font-bold text-white">{categoryGroups.length}</p>
          <p className="text-[10px] text-gray-500 font-mono">categories</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg border border-cyber-neon/20 bg-cyber-neon/5 p-2">
          <p className="text-[10px] uppercase tracking-wider text-cyber-neon/80 font-mono">What went well</p>
          <p className="text-xs text-gray-300 mt-1">
            {categoryGroups[0]
              ? `${categoryGroups[0].label} led this session at ${Math.round(categoryGroups[0].pct)}% of tracked time.`
              : 'Tracked activity is limited for this session.'}
          </p>
        </div>
        <div className="rounded-lg border border-discord-red/25 bg-discord-red/10 p-2">
          <p className="text-[10px] uppercase tracking-wider text-discord-red/90 font-mono">Needs attention</p>
          <p className="text-xs text-gray-300 mt-1">
            {focusRisk}. {switchRatePerMin > 0.7 ? 'Try longer uninterrupted blocks in one app.' : 'Keep context switching low to maintain depth.'}
          </p>
        </div>
      </div>

      {/* Chronological timeline */}
      {timelineSegments.length > 0 && session && (
        <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2">Timeline (what happened)</p>
          <div className="flex gap-px h-3 rounded-full overflow-hidden">
            {timelineSegments.map((seg, i) => {
              const totalSpan = session.end_time - session.start_time
              const pct = totalSpan > 0 ? ((seg.end - seg.start) / totalSpan) * 100 : 0
              if (pct < 0.3) return null
              return (
                <div key={i} className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: seg.color, minWidth: '2px' }} />
              )
            })}
          </div>
          {interruptionPoints.length > 0 && (
            <p className="text-[10px] text-discord-red mt-2">
              {interruptionPoints.length} distraction interruptions detected from focus flow.
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {categoryGroups.map((cat) => (
              <div key={cat.category} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: cat.color }} />
                <span className="text-[10px] text-gray-400">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session diagnosis */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Session Diagnosis</p>
        <p className="text-xs text-gray-300">{storyIntro}</p>
        <div className="space-y-1.5">
          {timelineSegments.slice(0, 8).map((seg, idx) => {
            const segSec = Math.round((seg.end - seg.start) / 1000)
            const stamp = new Date(seg.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            return (
              <div key={`${seg.start}-${idx}`} className="flex items-center gap-2 text-[11px]">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-gray-500 font-mono shrink-0">{stamp}</span>
                <span className="text-gray-300 truncate flex-1">{seg.app}</span>
                <span className="text-gray-600 font-mono shrink-0">{formatDuration(segSec)}</span>
              </div>
            )
          })}
          {timelineSegments.length > 8 && (
            <p className="text-[10px] text-gray-600">+{timelineSegments.length - 8} more timeline events</p>
          )}
        </div>
      </div>

      {/* Category breakdown with nested apps and window titles */}
      {categoryGroups.length > 0 && (
        <div className="space-y-1.5">
          {categoryGroups.map((group, gi) => {
            const isExpanded = expandedCat === group.category
            return (
              <motion.div key={group.category} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: gi * 0.04, duration: MOTION.duration.fast, ease: MOTION.easing }}
                className="rounded-xl bg-discord-card/80 border border-white/10 overflow-hidden"
              >
                <button type="button" onClick={() => setExpandedCat(isExpanded ? null : group.category)}
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-sm shrink-0">{group.emoji}</span>
                  <span className="text-xs font-semibold text-white flex-1 min-w-0 truncate">{group.label}</span>
                  <span className="text-xs font-mono font-bold shrink-0" style={{ color: group.color }}>{Math.round(group.pct)}%</span>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">{formatMs(group.totalSeconds * 1000)}</span>
                  <span className={`text-gray-600 text-[10px] ml-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: MOTION.duration.fast, ease: MOTION.easing }} className="overflow-hidden">
                      <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
                        {group.apps.map((app) => (
                          <div key={app.name}>
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }} />
                              <span className="text-[11px] text-gray-300 truncate flex-1 min-w-0">{app.name}</span>
                              {app.keystrokes > 0 && (
                                <span className="text-[10px] text-gray-600 font-mono shrink-0">{formatNum(app.keystrokes)} keys</span>
                              )}
                              <span className="text-[10px] text-gray-500 font-mono shrink-0">{formatMs(app.seconds * 1000)}</span>
                            </div>
                            {app.titles.length > 0 && (
                              <div className="pl-4 mt-0.5 space-y-0.5">
                                {app.titles.map((t, ti) => (
                                  <div key={ti} className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-700 shrink-0">—</span>
                                    <span className="text-[10px] text-gray-500 truncate flex-1 min-w-0">{t.title}</span>
                                    <span className="text-[10px] text-gray-600 font-mono shrink-0">{formatMs(t.seconds * 1000)}</span>
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
      )}

      {categoryGroups.length === 0 && (
        <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4">
          <p className="text-gray-500 text-sm text-center">No activity data for this session.</p>
        </div>
      )}

      <AIAnalysis sessionId={sessionId} />
    </div>
  )
}
