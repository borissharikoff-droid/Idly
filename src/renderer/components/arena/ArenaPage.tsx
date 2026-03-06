import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ZONES,
  isZoneUnlocked, getMissingGateItems, getDailyBossId, type ZoneDef,
} from '../../lib/combat'
import { LOOT_ITEMS, CHEST_DEFS, RARITY_COLORS } from '../../lib/loot'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { SKILLS, skillLevelFromXP } from '../../lib/skills'
import { CharacterCard } from '../character/CharacterCard'
import { PageHeader } from '../shared/PageHeader'
import { BackpackButton } from '../shared/BackpackButton'
import { GoldDisplay } from '../marketplace/GoldDisplay'
import { InventoryPage } from '../inventory/InventoryPage'
import { MOTION } from '../../lib/motion'
import { playClickSound } from '../../lib/sounds'


function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toString()
}

// ─── Zone card ───────────────────────────────────────────────────────────────

function ZoneCard({
  zone,
  skillLevels,
  clearedZones,
  ownedItems,
  killCount,
  activeDungeon,
  activeBattle,
  battleState,
  playerFlash,
  bossFlash,
  confirmForfeit,
  setConfirmForfeit,
  onEnter,
}: {
  zone: ZoneDef
  skillLevels: Record<string, number>
  clearedZones: string[]
  ownedItems: Record<string, number>
  killCount: number
  activeDungeon: ReturnType<typeof useArenaStore.getState>['activeDungeon']
  activeBattle: ReturnType<typeof useArenaStore.getState>['activeBattle']
  battleState: ReturnType<typeof useArenaStore.getState>['getBattleState'] extends () => infer R ? R : never
  playerFlash: boolean
  bossFlash: boolean
  confirmForfeit: boolean
  setConfirmForfeit: (v: boolean) => void
  onEnter: (zoneId: string) => void
}) {
  const unlocked = isZoneUnlocked(zone, skillLevels, clearedZones, ownedItems)
  const cleared = clearedZones.includes(zone.id)
  const isActive = activeDungeon?.zoneId === zone.id
  const endBattle = useArenaStore((s) => s.endBattle)
  const setResultModal = useArenaStore((s) => s.setResultModal)
  const forfeitDungeon = useArenaStore((s) => s.forfeitDungeon)

  const mobIndex = isActive ? (activeDungeon?.mobIndex ?? 0) : 0
  const isBossFight = isActive && mobIndex === 3
  const currentEnemy = isActive ? (isBossFight ? zone.boss : zone.mobs[mobIndex]) : null
  const battleComplete = isActive && battleState?.isComplete === true

  const reqTexts: string[] = []
  if (zone.prevZoneId && !clearedZones.includes(zone.prevZoneId)) {
    const prevZone = ZONES.find((z) => z.id === zone.prevZoneId)
    reqTexts.push(`Clear ${prevZone?.name ?? zone.prevZoneId}`)
  }
  if (zone.warriorLevelRequired && (skillLevels['warrior'] ?? 0) < zone.warriorLevelRequired) {
    reqTexts.push(`Warrior Lvl.${zone.warriorLevelRequired}`)
  }
  const missingGate = getMissingGateItems(zone, ownedItems)
  for (const itemId of missingGate) {
    const item = LOOT_ITEMS.find((x) => x.id === itemId)
    reqTexts.push(`Need ${item?.icon ?? '📦'} ${item?.name ?? itemId}`)
  }

  const tc = zone.themeColor

  // Material drop for current mob
  const mobDef = isActive && !isBossFight ? zone.mobs[mobIndex] : null
  const matDef = mobDef?.materialDropId ? LOOT_ITEMS.find((x) => x.id === mobDef.materialDropId) : null

  // ── Floating damage numbers ──────────────────────────────────────────────
  const [dmgNumbers, setDmgNumbers] = useState<Array<{ id: string; value: number; target: 'player' | 'boss' }>>([])
  const prevPlayerHpZoneRef = useRef<number | null>(null)
  const prevBossHpZoneRef = useRef<number | null>(null)

  useEffect(() => {
    if (!battleState || battleState.isComplete || !isActive) {
      prevPlayerHpZoneRef.current = null
      prevBossHpZoneRef.current = null
      return
    }
    const pp = prevPlayerHpZoneRef.current
    const pb = prevBossHpZoneRef.current
    if (pp !== null && battleState.playerHp < pp) {
      const dmg = Math.round(pp - battleState.playerHp)
      if (dmg > 0) {
        const id = crypto.randomUUID()
        setDmgNumbers((ns) => [...ns.slice(-5), { id, value: dmg, target: 'player' }])
        setTimeout(() => setDmgNumbers((ns) => ns.filter((n) => n.id !== id)), 850)
      }
    }
    if (pb !== null && battleState.bossHp < pb) {
      const dmg = Math.round(pb - battleState.bossHp)
      if (dmg > 0) {
        const id = crypto.randomUUID()
        setDmgNumbers((ns) => [...ns.slice(-5), { id, value: dmg, target: 'boss' }])
        setTimeout(() => setDmgNumbers((ns) => ns.filter((n) => n.id !== id)), 850)
      }
    }
    prevPlayerHpZoneRef.current = battleState.playerHp
    prevBossHpZoneRef.current = battleState.bossHp
  }, [battleState, isActive])

  // ── Derived ──────────────────────────────────────────────────────────────
  const playerPct = battleState && activeBattle
    ? Math.max(0, (battleState.playerHp / activeBattle.playerSnapshot.hp) * 100)
    : 100
  const playerDanger = isActive && !battleComplete && playerPct < 30

  return (
    <div>
      {/* Zone header */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
        className={`rounded-2xl border p-3.5 transition-all ${
          isActive
            ? 'rounded-b-none border-b-0'
            : !unlocked
              ? 'border-white/[0.10] bg-discord-card/70'
              : 'border-white/[0.12] bg-discord-card hover:border-white/[0.22]'
        }`}
        style={isActive ? {
          borderColor: `${tc}55`,
          background: `linear-gradient(135deg, ${tc}0d 0%, rgba(14,14,22,0.95) 60%)`,
        } : undefined}
      >
        <div className="flex items-center gap-3">
          {/* Zone icon */}
          <div
            className="shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center text-2xl"
            style={isActive
              ? { borderColor: `${tc}40`, background: `${tc}18` }
              : { borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.07)' }}
          >
            {zone.icon}
          </div>

          {/* Zone info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[13px] font-semibold text-white leading-tight">{zone.name}</p>
              {cleared && !isActive && killCount > 0 && (
                <span className="text-[8px] border border-amber-500/60 text-amber-400 font-mono px-1.5 py-0.5 rounded-md">×{killCount}</span>
              )}
              {isActive && (
                <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded-md animate-pulse" style={{ color: tc, borderColor: `${tc}40`, border: `1px solid ${tc}40`, background: `${tc}15` }}>
                  ● ACTIVE
                </span>
              )}
            </div>

            {/* Mob chain — compact step indicator */}
            <div className="flex items-center gap-0.5 mt-1.5">
              {zone.mobs.map((mob, i) => {
                const done = isActive && i < mobIndex
                const current = isActive && i === mobIndex && !isBossFight
                return (
                  <span key={mob.id} className={`text-sm leading-none transition-all ${done ? 'opacity-40' : current ? '' : 'opacity-60'}`}
                    style={current ? { filter: `drop-shadow(0 0 4px ${tc})` } : undefined}
                  >
                    {mob.icon}
                  </span>
                )
              })}
              <span className="text-[8px] text-gray-500 font-mono mx-0.5">›</span>
              <span className={`text-sm leading-none transition-all ${isBossFight ? '' : 'opacity-50'}`}
                style={isBossFight ? { filter: 'drop-shadow(0 0 4px gold)' } : undefined}>
                👑
              </span>
              {!unlocked && reqTexts.length > 0 && (
                <span className="ml-2 text-[9px] text-amber-400/80 font-mono">{reqTexts.join(' · ')}</span>
              )}
            </div>

            {unlocked && !isActive && (() => {
              const chest = CHEST_DEFS[zone.boss.rewards.chestTier]
              const rarityTheme = RARITY_COLORS[chest.rarity]
              const bossMat = zone.boss.materialDropId ? LOOT_ITEMS.find((x) => x.id === zone.boss.materialDropId) : null
              const mobMat = zone.mobs[0].materialDropId ? LOOT_ITEMS.find((x) => x.id === zone.mobs[0].materialDropId) : null
              const goldMin = zone.mobs.reduce((s, m) => s + m.goldMin, 0)
              const goldMax = zone.mobs.reduce((s, m) => s + m.goldMax, 0)
              return (
                <div className="mt-1.5 space-y-1">
                  {/* Stats row */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-400 font-mono">
                      <span className="text-red-400/70">♥</span> {formatShort(zone.mobs[0].hp)}–{formatShort(zone.boss.hp)}
                    </span>
                    <span className="text-[9px] text-gray-400 font-mono">
                      <span className="text-orange-400/70">⚔</span> {zone.mobs[0].atk}–{zone.boss.atk}
                    </span>
                  </div>
                  {/* Drops row */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[8px] text-gray-500 font-mono uppercase tracking-wider">Drops</span>
                    <span className="text-[9px] text-amber-400/80 font-mono">{formatShort(goldMin)}–{formatShort(goldMax)}g</span>
                    {mobMat && (
                      <span className="text-[9px] text-gray-400 font-mono">{mobMat.icon} {mobMat.name}</span>
                    )}
                  </div>
                  {/* Boss reward row */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[8px] text-gray-500 font-mono uppercase tracking-wider">Boss</span>
                    <span
                      className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1 py-0.5 rounded border"
                      style={{ color: rarityTheme.color, borderColor: rarityTheme.border, background: `${rarityTheme.color}10` }}
                    >
                      {chest.image
                        ? <img src={chest.image} alt={chest.name} className="w-3.5 h-3.5 object-contain" style={{ imageRendering: 'pixelated' }} />
                        : chest.icon}
                      {chest.name}
                    </span>
                    {bossMat && (
                      <span className="text-[9px] text-gray-400 font-mono">{bossMat.icon} ×{zone.boss.materialDropQty ?? 1}</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Enter / locked button */}
          {!isActive && (
            <button
              type="button"
              disabled={!unlocked || !!activeBattle}
              onClick={() => { playClickSound(); onEnter(zone.id) }}
              className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={unlocked && !activeBattle
                ? { color: tc, borderColor: `${tc}60`, border: `1px solid ${tc}60`, background: `${tc}20` }
                : { color: 'rgba(156,163,175,0.6)', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', cursor: 'not-allowed' }}
            >
              {!unlocked ? '🔒 Locked' : activeBattle ? 'Busy' : 'Enter →'}
            </button>
          )}
        </div>
      </motion.div>

      {/* Battle panel — attached below header */}
      <AnimatePresence>
        {isActive && activeBattle && (
          <motion.div
            key="dungeon-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden rounded-b-2xl border border-t-0"
            style={{ borderColor: `${tc}55`, background: `linear-gradient(180deg, ${tc}12 0%, rgba(12,12,20,0.95) 100%)` }}
          >
            {battleComplete ? (
              /* ── Battle resolved ── */
              <button
                type="button"
                onClick={() => {
                  playClickSound()
                  const victory = battleState?.victory ?? false
                  const enemyName = currentEnemy?.name ?? 'Enemy'
                  const { goldLost, chest, lostItem } = endBattle()
                  if (!activeBattle.isMob) {
                    setResultModal({ victory, gold: 0, goldAlreadyAdded: true, bossName: enemyName, goldLost, chest, lostItemName: lostItem?.name, lostItemIcon: lostItem?.icon })
                  }
                }}
                className="w-full px-4 py-5 flex items-center justify-center gap-2.5 hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors"
              >
                <span className="text-2xl">{battleState?.victory ? (activeBattle.isMob ? currentEnemy?.icon ?? '⚔️' : '🏆') : '💀'}</span>
                <div className="text-left">
                  <p className={`text-sm font-bold leading-tight ${battleState?.victory ? 'text-white' : 'text-red-400'}`}>
                    {battleState?.victory
                      ? (activeBattle.isMob ? `${currentEnemy?.name ?? 'Mob'} slain!` : 'Boss defeated!')
                      : 'You were defeated'}
                  </p>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: battleState?.victory ? tc : 'rgba(248,113,113,0.9)' }}>
                    {battleState?.victory ? 'Tap to continue →' : 'Tap to see result'}
                  </p>
                </div>
              </button>
            ) : battleState && currentEnemy ? (
              /* ── Active battle ── */
              <div className="flex">

                {/* Enemy portrait */}
                <div
                  className="shrink-0 w-[70px] flex flex-col items-center justify-center gap-1.5 border-r"
                  style={{
                    borderColor: isBossFight ? 'rgba(251,191,36,0.28)' : `${tc}28`,
                    background: isBossFight
                      ? 'radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.15) 0%, rgba(5,5,10,0.97) 70%)'
                      : `radial-gradient(ellipse at 50% 60%, ${tc}1c 0%, rgba(5,5,10,0.97) 70%)`,
                  }}
                >
                  {isBossFight && (
                    <span className="text-[7px] font-mono uppercase tracking-widest text-amber-400/55 leading-none">boss</span>
                  )}
                  <span
                    className="text-5xl leading-none select-none"
                    style={{
                      filter: `drop-shadow(0 0 8px ${isBossFight ? 'rgba(251,191,36,0.5)' : `${tc}66`})`,
                    }}
                  >
                    {currentEnemy.icon}
                  </span>
                  <span
                    className="text-[8px] font-mono tabular-nums leading-none"
                    style={{ color: bossFlash ? '#fed7aa' : `${tc}88` }}
                  >
                    {Math.max(0, Math.round((battleState.bossHp / activeBattle.bossSnapshot.hp) * 100))}%
                  </span>
                </div>

                {/* Battle info */}
                <div className="flex-1 min-w-0 px-3 pt-2.5 pb-3 space-y-2.5">

                {/* Enemy name + dungeon step */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-white leading-tight">{currentEnemy.name}</p>
                    <p className="text-[9px] font-mono" style={{ color: `${tc}aa` }}>
                      {isBossFight ? 'Boss' : `Mob ${mobIndex + 1} of 3`}
                      {!isBossFight && activeBattle.mobDef?.xpReward ? ` · +${formatShort(activeBattle.mobDef.xpReward)} XP` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                      {zone.mobs.map((_, i) => (
                        <div key={i} className="w-2 h-2 rounded-full border"
                          style={{
                            borderColor: i <= mobIndex && !isBossFight ? `${tc}80` : 'rgba(255,255,255,0.12)',
                            background: i < mobIndex ? `${tc}60` : i === mobIndex && !isBossFight ? tc : 'transparent',
                          }}
                        />
                      ))}
                      <div className="w-2 h-2 rounded-full border ml-0.5"
                        style={{
                          borderColor: isBossFight ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.12)',
                          background: isBossFight ? 'rgba(251,191,36,0.7)' : 'transparent',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* HP bars */}
                <div className="space-y-2">
                  {/* Player HP */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[10px] font-semibold transition-colors duration-100 ${playerFlash ? 'text-red-300' : playerDanger ? 'text-yellow-400' : 'text-green-400'}`}>
                        You {playerDanger && <span className="text-[8px]">⚠</span>}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                        {formatShort(battleState.playerHp)} / {formatShort(activeBattle.playerSnapshot.hp)}
                      </span>
                    </div>
                    <div className="relative">
                      <div
                        className="h-3 rounded-full overflow-hidden"
                        style={{
                          background: 'rgba(9,9,17,0.8)',
                          boxShadow: playerDanger
                            ? 'inset 0 1px 2px rgba(0,0,0,0.5), 0 0 8px rgba(239,68,68,0.35)'
                            : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: playerFlash ? '#fca5a5' : playerDanger ? 'linear-gradient(90deg, #b91c1c, #ef4444)' : 'linear-gradient(90deg, #22c55e, #4ade80)' }}
                          animate={{
                            width: `${playerPct}%`,
                            ...(playerDanger && !playerFlash ? { opacity: [1, 0.65, 1] } : { opacity: 1 }),
                          }}
                          transition={{
                            width: { duration: 0.4, ease: 'easeOut' },
                            opacity: playerDanger ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 },
                          }}
                        />
                      </div>
                      {/* Floating damage — player */}
                      <AnimatePresence>
                        {dmgNumbers.filter((n) => n.target === 'player').map((n) => (
                          <motion.span
                            key={n.id}
                            initial={{ opacity: 1, y: 0, x: 0 }}
                            animate={{ opacity: 0, y: -18 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.75, ease: 'easeOut' }}
                            className="absolute right-1 top-0 pointer-events-none text-[10px] font-bold font-mono tabular-nums"
                            style={{ color: '#fca5a5', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                          >
                            -{formatShort(n.value)}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Enemy HP */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[10px] font-semibold transition-colors duration-100 ${bossFlash ? 'text-orange-200' : 'text-red-400'}`}>
                        {currentEnemy.name}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                        {formatShort(battleState.bossHp)} / {formatShort(activeBattle.bossSnapshot.hp)}
                      </span>
                    </div>
                    <div className="relative">
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(9,9,17,0.8)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: bossFlash ? '#fed7aa' : `linear-gradient(90deg, ${tc}cc, ${tc})`,
                          }}
                          animate={{
                            width: `${Math.max(0, (battleState.bossHp / activeBattle.bossSnapshot.hp) * 100)}%`,
                          }}
                          transition={{
                            width: { duration: 0.4, ease: 'easeOut' },
                          }}
                        />
                      </div>
                      {/* Floating damage — boss */}
                      <AnimatePresence>
                        {dmgNumbers.filter((n) => n.target === 'boss').map((n) => (
                          <motion.span
                            key={n.id}
                            initial={{ opacity: 1, y: 0 }}
                            animate={{ opacity: 0, y: -18 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.75, ease: 'easeOut' }}
                            className="absolute right-1 top-0 pointer-events-none text-[10px] font-bold font-mono tabular-nums"
                            style={{ color: tc, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                          >
                            -{formatShort(n.value)}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Loot + footer row */}
                <div className="flex items-center justify-between gap-2">
                  {/* Loot preview */}
                  {matDef ? (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                      <span className="text-sm leading-none">{matDef.icon}</span>
                      <span className="text-[9px] text-gray-400 font-mono">{matDef.name}</span>
                      <span className="text-[8px] text-gray-400 font-mono ml-0.5">{Math.round((mobDef?.materialDropChance ?? 0) * 100)}%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 text-[9px] text-gray-400 font-mono">
                      <span style={{ color: '#4ade80bb' }}>⚔ {activeBattle.playerSnapshot.atk}/s</span>
                      <span className="text-gray-600">vs</span>
                      <span style={{ color: '#f87171bb' }}>♥ −{Math.max(0, activeBattle.bossSnapshot.atk - activeBattle.playerSnapshot.hpRegen).toFixed(1)}/s</span>
                    </div>
                  )}

                  {/* Forfeit */}
                  {confirmForfeit ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { forfeitDungeon(); setConfirmForfeit(false) }}
                        className="text-[10px] font-semibold text-red-200 border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Abandon
                      </button>
                      <button
                        type="button"
                        onClick={() => { playClickSound(); setConfirmForfeit(false) }}
                        className="text-[10px] font-semibold text-gray-400 hover:text-gray-300 border border-white/10 px-2 py-1 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { playClickSound(); setConfirmForfeit(true) }}
                      className="text-[9px] text-gray-400 hover:text-red-400 transition-colors font-mono underline-offset-2 hover:underline"
                    >
                      forfeit
                    </button>
                  )}
                </div>

                </div>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ArenaPage() {
  useAdminConfigStore((s) => s.rev)
  const [showBackpack, setShowBackpack] = useState(false)

  const activeBattle = useArenaStore((s) => s.activeBattle)
  const activeDungeon = useArenaStore((s) => s.activeDungeon)
  const clearedZones = useArenaStore((s) => s.clearedZones)
  const getBattleState = useArenaStore((s) => s.getBattleState)
  const endBattle = useArenaStore((s) => s.endBattle)
  const setResultModal = useArenaStore((s) => s.setResultModal)
  const startDungeon = useArenaStore((s) => s.startDungeon)
  const [battleState, setBattleState] = useState<ReturnType<typeof getBattleState>>(null)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  const [playerFlash, setPlayerFlash] = useState(false)
  const [bossFlash, setBossFlash] = useState(false)
  const prevPlayerHpRef = useRef<number | null>(null)
  const prevBossHpRef = useRef<number | null>(null)
  const flashTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const dailyBossId = getDailyBossId()

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

  // Hit flash
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

  useEffect(() => { setConfirmForfeit(false) }, [activeBattle])

  // Safety net: if dungeon is active but no battle, auto-advance (e.g. toast dismissed early)
  const advanceDungeon = useArenaStore((s) => s.advanceDungeon)
  useEffect(() => {
    if (activeDungeon && !activeBattle) {
      const t = setTimeout(() => advanceDungeon(), 400)
      return () => clearTimeout(t)
    }
  }, [activeDungeon, activeBattle, advanceDungeon])

  // Auto-resolve completed mob battle → pushes toast via arenaStore → toastStore
  useEffect(() => {
    if (!battleState?.isComplete || !activeBattle?.isMob) return
    const victory = battleState.victory
    const t = setTimeout(() => {
      const { goldLost, lostItem } = endBattle()
      if (!victory && lostItem) {
        // Died to a mob in a dungeon — show result modal so player sees what they lost
        setResultModal({ victory: false, gold: 0, goldAlreadyAdded: true, goldLost, lostItemName: lostItem.name, lostItemIcon: lostItem.icon })
      }
    }, 600)
    return () => clearTimeout(t)
  }, [battleState, activeBattle, endBattle, setResultModal])

  const killCounts = useArenaStore((s) => s.killCounts)
  const ownedItems = useInventoryStore((s) => s.items)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  // Merge owned + equipped into a single lookup for gate checks
  const ownedOrEquipped = { ...ownedItems }
  for (const itemId of Object.values(equippedBySlot)) {
    if (itemId) ownedOrEquipped[itemId] = (ownedOrEquipped[itemId] ?? 0) + 1
  }

  const inBattle = Boolean(activeBattle)

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
            <BackpackButton onClick={() => setShowBackpack(true)} />
            <GoldDisplay />
          </div>
        }
      />

      {/* ── Character Panel ── */}
      <CharacterCard locked={inBattle} />

      {/* ── Zone Map ── */}
      <div className="space-y-2.5">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-mono px-0.5">Zones</p>
        {ZONES.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            skillLevels={skillLevels}
            clearedZones={clearedZones}
            ownedItems={ownedOrEquipped}
            killCount={killCounts[zone.boss.id] ?? 0}
            activeDungeon={activeDungeon}
            activeBattle={activeBattle}
            battleState={battleState}
            playerFlash={playerFlash}
            bossFlash={bossFlash}
            confirmForfeit={confirmForfeit}
            setConfirmForfeit={setConfirmForfeit}
            onEnter={(zoneId) => { startDungeon(zoneId) }}
          />
        ))}
      </div>

      <div className="text-center">
        <p className="text-[9px] text-gray-400 font-mono">
          Daily zone boss: {ZONES.find((z) => z.boss.id === dailyBossId)?.name ?? '—'}
        </p>
      </div>

    </motion.div>
  )
}
