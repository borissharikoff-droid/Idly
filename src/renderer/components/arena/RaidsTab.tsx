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
  fetchFriends, PARTY_HP_MAX,
  type RaidTierId, type TributeItem, type Friend,
} from '../../services/raidService'
import { ROLE_ICONS, ROLE_LABELS, ROLE_COLORS } from '../../services/partyService'
import { usePartyStore } from '../../stores/partyStore'
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
          <p className="text-[10px] font-mono text-gray-500 mt-0.5">
            Select {cfg.tribute_count} item{cfg.tribute_count > 1 ? 's' : ''} of {cfg.tribute_min_rarity}+ rarity to sacrifice permanently.
          </p>
        </div>

        <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
          {eligible.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-[11px] text-gray-500">No eligible gear found.</p>
              <p className="text-[10px] text-gray-600 mt-1 font-mono">Need {cfg.tribute_count}× {cfg.tribute_min_rarity}+ gear items.</p>
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
                      <p className="text-[10px] font-mono" style={{ color: `${color}99` }}>
                        {item.rarity} · IP {ITEM_POWER_BY_RARITY[item.rarity]}
                        {items[item.id] > 1 && <span className="text-gray-600"> · owned {items[item.id]}</span>}
                      </p>
                    </div>
                    {isSelected ? (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: color }}>
                        <span className="text-[10px] text-black font-bold">✓</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-red-500/50 font-mono shrink-0">burn</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Friends note */}
          {friends.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] px-3 py-2">
              <p className="text-[10px] text-gray-600 font-mono">
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
  const partyMembers = usePartyStore((s) => s.members)
  const party = usePartyStore((s) => s.party)

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
  const participantCount = party?.status === 'active' ? partyMembers.length : 1
  const gateCheck = checkRaidGates(tier, clearedZoneIds, warriorLevel, skillXp, participantCount)
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
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border"
                style={{ borderColor: `${cfg.color}40`, color: cfg.color, background: `${cfg.color}12` }}>
                {cfg.duration_days}d
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug italic">{cfg.lore}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-3 text-[10px] font-mono text-gray-500">
          <span>Boss HP <span className="text-white">{formatHp(cfg.boss_hp)}</span></span>
          <span>Per win <span style={{ color: cfg.color }}>+{formatHp(cfg.contribution_per_win)}</span></span>
          <span>Reward <span className="text-amber-400">{cfg.reward_chest.replace('_', ' ')}</span></span>
        </div>
      </div>

      {/* Requirements */}
      <div className="px-4 pb-3 space-y-1.5 border-t" style={{ borderColor: `${cfg.color}12` }}>
        <p className="text-[10px] uppercase tracking-wider font-mono text-gray-600 mt-2.5">Requirements</p>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${clearedZoneIds.length >= cfg.zones_required ? 'text-green-400' : 'text-red-400'}`}>
            {clearedZoneIds.length >= cfg.zones_required ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">All {cfg.zones_required} zones cleared</span>
          <span className="ml-auto text-[10px] font-mono text-gray-600">{clearedZoneIds.length}/{cfg.zones_required}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${warriorLevel >= cfg.warrior_level_req ? 'text-green-400' : 'text-red-400'}`}>
            {warriorLevel >= cfg.warrior_level_req ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">Warrior level</span>
          <span className="ml-auto text-[10px] font-mono text-gray-600">{warriorLevel}/{cfg.warrior_level_req}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${qualifiedSkills >= 4 ? 'text-green-400' : 'text-red-400'}`}>
            {qualifiedSkills >= 4 ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">4+ skills at level {cfg.skill_level_req}</span>
          <span className="ml-auto text-[10px] font-mono text-gray-600">{qualifiedSkills}/4</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${eligibleCount >= cfg.tribute_count ? 'text-green-400' : 'text-red-400'}`}>
            {eligibleCount >= cfg.tribute_count ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">
            {cfg.tribute_count}× <span style={{ color: RARITY_COLORS[cfg.tribute_min_rarity] }}>{cfg.tribute_min_rarity}+</span> gear to sacrifice
          </span>
          <span className="ml-auto text-[10px] font-mono text-gray-600">{eligibleCount}/{cfg.tribute_count}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${participantCount >= cfg.party_min ? 'text-green-400' : 'text-red-400'}`}>
            {participantCount >= cfg.party_min ? '✓' : '✗'}
          </span>
          <span className="text-[10px] text-gray-400">Min {cfg.party_min} party members</span>
          <span className="ml-auto text-[10px] font-mono text-gray-600">{participantCount}/{cfg.party_min}</span>
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

// ── Heal Modal ────────────────────────────────────────────────────────────────

function HealModal({
  partyHpMax,
  onClose,
  onHeal,
}: {
  partyHpMax: number
  onClose: () => void
  onHeal: (items: { item_id: string; quantity: number }[], healAmount: number) => void
}) {
  const items = useInventoryStore((s) => s.items)
  const [selected, setSelected] = useState<Record<string, number>>({})

  // Food & plant items that have heal/regen value (consumables or items with hp perks)
  const healItems = LOOT_ITEMS.filter((item) => {
    if ((items[item.id] ?? 0) < 1) return false
    if (item.slot === 'consumable') return true
    return item.perks?.some((p) =>
      p.perkType === 'hp_boost' || p.perkType === 'hp_regen_boost',
    ) || item.perkType === 'hp_boost' || item.perkType === 'hp_regen_boost'
  })

  // Simple formula: each item heals based on rarity
  const healValue: Record<string, number> = { common: 10, rare: 25, epic: 50, legendary: 80, mythic: 120 }

  const totalHeal = Object.entries(selected).reduce((sum, [id, qty]) => {
    const item = LOOT_ITEMS.find((x) => x.id === id)
    if (!item) return sum
    return sum + (healValue[item.rarity] ?? 10) * qty
  }, 0)

  const toggleItem = (itemId: string) => {
    const item = LOOT_ITEMS.find((x) => x.id === itemId)
    if (!item) return
    const owned = items[itemId] ?? 0
    setSelected((prev) => {
      const cur = prev[itemId] ?? 0
      if (cur >= owned) {
        const next = { ...prev }
        delete next[itemId]
        return next
      }
      return { ...prev, [itemId]: cur + 1 }
    })
  }

  const handleConfirm = () => {
    if (totalHeal <= 0) return
    const itemList = Object.entries(selected).map(([item_id, quantity]) => ({ item_id, quantity }))
    onHeal(itemList, totalHeal)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="w-[340px] bg-[#0d0d1a] rounded-2xl border shadow-2xl overflow-hidden"
        style={{ borderColor: '#4ade8040' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-green-500/10 bg-green-500/05">
          <p className="text-[12px] font-bold text-white">💚 Heal the Party</p>
          <p className="text-[10px] font-mono text-gray-500 mt-0.5">
            Select food & consumables to restore party HP. Items are consumed permanently.
          </p>
        </div>

        <div className="p-4 space-y-2 max-h-[320px] overflow-y-auto">
          {healItems.length === 0 ? (
            <p className="text-center text-[11px] text-gray-500 py-4">No consumables in inventory.</p>
          ) : healItems.map((item) => {
            const qty = selected[item.id] ?? 0
            const owned = items[item.id] ?? 0
            const perItem = healValue[item.rarity] ?? 10
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors text-left"
                style={{
                  borderColor: qty > 0 ? '#4ade8040' : 'rgba(255,255,255,0.07)',
                  background: qty > 0 ? '#4ade8010' : 'rgba(255,255,255,0.025)',
                }}
              >
                <span className="text-xl shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">{item.name}</p>
                  <p className="text-[10px] font-mono text-gray-500">
                    +{perItem} HP each · owned {owned}
                  </p>
                </div>
                {qty > 0 && (
                  <span className="text-[10px] font-mono text-green-400 shrink-0">×{qty}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="px-4 pb-4 space-y-2">
          {totalHeal > 0 && (
            <p className="text-center text-[10px] font-mono text-green-400">
              +{totalHeal} party HP restored · cap {partyHpMax}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-white/15 text-gray-400 text-[11px] hover:bg-white/5 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={totalHeal <= 0}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40 border border-green-500/40 text-green-400 bg-green-500/10"
            >
              {totalHeal > 0 ? `Heal +${totalHeal} HP` : 'Select items'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Active Raid Panel ──────────────────────────────────────────────────────────

function ActiveRaidPanel({ onAttack }: { onAttack: () => void }) {
  const activeRaid = useRaidStore((s) => s.activeRaid)
  const participants = useRaidStore((s) => s.participants)
  const dismissRaid = useRaidStore((s) => s.dismissRaid)
  const healTank = useRaidStore((s) => s.healTank)
  const defendToday = useRaidStore((s) => s.defendToday)
  const user = useAuthStore((s) => s.user)
  const pushToast = useToastStore((s) => s.push)
  const deleteItem = useInventoryStore((s) => s.deleteItem)

  const [showHealModal, setShowHealModal] = useState(false)
  const [isDefending, setIsDefending] = useState(false)

  if (!activeRaid) return null

  const cfg = RAID_TIER_CONFIGS[activeRaid.tier]
  const bossHpPct = (activeRaid.boss_hp_remaining / activeRaid.boss_hp_max) * 100
  const partyHp = activeRaid.party_hp ?? PARTY_HP_MAX[activeRaid.tier]
  const partyHpMax = activeRaid.party_hp_max ?? PARTY_HP_MAX[activeRaid.tier]
  const partyHpPct = (partyHp / partyHpMax) * 100
  const today = todayUtc()

  const myParticipant = participants.find((p) => p.user_id === user?.id)
  const myRole = myParticipant?.role ?? 'dps'
  const attackedToday = myParticipant?.daily_attacks.some((a) => a.date === today) ?? false
  const healedToday = myParticipant?.heal_actions?.some((a) => a.date === today) ?? false
  const defendedToday = myParticipant?.defend_actions?.some((a) => a.date === today) ?? false

  const isExpired = activeRaid.ends_at ? new Date(activeRaid.ends_at) < new Date() : false
  const isOver = activeRaid.status === 'won' || activeRaid.status === 'failed' || isExpired

  const handleHeal = async (items: { item_id: string; quantity: number }[], healAmount: number) => {
    setShowHealModal(false)
    const result = await healTank(items, healAmount)
    if (result.ok) {
      // Consume items only after server confirms
      for (const { item_id, quantity } of items) {
        deleteItem(item_id, quantity)
      }
      pushToast({ kind: 'generic', message: `💚 Healed party for +${healAmount} HP!`, type: 'success' })
    } else {
      pushToast({ kind: 'generic', message: result.error ?? 'Heal failed', type: 'error' })
    }
  }

  const handleDefend = async () => {
    setIsDefending(true)
    playClickSound()
    const result = await defendToday()
    setIsDefending(false)
    if (result.ok) {
      pushToast({ kind: 'generic', message: '🛡 Defended! Boss damage halved today.', type: 'success' })
    } else {
      pushToast({ kind: 'generic', message: result.error ?? 'Defend failed', type: 'error' })
    }
  }

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
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-400">CLEARED</span>
              )}
              {(activeRaid.status === 'failed' || isExpired) && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400">FAILED</span>
              )}
              {activeRaid.status === 'active' && !isExpired && (
                <span className="text-[10px] font-mono text-gray-500">{countdown(activeRaid.ends_at)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Boss HP bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-gray-500">
            <span>Boss HP</span>
            <span>{formatHp(activeRaid.boss_hp_remaining)} / {formatHp(activeRaid.boss_hp_max)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.05]">
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${bossHpPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ background: `linear-gradient(90deg, ${cfg.color}cc, ${cfg.color})`, boxShadow: `0 0 8px ${cfg.color}60` }}
            />
          </div>
        </div>

        {/* Party HP bar */}
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-gray-500">
            <span>Party HP</span>
            <span className={partyHpPct < 30 ? 'text-red-400' : partyHpPct < 60 ? 'text-amber-400' : 'text-green-400'}>
              {partyHp} / {partyHpMax}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.05]">
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${partyHpPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{
                background: partyHpPct < 30
                  ? 'linear-gradient(90deg, #ef4444cc, #ef4444)'
                  : partyHpPct < 60
                    ? 'linear-gradient(90deg, #f59e0bcc, #f59e0b)'
                    : 'linear-gradient(90deg, #4ade80cc, #4ade80)',
                boxShadow: partyHpPct < 30 ? '0 0 6px #ef444460' : '0 0 6px #4ade8040',
              }}
            />
          </div>
          {partyHpPct < 40 && !isOver && (
            <p className="text-[10px] font-mono text-red-400 text-right">⚠ Healer needed!</p>
          )}
        </div>
      </div>

      {/* Party members with roles */}
      <div className="px-4 pb-3 border-t" style={{ borderColor: `${cfg.color}15` }}>
        <p className="text-[10px] uppercase tracking-wider font-mono text-gray-600 mt-2.5 mb-2">
          Party ({participants.length})
        </p>
        <div className="space-y-2.5">
          {participants.map((p) => {
            const isMe = p.user_id === user?.id
            const role = p.role ?? 'dps'
            const roleColor = ROLE_COLORS[role as keyof typeof ROLE_COLORS] ?? '#9ca3af'
            const roleIcon = ROLE_ICONS[role as keyof typeof ROLE_ICONS] ?? '⚔'
            const pAttackedToday = p.daily_attacks.some((a) => a.date === today)
            const pHealedToday = (p.heal_actions ?? []).some((a) => a.date === today)
            const pDefendedToday = (p.defend_actions ?? []).some((a) => a.date === today)
            const totalDmg = p.daily_attacks.filter((a) => a.won_fight).reduce((sum, a) => sum + a.damage_dealt, 0)
            const doneToday = role === 'healer' ? pHealedToday : role === 'tank' ? pDefendedToday : pAttackedToday
            const foughtToday = p.daily_attacks.some((a) => a.date === today)
            const lostFightToday = foughtToday && !p.daily_attacks.find((a) => a.date === today)?.won_fight
            const snap = p.character_snapshot
            const displayName = isMe ? 'You' : (p.username ?? 'Unknown')
            const avatar = p.avatar_url

            // HP bar fills relative to 500 HP (reasonable max for display)
            const hpPct = snap ? Math.min(100, (snap.hp / 500) * 100) : 100

            return (
              <div
                key={p.user_id}
                className="rounded-xl border overflow-hidden"
                style={{
                  borderColor: doneToday ? `${roleColor}30` : 'rgba(255,255,255,0.06)',
                  background: lostFightToday ? 'rgba(239,68,68,0.04)' : doneToday ? `${roleColor}06` : 'rgba(255,255,255,0.02)',
                }}
              >
                {/* Top row: avatar + name + role + status */}
                <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-sm"
                    style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${roleColor}25` }}
                  >
                    {avatar
                      ? <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                      : <span>{isMe ? '🧑' : '👤'}</span>
                    }
                  </div>

                  {/* Name + role badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-white truncate">{displayName}</span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: `${roleColor}18`, color: roleColor, border: `1px solid ${roleColor}25` }}
                      >
                        {roleIcon} {ROLE_LABELS[role as keyof typeof ROLE_LABELS]}
                      </span>
                    </div>
                  </div>

                  {/* Today's status badge */}
                  <div className="shrink-0">
                    {lostFightToday ? (
                      <span className="text-[10px] font-mono text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">✗ fell</span>
                    ) : doneToday ? (
                      <span className="text-[10px] font-mono text-green-400 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20">✓ done</span>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-600 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">○ idle</span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                {snap && (
                  <div className="px-2.5 pb-1.5">
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-orange-400">⚔ {snap.atk}</span>
                      <span className="text-green-400">♥ {snap.hp}</span>
                      <span className="text-cyan-400">❄ {snap.hp_regen}/s</span>
                      <span className="text-blue-400">🛡 {snap.def}</span>
                      {totalDmg > 0 && (
                        <span className="ml-auto text-gray-500">+{formatHp(totalDmg)} dmg</span>
                      )}
                    </div>

                    {/* Equipped gear icons */}
                    {snap.equipped.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        {snap.equipped.map((item) => {
                          const rarityColor: Record<string, string> = {
                            common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7',
                            legendary: '#f59e0b', mythic: '#ef4444',
                          }
                          const color = rarityColor[item.rarity] ?? '#9ca3af'
                          return (
                            <div
                              key={item.slot}
                              className="w-6 h-6 rounded flex items-center justify-center text-[11px]"
                              style={{ background: `${color}12`, border: `1px solid ${color}35` }}
                              title={`${item.name} (${item.slot})`}
                            >
                              {item.icon}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* HP bar */}
                    <div className="mt-1.5 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${hpPct}%`,
                          background: 'linear-gradient(90deg, #4ade80cc, #4ade80)',
                          boxShadow: '0 0 4px #4ade8040',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* No snapshot yet */}
                {!snap && (
                  <div className="px-2.5 pb-1.5">
                    <p className="text-[10px] font-mono text-gray-700">Waiting for character data…</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Action button — role-specific */}
      <div className="px-4 pb-4">
        {isOver ? (
          <button
            type="button"
            onClick={() => { playClickSound(); dismissRaid(activeRaid.id) }}
            className="w-full py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] border border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20"
          >
            Dismiss
          </button>
        ) : myRole === 'healer' ? (
          <button
            type="button"
            disabled={healedToday}
            onClick={() => { playClickSound(); setShowHealModal(true) }}
            className="w-full py-3 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{
              background: healedToday ? 'transparent' : 'linear-gradient(135deg, #4ade8035, #4ade8018)',
              border: `1px solid ${healedToday ? '#4ade8025' : '#4ade8055'}`,
              color: healedToday ? '#4ade80' : '#fff',
              textShadow: healedToday ? 'none' : '0 0 12px #4ade8080',
            }}
          >
            {healedToday ? '✓ Healed today — comeback tomorrow' : '💚 Heal Party Today'}
          </button>
        ) : myRole === 'tank' ? (
          <button
            type="button"
            disabled={defendedToday || isDefending}
            onClick={handleDefend}
            className="w-full py-3 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{
              background: defendedToday ? 'transparent' : 'linear-gradient(135deg, #60a5fa35, #60a5fa18)',
              border: `1px solid ${defendedToday ? '#60a5fa25' : '#60a5fa55'}`,
              color: defendedToday ? '#60a5fa' : '#fff',
              textShadow: defendedToday ? 'none' : '0 0 12px #60a5fa80',
            }}
          >
            {defendedToday ? '✓ Defended today — comeback tomorrow' : '🛡 Defend Today'}
          </button>
        ) : (
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
        )}
      </div>

      <AnimatePresence>
        {showHealModal && (
          <HealModal
            key="heal"
            partyHpMax={partyHpMax}
            onClose={() => setShowHealModal(false)}
            onHeal={handleHeal}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main RaidsTab ─────────────────────────────────────────────────────────────

export function RaidsTab() {
  const activeRaid = useRaidStore((s) => s.activeRaid)
  const isLoading = useRaidStore((s) => s.isLoading)
  const fetchRaid = useRaidStore((s) => s.fetchRaid)
  const startRaid = useRaidStore((s) => s.startRaid)
  const pendingInvites = useRaidStore((s) => s.pendingInvites)
  const fetchInvites = useRaidStore((s) => s.fetchInvites)
  const acceptInvite = useRaidStore((s) => s.acceptInvite)
  const declineInvite = useRaidStore((s) => s.declineInvite)
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
          <p className="text-[10px] uppercase tracking-wider font-mono text-gray-600">Raid Invites</p>
          {pendingInvites.map((invite) => {
            const invCfg = RAID_TIER_CONFIGS[invite.tier]
            return (
              <div key={invite.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border" style={{ borderColor: `${invCfg.color}30`, background: `${invCfg.color}08` }}>
                <span className="text-base shrink-0">{invCfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white truncate">{invite.from_username ?? 'Unknown'} invited you</p>
                  <p className="text-[10px] font-mono text-gray-500">{invCfg.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => acceptInvite(invite.id)}
                  className="text-[10px] font-mono px-2 py-1 rounded-lg border transition-colors"
                  style={{ borderColor: `${invCfg.color}40`, color: invCfg.color, background: `${invCfg.color}10` }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => declineInvite(invite.id)}
                  className="text-[10px] font-mono px-2 py-1 rounded-lg border border-white/10 text-gray-500 hover:text-gray-300 transition-colors"
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
