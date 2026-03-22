import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { RAID_TIER_CONFIGS, type RaidTierId } from '../../services/raidService'

interface RaidHistoryEntry {
  id: string
  raid_id: string
  tier: RaidTierId
  damage_dealt: number
  survived: boolean
  completed_at: string
}

export function HallOfRaidsTab() {
  const user = useAuthStore((s) => s.user)
  const [history, setHistory] = useState<RaidHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user || !supabase) return
    setLoading(true)
    supabase
      .from('raid_history')
      .select('*')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setHistory((data as RaidHistoryEntry[]) ?? [])
        setLoading(false)
      })
  }, [user])

  if (!user || !supabase) {
    return <p className="text-micro text-gray-600 font-mono text-center py-8">Sign in to view raid history.</p>
  }

  if (loading) {
    return <p className="text-micro text-gray-600 font-mono text-center py-8 animate-pulse">Loading history...</p>
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-3xl mb-2">🏛️</p>
        <p className="text-caption font-semibold text-gray-400">No raids completed yet</p>
        <p className="text-micro text-gray-600 font-mono mt-1">Complete your first raid to see it here.</p>
      </div>
    )
  }

  const totalDamage = history.reduce((sum, e) => sum + e.damage_dealt, 0)
  const survived = history.filter((e) => e.survived).length

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Raids', value: history.length, color: '#f59e0b' },
          { label: 'Total Dmg', value: totalDamage >= 1_000_000 ? `${(totalDamage / 1_000_000).toFixed(1)}M` : `${(totalDamage / 1_000).toFixed(0)}K`, color: '#ef4444' },
          { label: 'Survived', value: `${survived}/${history.length}`, color: '#4ade80' },
        ].map((stat) => (
          <div key={stat.label} className="rounded border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-center">
            <p className="text-body font-bold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-micro font-mono text-gray-600 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* History list */}
      <div className="space-y-1.5">
        {history.map((entry) => {
          const cfg = RAID_TIER_CONFIGS[entry.tier]
          const date = new Date(entry.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          const dmgStr = entry.damage_dealt >= 1_000_000
            ? `${(entry.damage_dealt / 1_000_000).toFixed(2)}M`
            : `${(entry.damage_dealt / 1_000).toFixed(0)}K`
          return (
            <div
              key={entry.id}
              className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex items-center gap-3"
            >
              <span className="text-xl shrink-0" style={{ filter: `drop-shadow(0 0 4px ${cfg.color}80)` }}>
                {cfg.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-micro font-semibold text-white">{cfg.name}</p>
                <p className="text-micro font-mono text-gray-600">{date}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-micro font-mono font-bold" style={{ color: cfg.color }}>{dmgStr} dmg</p>
                <p className={`text-micro font-mono ${entry.survived ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.survived ? '✓ survived' : '✗ fell'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
