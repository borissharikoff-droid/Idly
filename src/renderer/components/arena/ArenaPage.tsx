import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BOSSES, computeBattleOutcome, computePlayerStats, meetsBossRequirements, getDailyBossId } from '../../lib/combat'
import { LOOT_ITEMS, LOOT_SLOTS, POTION_MAX, getItemPower, CHEST_DEFS, GOLD_BY_CHEST, type LootSlot, type ChestType } from '../../lib/loot'
import { useArenaStore } from '../../stores/arenaStore'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { SKILLS, skillLevelFromXP } from '../../lib/skills'
import { SLOT_META, SLOT_LABEL, LootVisual, RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { PageHeader } from '../shared/PageHeader'
import { GoldDisplay } from '../marketplace/GoldDisplay'
import { InventoryPage } from '../inventory/InventoryPage'
import { BuffTooltip } from '../shared/BuffTooltip'
import { MOTION } from '../../lib/motion'
import { playClickSound } from '../../lib/sounds'


function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

const BOSS_TIERS: string[] = ['E', 'D', 'C', 'B', 'A', 'S']
const TIER_COLORS: Record<string, string> = {
  E: 'text-gray-400 border-gray-500/30',
  D: 'text-green-400 border-green-500/30',
  C: 'text-cyan-400 border-cyan-500/30',
  B: 'text-blue-400 border-blue-500/30',
  A: 'text-purple-400 border-purple-500/30',
  S: 'text-amber-400 border-amber-500/40',
}

export function ArenaPage() {
  useAdminConfigStore((s) => s.rev) // re-render when admin config updates (boss skins etc.)
  const [showBackpack, setShowBackpack] = useState(false)
  const [inspectItemId, setInspectItemId] = useState<string | null>(null)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const unequipSlot = useInventoryStore((s) => s.unequipSlot)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const playerStats = computePlayerStats(equippedBySlot, permanentStats)
  const activeBattle = useArenaStore((s) => s.activeBattle)
  const startBattle = useArenaStore((s) => s.startBattle)
  const getBattleState = useArenaStore((s) => s.getBattleState)
  const endBattle = useArenaStore((s) => s.endBattle)
  const setResultModal = useArenaStore((s) => s.setResultModal)
  const forfeitBattle = useArenaStore((s) => s.forfeitBattle)
  const killCounts = useArenaStore((s) => s.killCounts)
  const dailyBossClaimedDate = useArenaStore((s) => s.dailyBossClaimedDate)
  const today = new Date().toLocaleDateString('sv-SE')
  const dailyBossId = getDailyBossId()

  const [battleState, setBattleState] = useState<ReturnType<typeof getBattleState>>(null)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [playerFlash, setPlayerFlash] = useState(false)
  const [bossFlash, setBossFlash] = useState(false)
  const prevPlayerHpRef = useRef<number | null>(null)
  const prevBossHpRef = useRef<number | null>(null)
  const flashTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const buildLevels = (rows: { skill_id: string; total_xp: number }[]): Record<string, number> => {
      const xpMap = new Map(rows.map((r) => [r.skill_id, r.total_xp]))
      return Object.fromEntries(SKILLS.map((s) => [s.id, skillLevelFromXP(xpMap.get(s.id) ?? 0)]))
    }
    const loadLevels = () => {
      const api = window.electronAPI
      if (api?.db?.getAllSkillXP) {
        api.db.getAllSkillXP()
          .then((rows: { skill_id: string; total_xp: number }[]) => setSkillLevels(buildLevels(rows ?? [])))
          .catch(() => setSkillLevels({}))
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
          setSkillLevels(buildLevels(Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp }))))
        } catch {
          setSkillLevels({})
        }
      }
    }
    loadLevels()
    const onVisibility = () => { if (!document.hidden) loadLevels() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!activeBattle) {
      setBattleState(null)
      return
    }
    const tick = () => setBattleState(getBattleState())
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeBattle, getBattleState])

  // Hit flash: compare consecutive HP values to detect damage events
  useEffect(() => {
    if (!battleState) {
      prevBossHpRef.current = null
      prevPlayerHpRef.current = null
      return
    }
    const bossHit = prevBossHpRef.current !== null && battleState.bossHp < prevBossHpRef.current
    const playerHit = prevPlayerHpRef.current !== null && battleState.playerHp < prevPlayerHpRef.current
    prevBossHpRef.current = battleState.bossHp
    prevPlayerHpRef.current = battleState.playerHp
    if (bossHit) {
      setBossFlash(true)
      const t = setTimeout(() => setBossFlash(false), 280)
      flashTimersRef.current.push(t)
    }
    if (playerHit) {
      setPlayerFlash(true)
      const t = setTimeout(() => setPlayerFlash(false), 280)
      flashTimersRef.current.push(t)
    }
  }, [battleState])

  useEffect(() => {
    return () => { flashTimersRef.current.forEach(clearTimeout) }
  }, [])

  useEffect(() => { setConfirmDelete(false) }, [inspectItemId])
  useEffect(() => { setConfirmForfeit(false) }, [activeBattle])

  // Battle outcome used for the active battle panel HP bar progress
  const activeBattleOutcome = activeBattle
    ? computeBattleOutcome(activeBattle.playerSnapshot, activeBattle.bossSnapshot)
    : null

  const inBattle = Boolean(activeBattle)

  const handleStartBattle = (bossId: string) => {
    playClickSound()
    startBattle(bossId)
  }

  const handleForfeit = () => {
    playClickSound()
    forfeitBattle()
  }

  const inspectItem = inspectItemId ? LOOT_ITEMS.find((x) => x.id === inspectItemId) ?? null : null

  if (showBackpack) {
    return <InventoryPage onBack={() => setShowBackpack(false)} />
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-4 pb-20 space-y-4"
    >
      {/* ── Header ── */}
      <PageHeader
        title="Arena"
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { playClickSound(); setShowBackpack(true) }}
              className="w-8 h-8 rounded-lg bg-discord-card/60 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:border-white/10 transition-colors"
              title="Backpack"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 7V6a4 4 0 0 1 8 0v1" />
                <path d="M6 7h12a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1z" />
                <path d="M9 12h6" />
              </svg>
            </button>
            <GoldDisplay />
          </div>
        }
      />

      {/* ── Loadout ── */}
      <div className="rounded-xl border border-white/10 bg-discord-card/80 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Loadout</p>
          {inBattle && (
            <p className="text-[10px] text-amber-400/60 font-mono">stats locked at start</p>
          )}
        </div>
        <div className="flex gap-2">
          {/* Gear slots — layout: head/body/legs on left, ring/weapon compact squares on right */}
          {(() => {
            // Full-width horizontal row slot (head/body/legs)
            const renderRowSlot = (slot: LootSlot) => {
              const meta = SLOT_META[slot]
              const item = equippedBySlot[slot]
                ? LOOT_ITEMS.find((x) => x.id === equippedBySlot[slot]) ?? null
                : null
              const theme = item ? RARITY_THEME[normalizeRarity(item.rarity)] : null
              const inner = (
                <>
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={theme
                      ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}55 0%, rgba(9,9,17,0.95) 70%)` }
                      : { background: 'rgba(9,9,17,0.85)' }}
                  >
                    {item
                      ? <LootVisual icon={item.icon} image={item.image} className="w-5 h-5 object-contain" scale={item.renderScale ?? 1} />
                      : <span className="text-[12px] opacity-[0.13]">{meta.icon}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[7px] text-gray-500 font-mono uppercase tracking-wider leading-none">{meta.label}</p>
                    <p className={`text-[10px] font-medium truncate mt-0.5 leading-tight ${item ? 'text-white/85' : 'text-gray-600'}`}>
                      {item ? item.name : 'Empty'}
                    </p>
                    {item && item.perkType === 'atk_boost' && (
                      <p className="text-[8px] text-red-400/70 font-mono leading-none mt-0.5">+{item.perkValue} ATK</p>
                    )}
                  </div>
                  {theme && <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: theme.color }} />}
                </>
              )
              return (
                <BuffTooltip key={slot} item={item} placement="bottom" stretch>
                  <div
                    className="rounded-md border overflow-hidden h-full"
                    style={theme
                      ? { borderColor: theme.border, background: `linear-gradient(135deg, ${theme.glow}10 0%, rgba(12,12,20,0.95) 55%)` }
                      : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(12,12,20,0.70)' }}
                  >
                    {item ? (
                      <button type="button" onClick={() => { playClickSound(); setInspectItemId(item.id) }}
                        className="w-full h-full px-2 py-2.5 flex items-center gap-2 hover:bg-white/[0.05] transition-colors">
                        {inner}
                      </button>
                    ) : (
                      <div className="h-full px-2 py-2.5 flex items-center gap-2">{inner}</div>
                    )}
                  </div>
                </BuffTooltip>
              )
            }

            // Compact square slot (ring/weapon) — icon centered + label + perk
            const renderSquareSlot = (slot: LootSlot) => {
              const meta = SLOT_META[slot]
              const item = equippedBySlot[slot]
                ? LOOT_ITEMS.find((x) => x.id === equippedBySlot[slot]) ?? null
                : null
              const theme = item ? RARITY_THEME[normalizeRarity(item.rarity)] : null
              const inner = (
                <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full py-2 px-1">
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={theme
                      ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}55 0%, rgba(9,9,17,0.95) 70%)` }
                      : { background: 'rgba(9,9,17,0.85)' }}
                  >
                    {item
                      ? <LootVisual icon={item.icon} image={item.image} className="w-5 h-5 object-contain" scale={item.renderScale ?? 1} />
                      : <span className="text-[13px] opacity-[0.13]">{meta.icon}</span>}
                  </div>
                  <p className="text-[7px] text-gray-500 font-mono uppercase tracking-wider leading-none text-center w-full truncate">
                    {item ? item.name : meta.label}
                  </p>
                  {item && item.perkType === 'atk_boost' && (
                    <p className="text-[7px] text-red-400/70 font-mono leading-none">+{item.perkValue} ATK</p>
                  )}
                  {theme && <div className="w-1 h-1 rounded-full" style={{ background: theme.color }} />}
                </div>
              )
              return (
                <BuffTooltip key={slot} item={item} placement="bottom" stretch>
                  <div
                    className="rounded-md border overflow-hidden h-full"
                    style={theme
                      ? { borderColor: theme.border, background: `linear-gradient(135deg, ${theme.glow}10 0%, rgba(12,12,20,0.95) 55%)` }
                      : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(12,12,20,0.70)' }}
                  >
                    {item ? (
                      <button type="button" onClick={() => { playClickSound(); setInspectItemId(item.id) }}
                        className="w-full h-full hover:bg-white/[0.05] transition-colors">
                        {inner}
                      </button>
                    ) : (
                      <div className="h-full">{inner}</div>
                    )}
                  </div>
                </BuffTooltip>
              )
            }

            return (
              <div className="flex gap-1" style={{ flex: '2', minWidth: 0 }}>
                {/* Left: head / body / legs */}
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  {(['head', 'body', 'legs'] as LootSlot[]).map((s) => (
                    <div key={s} className="flex-1 min-h-0">{renderRowSlot(s)}</div>
                  ))}
                </div>
                {/* Right: ring (top) / weapon (bottom, taller) */}
                <div className="flex flex-col gap-1" style={{ width: 52 }}>
                  <div className="flex-1 min-h-0">{renderSquareSlot('ring')}</div>
                  <div style={{ flex: 2 }} className="min-h-0">{renderSquareSlot('weapon')}</div>
                </div>
              </div>
            )
          })()}

          <div className="flex-1 min-w-0 rounded-lg border border-white/10 bg-discord-darker/40 p-2 flex flex-col gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1.5">Stats</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between" title="Damage you deal to the boss per second">
                  <span className="text-[10px] text-gray-400">ATK <span className="text-[9px] text-gray-600">/s</span></span>
                  <span className={`text-[12px] font-mono font-bold ${permanentStats.atk >= POTION_MAX ? 'text-amber-400' : 'text-red-400'}`}>{playerStats.atk}</span>
                </div>
                <div className="flex items-center justify-between" title="Total health — boss drains this">
                  <span className="text-[10px] text-gray-400">HP</span>
                  <span className={`text-[12px] font-mono font-bold ${permanentStats.hp >= POTION_MAX ? 'text-amber-400' : 'text-green-400'}`}>{playerStats.hp}</span>
                </div>
                <div className="flex items-center justify-between" title="HP restored per second — reduces boss's effective damage">
                  <span className="text-[10px] text-gray-400">Regen <span className="text-[9px] text-gray-600">/s</span></span>
                  <span className={`text-[12px] font-mono font-bold ${permanentStats.hpRegen >= POTION_MAX ? 'text-amber-400' : 'text-cyan-400'}`}>{playerStats.hpRegen}</span>
                </div>
                <div className="flex items-center justify-between" title="Total Item Power from equipped gear">
                  <span className="text-[10px] text-gray-400">IP</span>
                  <span className="text-[12px] font-mono font-bold text-amber-300">
                    {LOOT_SLOTS.reduce((sum, s) => { const id = equippedBySlot[s]; if (!id) return sum; const it = LOOT_ITEMS.find((x) => x.id === id); return sum + (it ? getItemPower(it.rarity) : 0) }, 0)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1.5">Buffs</p>
              {(() => {
                const equippedItems = LOOT_SLOTS.map((slot) => {
                  const id = equippedBySlot[slot]
                  if (!id) return null
                  const it = LOOT_ITEMS.find((x) => x.id === id)
                  if (!it) return null
                  return { slot, item: it }
                }).filter((e): e is { slot: LootSlot; item: (typeof LOOT_ITEMS)[number] } => Boolean(e))

                if (equippedItems.length === 0) {
                  return <p className="text-[10px] text-gray-600">No gear — base stats only.</p>
                }
                return (
                  <div className="space-y-1.5">
                    {equippedItems.map(({ slot, item }) => (
                      <div key={slot} className="rounded-md border border-white/10 bg-discord-card/60 p-1.5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[8px] font-mono uppercase tracking-wide px-1 py-px rounded border border-white/10 text-gray-500 leading-none flex-shrink-0">
                            {SLOT_LABEL[slot]}
                          </span>
                          <p className={`text-[9px] font-mono truncate ${item.perkType !== 'cosmetic' ? 'text-cyber-neon' : 'text-gray-400'}`}>
                            {item.name}
                          </p>
                        </div>
                        <p className="text-[9px] text-gray-300 leading-snug">{item.perkDescription}</p>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Boss list ── */}
      <div className="space-y-2.5">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono px-0.5">Bosses</p>
        {BOSSES.map((boss, i) => {
          const meetsReqs = meetsBossRequirements(playerStats, skillLevels, boss)
          const isCurrentBoss = activeBattle?.bossSnapshot.id === boss.id
          const canStart = meetsReqs && !inBattle
          const isLocked = !meetsReqs
          const req = boss.requirements
          const battlePanelOpen = isCurrentBoss && !!activeBattle
          const battleComplete = battlePanelOpen && battleState?.isComplete === true
          const tier = BOSS_TIERS[i] ?? 'E'
          const killCount = killCounts[boss.id] ?? 0
          const isDaily = boss.id === dailyBossId
          const dailyClaimed = isDaily && dailyBossClaimedDate === today

          const reqTexts: string[] = []
          if (req) {
            if (req.minAtk != null) reqTexts.push(`${req.minAtk} ATK`)
            if (req.minHp != null) reqTexts.push(`${req.minHp} HP`)
            if (req.minHpRegen != null) reqTexts.push(`${req.minHpRegen} Regen`)
            if (req.minSkillLevel) {
              for (const [skillId, minLevel] of Object.entries(req.minSkillLevel)) {
                const skillName = SKILLS.find((s) => s.id === skillId)?.name ?? skillId
                reqTexts.push(`${minLevel} lvl ${skillName}`)
              }
            }
          }

          return (
            // Outer wrapper — clips the sliding battle panel so it looks glued to the card
            <div key={boss.id} className="space-y-0">
              {/* Boss card */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: MOTION.duration.base, ease: MOTION.easing }}
                className={`rounded-2xl border p-3.5 flex items-center gap-3 transition-colors ${
                  battlePanelOpen
                    ? 'rounded-b-none border-b-0 border-cyber-neon/40 bg-cyber-neon/5'
                    : isCurrentBoss
                      ? 'border-cyber-neon/30 bg-cyber-neon/5'
                      : isLocked
                        ? 'border-white/[0.05] bg-[#1a1a28]/50 opacity-60'
                        : 'border-white/[0.08] bg-[#1e1e2e]/90'
                }`}
              >
                {/* Boss avatar */}
                <div
                  className={`shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center ${
                    isCurrentBoss
                      ? 'border-cyber-neon/40 bg-cyber-neon/10'
                      : 'border-white/10 bg-discord-darker/60'
                  }`}
                >
                  <LootVisual icon={boss.icon} image={boss.image} className="w-7 h-7 object-contain" scale={1.1} />
                </div>

                {/* Boss info */}
                <div className="min-w-0 flex-1">
                  {/* Row 1: name + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-white leading-tight">{boss.name}</p>
                    <span className={`text-[9px] font-mono px-1 rounded border leading-[1.4] ${TIER_COLORS[tier]}`}>
                      {tier}
                    </span>
                    {isDaily && (
                      <span className={`text-[9px] font-mono px-1 rounded border leading-[1.4] ${dailyClaimed ? 'border-gray-700 text-gray-600' : 'border-amber-400/50 text-amber-300'}`}>
                        {dailyClaimed ? '✓ daily' : '⭐ daily'}
                      </span>
                    )}
                    {killCount > 0 && (
                      <span className="text-[9px] text-gray-500 font-mono">⚔ ×{killCount}</span>
                    )}
                    {isCurrentBoss && (
                      <span className="text-[9px] text-cyber-neon font-mono animate-pulse">● FIGHTING</span>
                    )}
                    {isLocked && !isCurrentBoss && (
                      <span className="text-[9px] text-gray-500 font-mono">🔒</span>
                    )}
                  </div>

                  {/* Row 2: stat chips — HP / ATK */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold text-red-300 bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded">
                      ❤️ {formatShort(boss.hp)}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/25 px-1.5 py-0.5 rounded">
                      ⚔️ {boss.atk}<span className="text-[8px] text-orange-400/60">/s</span>
                    </span>
                  </div>

                  {/* Row 3: guaranteed chest drop */}
                  {(() => {
                    const chestTier = isDaily && !dailyClaimed
                      ? ({ common_chest: 'rare_chest', rare_chest: 'epic_chest', epic_chest: 'legendary_chest', legendary_chest: 'legendary_chest' } as Record<string, string>)[boss.rewards.chestTier] ?? boss.rewards.chestTier
                      : boss.rewards.chestTier
                    const chestDef = CHEST_DEFS[chestTier as ChestType]
                    const goldRange = GOLD_BY_CHEST[chestTier as ChestType]
                    if (!chestDef) return null
                    return (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-[10px] font-mono text-purple-300/80 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                          100%
                        </span>
                        <span className="text-[10px] text-gray-500">→</span>
                        <span className="text-[10px] text-gray-300 font-medium">{chestDef.icon} {chestDef.name}{isDaily && !dailyClaimed ? ' ⭐' : ''}</span>
                        {goldRange && (
                          <span className="text-[9px] text-amber-400/50 font-mono">({goldRange.min}–{goldRange.max}🪙)</span>
                        )}
                      </div>
                    )
                  })()}

                  {/* Row 4: requirements if locked */}
                  {isLocked && reqTexts.length > 0 && (
                    <p className="text-[10px] text-amber-400/60 mt-1">
                      <span className="text-gray-600">Requires:</span> {reqTexts.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={() => handleStartBattle(boss.id)}
                  disabled={!canStart}
                  className={`shrink-0 min-w-[56px] px-3 py-2 rounded-xl text-xs font-semibold transition-all text-center ${
                    isCurrentBoss
                      ? 'bg-cyber-neon/10 border border-cyber-neon/30 text-cyber-neon/80 cursor-default'
                      : canStart
                        ? 'bg-cyber-neon/20 border border-cyber-neon/40 text-cyber-neon hover:bg-cyber-neon/30 active:scale-95'
                        : 'bg-transparent border border-white/[0.07] text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {isCurrentBoss ? '⚔' : canStart ? 'Fight' : isLocked ? '🔒' : 'Busy'}
                </button>
              </motion.div>

              {/* Battle progress panel — glued to the bottom of the boss card */}
              <AnimatePresence>
                {battlePanelOpen && activeBattle && activeBattleOutcome && (
                  <motion.div
                    key="battle-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
                    className="overflow-hidden rounded-b-2xl border border-t-0 border-cyber-neon/40 bg-cyber-neon/5"
                  >
                    {battleComplete ? (
                      /* Tap to collect — also auto-resolves via useArenaBattleTick after 1.2s */
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound()
                          const victory = battleState?.victory ?? false
                          const bossName = activeBattle.bossSnapshot.name
                          const { goldLost, chest } = endBattle()
                          setResultModal({ victory, gold: 0, goldAlreadyAdded: true, bossName, goldLost, chest })
                        }}
                        className="w-full px-3.5 py-5 flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
                      >
                        <span className="text-xl">{battleState?.victory ? '🏆' : '💀'}</span>
                        <p className={`text-sm font-bold ${battleState?.victory ? 'text-cyber-neon' : 'text-red-400'}`}>
                          {battleState?.victory ? 'Boss Slain! — Tap to collect' : 'Defeated — Tap to continue'}
                        </p>
                      </button>
                    ) : battleState ? (
                      <div className="px-3.5 pt-3 pb-3.5 space-y-3">
                        {/* HP bars */}
                        <div className="space-y-2.5">
                          {/* Player HP */}
                          <div>
                            <div className="flex justify-between items-baseline mb-1">
                              <span className={`text-[11px] font-medium transition-colors duration-150 ${playerFlash ? 'text-red-300' : 'text-green-400'}`}>Your HP</span>
                              <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                                {formatShort(battleState.playerHp)} / {formatShort(activeBattle.playerSnapshot.hp)}
                              </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-discord-darker overflow-hidden border border-white/[0.05]">
                              <motion.div
                                className={`h-full rounded-full transition-colors duration-150 ${playerFlash ? 'bg-red-300' : 'bg-green-500'}`}
                                animate={{ width: `${Math.max(0, (battleState.playerHp / activeBattle.playerSnapshot.hp) * 100)}%` }}
                                transition={{ duration: 0.35 }}
                              />
                            </div>
                          </div>

                          {/* Boss HP */}
                          <div>
                            <div className="flex justify-between items-baseline mb-1">
                              <span className={`text-[11px] font-medium transition-colors duration-150 ${bossFlash ? 'text-orange-200' : 'text-red-400'}`}>{boss.name} HP</span>
                              <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                                {formatShort(battleState.bossHp)} / {formatShort(activeBattle.bossSnapshot.hp)}
                              </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-discord-darker overflow-hidden border border-white/[0.05]">
                              <motion.div
                                className={`h-full rounded-full transition-colors duration-150 ${bossFlash ? 'bg-orange-200' : 'bg-red-500'}`}
                                animate={{ width: `${Math.max(0, (battleState.bossHp / activeBattle.bossSnapshot.hp) * 100)}%` }}
                                transition={{ duration: 0.35 }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Footer: damage rates + forfeit */}
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-gray-500 font-mono">
                            <span className="text-green-500/70">You: {activeBattle.playerSnapshot.atk}/s</span>
                            {' · '}
                            <span className="text-red-500/70">Boss: {Math.max(0, activeBattle.bossSnapshot.atk - activeBattle.playerSnapshot.hpRegen)}/s</span>
                          </p>
                          {confirmForfeit ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => { handleForfeit(); setConfirmForfeit(false) }}
                                className="text-[10px] font-semibold text-red-200 border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => { playClickSound(); setConfirmForfeit(false) }}
                                className="text-[10px] font-semibold text-gray-400 hover:text-gray-300 border border-white/10 px-2 py-1 rounded-lg transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { playClickSound(); setConfirmForfeit(true) }}
                              className="text-[10px] font-semibold text-red-400/60 hover:text-red-300 border border-red-500/25 hover:border-red-400/40 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Forfeit
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* ── Item inspect portal ── */}
      {createPortal(
        <AnimatePresence>
          {inspectItem && (() => {
            const item = inspectItem
            const slot = item.slot
            const inspectRarity = normalizeRarity(item.rarity)
            const inspectTheme = RARITY_THEME[inspectRarity]
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: MOTION.duration.fast }}
                className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setInspectItemId(null)}
              >
                <motion.div
                  initial={{ scale: 0.92, opacity: 0, y: 12 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 8 }}
                  transition={MOTION.spring.pop}
                  className="w-[300px] rounded-xl border p-4 relative overflow-hidden"
                  style={{
                    borderColor: inspectTheme.border,
                    background: inspectTheme.panel,
                    boxShadow: `0 0 24px ${inspectTheme.glow}`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 50% 18%, ${inspectTheme.glow} 0%, transparent 58%)` }}
                    animate={{ opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 2.2, repeat: Infinity }}
                  />
                  <div className="flex items-start gap-3 relative">
                    <LootVisual
                      icon={item.icon}
                      image={item.image}
                      className="w-12 h-12 object-contain shrink-0"
                      scale={item.renderScale ?? 1}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-semibold leading-tight">{item.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{SLOT_LABEL[slot]}</p>
                      <span
                        className="inline-flex mt-1.5 text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide"
                        style={{
                          color: inspectTheme.color,
                          borderColor: inspectTheme.border,
                          backgroundColor: `${inspectTheme.color}1A`,
                        }}
                      >
                        {inspectRarity}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-white/10 bg-discord-darker/40 p-2.5 relative">
                    <p className="text-[11px] text-gray-300 leading-relaxed">{item.perkDescription}</p>
                  </div>
                  <div className="mt-3 flex gap-2 relative">
                    <button
                      type="button"
                      disabled={inBattle}
                      onClick={() => { if (!inBattle) { playClickSound(); unequipSlot(slot); setInspectItemId(null) } }}
                      className={`flex-1 text-[11px] py-2 rounded-lg border font-semibold transition-colors ${
                        inBattle ? 'border-white/10 text-gray-600 cursor-not-allowed' : ''
                      }`}
                      style={
                        inBattle
                          ? undefined
                          : { color: inspectTheme.color, borderColor: inspectTheme.border, backgroundColor: `${inspectTheme.color}22` }
                      }
                      title={inBattle ? 'Gear is locked during battle' : undefined}
                    >
                      {inBattle ? '⚔ Locked' : 'Unequip'}
                    </button>
                    {inBattle ? (
                      <button
                        type="button"
                        disabled
                        className="flex-1 text-[11px] py-2 rounded-lg border border-white/10 text-gray-600 cursor-not-allowed"
                        title="Can't delete gear during battle"
                      >
                        ⚔ Locked
                      </button>
                    ) : confirmDelete ? (
                      <div className="flex gap-1.5 flex-1">
                        <button
                          type="button"
                          onClick={() => { playClickSound(); unequipSlot(slot); deleteItem(item.id, 1); setInspectItemId(null) }}
                          className="flex-1 text-[11px] py-2 rounded-lg border border-red-400/50 bg-red-500/15 text-red-200 hover:bg-red-400/25 transition-colors"
                        >
                          Delete!
                        </button>
                        <button
                          type="button"
                          onClick={() => { playClickSound(); setConfirmDelete(false) }}
                          className="flex-1 text-[11px] py-2 rounded-lg border border-white/10 text-gray-400 hover:text-gray-300 transition-colors"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { playClickSound(); setConfirmDelete(true) }}
                        className="flex-1 text-[11px] py-2 rounded-lg border border-red-400/35 text-red-300 hover:bg-red-400/10 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  )
}
