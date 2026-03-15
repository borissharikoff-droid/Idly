import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaidStore } from '../../stores/raidStore'
import { useAuthStore } from '../../stores/authStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useToastStore } from '../../stores/toastStore'
import { LOOT_ITEMS, ITEM_POWER_BY_RARITY, type LootRarity } from '../../lib/loot'
import {
  RAID_TIER_CONFIGS, rarityMeetsMin, checkRaidGates,
  fetchFriends,
  type RaidTierId, type TributeItem, type Friend,
} from '../../services/raidService'
import { skillLevelFromXP } from '../../lib/skills'
import { RaidFightModal } from './RaidFightModal'
import { playClickSound } from '../../lib/sounds'

const RARITY_COLORS: Record<LootRarity, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
  mythic: '#ef4444',
}

function formatHp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

function countdown(dateStr: string | null): string {
  if (!dateStr) return ''
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return 'Ended'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

function todayUtc(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Tribute Selector Modal ─────────────────────────────────────────────────────

function TributeModal({
  tier,
  onConfirm,
  onClose,
}: {
  tier: RaidTierId
  onConfirm: (items: TributeItem[]) => void
  onClose: () => void
}) {
  const cfg = RAID_TIER_CONFIGS[tier]
  const items = useInventoryStore((s) => s.items)
  const user = useAuthStore((s) => s.user)
  const [selected, setSelected] = useState<string[]>([])
  const [friends, setFriends] = useState<Friend[]>([])

  useEffect(() => {
    if (user) fetchFriends(user.id).then(setFriends).catch(() => {})
  }, [user])

  // Gear items eligible for tribute (head/body/legs/ring/weapon, meets rarity)
  const gearSlots = new Set(['head', 'body', 'legs', 'ring', 'weapon'])
  const eligible = LOOT_ITEMS.filter((item) => {
    if (!gearSlots.has(item.slot)) return false
    if ((items[item.id] ?? 0) < 1) return false
    return rarityMeetsMin(item.rarity, cfg.tribute_min_rarity)
  })

  const toggle = (itemId: string) => {
    setSelected((prev) => {
      if (prev.includes(itemId)) return prev.filter((id) => id !== itemId)
      if (prev.length >= cfg.tribute_count) return [...prev.slice(1), itemId]
      return [...prev, itemId]
    })
  }

  const ready = selected.length >= cfg.tribute_count

  const handleConfirm = () => {
    if (!ready || !user) return
    const tributeItems: TributeItem[] = selected.map((id) => {
      const item = LOOT_ITEMS.find((x) => x.id === id)!
      return {
        item_id: id,
        item_name: item.name,
        rarity: item.rarity,
        sacrificed_by: user.id,
      }
    })
    onConfirm(tributeItems)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="w-[340px] bg-[#0d0d1a] rounded-2xl border shadow-2xl overflow-hidden"
        style={{ borderColor: `${cfg.color}40` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: `${cfg.color}20`, background: `${cfg.color}08` }}>
          <p className="text-[12px] font-bold text-white">{cfg.icon} Tribute to Enter</p>
          <p className="text-[9px] font-mono text-gray-500 mt-0.5">
            Select {cfg.tribute_count} item{cfg.tribute_count > 1 ? 's' : ''} of {cfg.tribute_min_rarity}+ rarity to sacrifice permanently.
          </p>
        </div>

        <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
          {eligible.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-[11px] text-gray-500">No eligible gear found.</p>
              <p className="text-[9px] text-gray-600 mt-1 font-mono">Need {cfg.tribute_count}× {cfg.tribute_min_rarity}+ gear items.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {eligible.map((item) => {
                const isSelected = selected.includes(item.id)
                const color = RARITY_COLORS[item.rarity]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors text-left"
                    style={{
                      borderColor: isSelected ? `${color}60` : 'rgba(255,255,255,0.07)',
                      background: isSelected ? `${color}12` : 'rgba(255,255,255,0.025)',
                    }}
                  >
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: isSelected ? color : '#e5e7eb' }}>{item.name}</p>
                      <p className="text-[8px] font-mono" style={{ color: `${color}99` }}>
                        {item.rarity} · IP {ITEM_POWER_BY_RARITY[item.rarity]}
                        {items[item.id] > 1 && <span className="text-gray-600"> · owned {items[item.id]}</span>}
                      </p>
                    </div>
                    {isSelected ? (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: color }}>
                        <span className="text-[8px] text-black font-bold">✓</span>
                      </div>
                    ) : (
                      <span className="text-[9px] text-red-500/50 font-mono shrink-0">burn</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Friends note */}
          {friends.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] px-3 py-2">
              <p className="text-[9px] text-gray-600 font-mono">
                {friends.length} friend{friends.length !== 1 ? 's' : ''} can join after raid starts.
              </p>
            </div>
          )}
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-white/15 text-gray-400 text-[11px] hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!ready}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40"
            style={{ background: ready ? `${cfg.color}20` : 'transparent', border: `1px solid ${cfg.color}40`, color: cfg.color }}
          >
            {ready ? `Sacrifice & Begin` : `${selected.length}/${cfg.tribute_count} selected`}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Tier Card (no active raid) ─────────────────────────────────────────────────

function TierCard({ tier, onStart }: { tier: RaidTierId; onStart: () => void }) {
  const cfg = RAID_TIER_CONFIGS[tier]
  const items = useInventoryStore((s) => s.items)
  const user = useAuthStore((s) => s.user)
  const clearedZones = useArenaStore((s) => s.clearedZones)

  const gearSlots = new Set(['head', 'body', 'legs', 'ring', 'weapon'])
  const eligibleCount = LOOT_ITEMS.filter((item) =>
    gearSlots.has(item.slot) && (items[item.id] ?? 0) >= 1 && rarityMeetsMin(item.rarity, cfg.tribute_min_rarity)
  ).length

  const skillXp = (() => {
    try {
      return JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    } catch { return {} as Record<string, number> }
  })()

  const warriorLevel = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
      return skillLevelFromXP(stored['warrior'] ?? 0)
    } catch { return 0 }
  })()

  const clearedZoneIds = clearedZones ?? []
  const gateCheck = checkRaidGates(tier, clearedZoneIds, warriorLevel, skillXp, 1)
  const canEnter = eligibleCount >= cfg.tribute_count && Boolean(user) && gateCheck.ok

  const qualifiedSkills = Object.values(skillXp).filter(
    (xp) => skillLevelFromXP(xp) >= cfg.skill_level_req,
  ).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: `${cfg.color}28`, background: `linear-gradient(160deg, ${cfg.color}08 0%, rgba(13,13,26,0.97) 60%)` }}
    >
      {/* Top section */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <motion.div
            animate={{ filter: [`drop-shadow(0 0 4px ${cfg.color}40)`, `drop-shadow(0 0 10px ${cfg.color}80)`, `drop-shadow(0 0 4px ${cfg.color}40)`] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-4xl leading-none shrink-0"
          >
            {cfg.icon}
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-bold text-white">{cfg.name}</p>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full border"
                style={{ borderColor: `${cfg.color}40`, color: cfg.color, background: `${cfg.color}12` }}>
                {cfg.duration_days}d
              </span>
            </div>
            <p className="text-[9px] text-gray-500 mt-0.5 leading-snug italic">{cfg.lore}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-3 text-[9px] font-mono text-gray-500">
          <span>Boss HP <span className="text-white">{formatHp(cfg.boss_hp)}</span></span>
          <span>Per win <span style={{ color: cfg.color }}>+{formatHp(cfg.contribution_per_win)}</span></span>
          <span>Reward <span className="text-amber-400">{cfg.reward_chest.replace('_', ' ')}</span></span>
        </div>
      </div>

      {/* Requirements */}
      <div className="px-4 pb-3 space-y-1.5 border-t" style={{ borderColor: `${cfg.color}12` }}>
        <p className="text-[8px] uppercase tracking-wider font-mono text-gray-600 mt-2.5">Requirements</p>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${clearedZoneIds.length >= 8 ? 'text-green-400' : 'text-red-400'}`}>
            {clearedZoneIds.length >= 8 ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">All 8 zones cleared</span>
          <span className="ml-auto text-[9px] font-mono text-gray-600">{clearedZoneIds.length}/8</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${warriorLevel >= cfg.warrior_level_req ? 'text-green-400' : 'text-red-400'}`}>
            {warriorLevel >= cfg.warrior_level_req ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">Warrior level</span>
          <span className="ml-auto text-[9px] font-mono text-gray-600">{warriorLevel}/{cfg.warrior_level_req}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${qualifiedSkills >= 4 ? 'text-green-400' : 'text-red-400'}`}>
            {qualifiedSkills >= 4 ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">4+ skills at level {cfg.skill_level_req}</span>
          <span className="ml-auto text-[9px] font-mono text-gray-600">{qualifiedSkills}/4</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${eligibleCount >= cfg.tribute_count ? 'text-green-400' : 'text-red-400'}`}>
            {eligibleCount >= cfg.tribute_count ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">
            {cfg.tribute_count}× <span style={{ color: RARITY_COLORS[cfg.tribute_min_rarity] }}>{cfg.tribute_min_rarity}+</span> gear to sacrifice
          </span>
          <span className="ml-auto text-[9px] font-mono text-gray-600">{eligibleCount}/{cfg.tribute_count}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">ℹ</span>
          <span className="text-[10px] text-gray-500">Min {cfg.party_min} players required</span>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <button
          type="button"
          disabled={!canEnter}
          onClick={() => { playClickSound(); onStart() }}
          className="w-full py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-35"
          style={{
            background: canEnter ? `linear-gradient(135deg, ${cfg.color}30, ${cfg.color}18)` : 'transparent',
            border: `1px solid ${cfg.color}${canEnter ? '60' : '25'}`,
            color: canEnter ? '#fff' : cfg.color,
            textShadow: canEnter ? `0 0 12px ${cfg.color}` : 'none',
          }}
        >
          {canEnter ? `⚔ Begin Raid` : (gateCheck.reason ?? 'Requirements not met')}
        </button>
      </div>
    </motion.div>
  )
}

// ── Active Raid Panel ──────────────────────────────────────────────────────────

function ActiveRaidPanel({ onAttack }: { onAttack: () => void }) {
  const activeRaid = useRaidStore((s) => s.activeRaid)
  const participants = useRaidStore((s) => s.participants)
  const user = useAuthStore((s) => s.user)

  if (!activeRaid) return null

  const cfg = RAID_TIER_CONFIGS[activeRaid.tier]
  const hpPct = (activeRaid.boss_hp_remaining / activeRaid.boss_hp_max) * 100
  const today = todayUtc()

  const myParticipant = participants.find((p) => p.user_id === user?.id)
  const attackedToday = myParticipant?.daily_attacks.some((a) => a.date === today) ?? false

  const isExpired = activeRaid.ends_at ? new Date(activeRaid.ends_at) < new Date() : false
  const isOver = activeRaid.status === 'won' || activeRaid.status === 'failed' || isExpired

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: `${cfg.color}40`, background: `linear-gradient(160deg, ${cfg.color}0c 0%, rgba(13,13,26,0.97) 70%)` }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <motion.span
            animate={isOver ? {} : { filter: [`drop-shadow(0 0 4px ${cfg.color}50)`, `drop-shadow(0 0 12px ${cfg.color}90)`, `drop-shadow(0 0 4px ${cfg.color}50)`] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-3xl"
          >
            {cfg.icon}
          </motion.span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-bold text-white">{cfg.name}</p>
              {activeRaid.status === 'won' && (
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-400">CLEARED</span>
              )}
              {(activeRaid.status === 'failed' || isExpired) && (
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400">FAILED</span>
              )}
              {activeRaid.status === 'active' && !isExpired && (
                <span className="text-[8px] font-mono text-gray-500">{countdown(activeRaid.ends_at)}</span>
              )}
            </div>
            <p className="text-[9px] font-mono text-gray-600 mt-0.5">
              {formatHp(activeRaid.boss_hp_remaining)} / {formatHp(activeRaid.boss_hp_max)} HP remaining
            </p>
          </div>
        </div>

        {/* Boss HP bar */}
        <div className="mt-3 h-3 rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.05]">
          <motion.div
            className="h-full rounded-full"
            animate={{ width: `${hpPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              background: `linear-gradient(90deg, ${cfg.color}cc, ${cfg.color})`,
              boxShadow: `0 0 8px ${cfg.color}60`,
            }}
          />
        </div>
        <div className="flex justify-between text-[8px] font-mono text-gray-600 mt-1">
          <span>{hpPct.toFixed(1)}% HP remaining</span>
          <span style={{ color: cfg.color }}>{formatHp(cfg.contribution_per_win)} per win</span>
        </div>
      </div>

      {/* Party */}
      <div className="px-4 pb-3 border-t" style={{ borderColor: `${cfg.color}15` }}>
        <p className="text-[8px] uppercase tracking-wider font-mono text-gray-600 mt-2.5 mb-2">Party ({participants.length})</p>
        <div className="space-y-1.5">
          {participants.map((p) => {
            const pAttackedToday = p.daily_attacks.some((a) => a.date === today)
            const totalDmg = p.daily_attacks.filter((a) => a.won_fight).reduce((sum, a) => sum + a.damage_dealt, 0)
            return (
              <div key={p.user_id} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-white/[0.07] flex items-center justify-center text-[9px] font-mono text-gray-400 shrink-0">
                  {(p.username ?? '?')[0].toUpperCase()}
                </div>
                <p className="flex-1 text-[10px] text-white truncate min-w-0">
                  {p.user_id === user?.id ? 'You' : (p.username ?? 'Unknown')}
                </p>
                {totalDmg > 0 && (
                  <span className="text-[8px] font-mono text-gray-600 shrink-0">+{formatHp(totalDmg)}</span>
                )}
                <span className={`text-[9px] shrink-0 ${pAttackedToday ? 'text-green-400' : 'text-gray-600'}`}>
                  {pAttackedToday ? '✓ Attacked' : '○ Pending'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Attack button */}
      {!isOver && (
        <div className="px-4 pb-4">
          <button
            type="button"
            disabled={attackedToday}
            onClick={() => { playClickSound(); onAttack() }}
            className="w-full py-3 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{
              background: attackedToday ? 'transparent' : `linear-gradient(135deg, ${cfg.color}35 0%, ${cfg.color}20 100%)`,
              border: `1px solid ${cfg.color}${attackedToday ? '25' : '55'}`,
              color: attackedToday ? cfg.color : '#fff',
              textShadow: attackedToday ? 'none' : `0 0 12px ${cfg.color}`,
            }}
          >
            {attackedToday ? '✓ Attacked today — comeback tomorrow' : '⚔ Attack Today'}
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ── Main RaidsTab ─────────────────────────────────────────────────────────────

export function RaidsTab() {
  const { activeRaid, isLoading, fetchRaid, startRaid, pendingInvites, fetchInvites, acceptInvite, declineInvite } = useRaidStore()
  const pushToast = useToastStore((s) => s.push)
  const user = useAuthStore((s) => s.user)

  const [tributeFor, setTributeFor] = useState<RaidTierId | null>(null)
  const [showFight, setShowFight] = useState(false)

  useEffect(() => {
    if (user) {
      fetchRaid()
      fetchInvites()
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTributeConfirm = async (tributeItems: import('../../services/raidService').TributeItem[]) => {
    if (!tributeFor) return
    setTributeFor(null)
    const result = await startRaid(tributeFor, tributeItems)
    if (!result.ok) {
      pushToast({ kind: 'generic', message: result.error ?? 'Failed to start raid', type: 'error' })
    } else {
      pushToast({ kind: 'generic', message: `${RAID_TIER_CONFIGS[tributeFor].name} begun!`, type: 'success' })
    }
  }

  const handleFightComplete = async (damageDealt: number, wonFight: boolean) => {
    setShowFight(false)
    const store = useRaidStore.getState()
    const result = await store.attackBoss(damageDealt, wonFight)
    if (result.raidWon) {
      pushToast({ kind: 'generic', message: '🏆 RAID CLEARED! Check your inventory for rewards.', type: 'success' })
      if (result.lootItemId) {
        const item = LOOT_ITEMS.find((i) => i.id === result.lootItemId)
        const name = item?.name ?? result.lootItemId
        pushToast({ kind: 'generic', message: `🏆 Raid exclusive drop: ${name}!`, type: 'success' })
      }
    } else if (wonFight) {
      pushToast({ kind: 'generic', message: `+${formatHp(damageDealt)} raid damage dealt!`, type: 'success' })
    }
  }

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="text-[11px] text-gray-500">Log in to access raids</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Pending invites */}
      {!activeRaid && pendingInvites.length > 0 && (
        <div className="space-y-2">
          <p className="text-[8px] uppercase tracking-wider font-mono text-gray-600">Raid Invites</p>
          {pendingInvites.map((invite) => {
            const invCfg = RAID_TIER_CONFIGS[invite.tier]
            return (
              <div key={invite.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border" style={{ borderColor: `${invCfg.color}30`, background: `${invCfg.color}08` }}>
                <span className="text-base shrink-0">{invCfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white truncate">{invite.from_username ?? 'Unknown'} invited you</p>
                  <p className="text-[9px] font-mono text-gray-500">{invCfg.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => acceptInvite(invite.id)}
                  className="text-[9px] font-mono px-2 py-1 rounded-lg border transition-colors"
                  style={{ borderColor: `${invCfg.color}40`, color: invCfg.color, background: `${invCfg.color}10` }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => declineInvite(invite.id)}
                  className="text-[9px] font-mono px-2 py-1 rounded-lg border border-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Decline
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Intro text */}
      {!activeRaid && (
        <div className="text-center px-2 py-2">
          <p className="text-[10px] text-gray-600 font-mono leading-relaxed">
            Sacrifice rare gear to awaken ancient bosses. Assemble your party.<br />
            Attack daily. The strongest loot in the game awaits.
          </p>
        </div>
      )}

      {isLoading && !activeRaid && (
        <div className="py-8 text-center">
          <p className="text-[10px] text-gray-600 font-mono animate-pulse">Loading raid status...</p>
        </div>
      )}

      {/* Active raid */}
      {activeRaid && (
        <ActiveRaidPanel onAttack={() => setShowFight(true)} />
      )}

      {/* Tier cards (when no active raid) */}
      {!activeRaid && !isLoading && (
        <div className="space-y-3">
          {(['ancient', 'mythic', 'eternal'] as RaidTierId[]).map((tier) => (
            <TierCard key={tier} tier={tier} onStart={() => setTributeFor(tier)} />
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {tributeFor && (
          <TributeModal
            key="tribute"
            tier={tributeFor}
            onConfirm={handleTributeConfirm}
            onClose={() => setTributeFor(null)}
          />
        )}
        {showFight && activeRaid && (
          <RaidFightModal
            key="fight"
            tier={activeRaid.tier}
            onClose={() => setShowFight(false)}
            onComplete={handleFightComplete}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
