import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ZONES,
  isZoneUnlocked, canAffordEntry, getDailyBossId, effectiveBossDps, type ZoneDef,
} from '../../lib/combat'

const RaidsTab = lazy(() => import('./RaidsTab').then((m) => ({ default: m.RaidsTab })))
const HallOfRaidsTab = lazy(() => import('./HallOfRaidsTab').then((m) => ({ default: m.HallOfRaidsTab })))
import { getHotZoneId, hotZoneResetsInDays } from '../../lib/hotZone'
import { LOOT_ITEMS, type ChestType, type BonusMaterial } from '../../lib/loot'
import { computePlayerStats, type FoodLoadout, type FoodLoadoutSlot } from '../../lib/combat'
import { FoodSelector } from '../shared/FoodSelector'
import { useInventoryStore } from '../../stores/inventoryStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { AutoFarmLootModal } from '../animations/AutoFarmLootModal'
import { useArenaStore, type AutoRunResult } from '../../stores/arenaStore'
import { useRaidStore } from '../../stores/raidStore'
import { setAutoAcc } from '../../hooks/useArenaBattleTick'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { SKILLS, skillLevelFromXP } from '../../lib/skills'
import { CharacterCard } from '../character/CharacterCard'
import { PageHeader } from '../shared/PageHeader'
import { Sword } from '../../lib/icons'
import { fmt } from '../../lib/format'
import { BackpackButton } from '../shared/BackpackButton'
import { GoldDisplay } from '../marketplace/GoldDisplay'
import { InventoryPage } from '../inventory/InventoryPage'
import { playClickSound } from '../../lib/sounds'
import { logFriendActivity } from '../../services/friendActivityService'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useNavigationStore } from '../../stores/navigationStore'


function formatShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  return fmt(n)
}

// ─── Food selector ───────────────────────────────────────────────────────────


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
  onAutoFarm,
  onForfeit,
  passCount,
  isAutoMode,
  foodSlots,
  onFoodChange,
  lastInsuranceUsed,
  isHotZone,
  playerAtk,
  inActiveRaid,
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
  onAutoFarm: (zoneId: string) => void
  onForfeit: () => void
  passCount: number
  isAutoMode?: boolean
  foodSlots?: (FoodLoadoutSlot | null)[]
  onFoodChange?: (slots: (FoodLoadoutSlot | null)[]) => void
  lastInsuranceUsed?: boolean
  isHotZone?: boolean
  playerAtk?: number
  inActiveRaid?: boolean
}) {
  const unlocked = isZoneUnlocked(zone, skillLevels, clearedZones, ownedItems)
  const cleared = clearedZones.includes(zone.id)
  const isActive = activeDungeon?.zoneId === zone.id
  const navigateTo = useNavigationStore((s) => s.navigateTo)

  const mobIndex = isActive ? (activeDungeon?.mobIndex ?? 0) : 0
  const isBossFight = isActive && mobIndex === 3
  const currentEnemy = isActive ? (isBossFight ? zone.boss : zone.mobs[mobIndex]) : null
  const battleComplete = isActive && battleState?.isComplete === true

  const affordable = canAffordEntry(zone, ownedItems)
  const tc = zone.themeColor

  // Material drop for current mob

  const [reqOpen, setReqOpen] = useState(false)

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
      const rawDmg = pp - battleState.playerHp
      const dmg = rawDmg >= 1 ? Math.round(rawDmg) : Math.round(rawDmg * 10) / 10
      if (dmg > 0) {
        const id = crypto.randomUUID()
        setDmgNumbers((ns) => [...ns.slice(-5), { id, value: dmg, target: 'player' }])
        setTimeout(() => setDmgNumbers((ns) => ns.filter((n) => n.id !== id)), 850)
      }
    }
    if (pb !== null && battleState.bossHp < pb) {
      const rawDmg = pb - battleState.bossHp
      const dmg = rawDmg >= 1 ? Math.round(rawDmg) : Math.round(rawDmg * 10) / 10
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
      {/* Zone card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-card border overflow-hidden ${isActive ? 'rounded-b-none border-b-0' : ''}`}
        style={isActive ? {
          borderColor: `${tc}55`,
          background: `linear-gradient(160deg, ${tc}22 0%, rgba(13,13,26,0.97) 60%)`,
        } : unlocked ? {
          borderColor: `${tc}28`,
          background: `linear-gradient(160deg, ${tc}08 0%, rgba(13,13,26,0.97) 60%)`,
        } : {
          borderColor: 'rgba(255,255,255,0.08)',
          background: 'rgba(14,14,22,0.7)',
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            {/* Zone icon with glow animation */}
            <motion.div
              animate={unlocked ? {
                filter: [`drop-shadow(0 0 4px ${tc}40)`, `drop-shadow(0 0 10px ${tc}80)`, `drop-shadow(0 0 4px ${tc}40)`],
              } : {}}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-4xl leading-none shrink-0"
              style={{ filter: !unlocked ? 'grayscale(0.85) brightness(0.4)' : undefined }}
            >
              {zone.image
                ? <img src={zone.image} alt="" className="w-10 h-10 object-contain" />
                : zone.icon}
            </motion.div>

            <div className="flex-1 min-w-0">
              {/* Name + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-body font-bold ${unlocked ? 'text-white' : 'text-gray-500'}`}>
                  {zone.name}
                </p>
                {cleared && !isActive && killCount > 0 && (
                  <span className="text-micro font-mono px-1.5 py-0.5 rounded-full border border-amber-500/50 text-amber-400/80">×{killCount}</span>
                )}
                {isActive && (
                  <span className="text-micro font-semibold font-mono px-1.5 py-0.5 rounded-full animate-pulse"
                    style={{ color: tc, border: `1px solid ${tc}40`, background: `${tc}15` }}>
                    ● {isAutoMode ? 'AUTO' : 'ACTIVE'}
                  </span>
                )}
                {isHotZone && (
                  <span className="text-micro font-bold font-mono px-1.5 py-0.5 rounded-full border border-orange-500/60 text-orange-400 bg-orange-500/10 animate-pulse">
                    🔥 HOT
                  </span>
                )}
              </div>

              {/* Boss name as lore text */}
              <p className="text-micro text-gray-500 mt-0.5 leading-snug italic">
                {zone.boss.name}
              </p>
            </div>
          </div>


          {/* Mob chain progress (active only) */}
          {isActive && (
            <div className="flex items-center gap-0.5 mt-2">
              {zone.mobs.map((mob, i) => {
                const done = i < mobIndex
                const current = i === mobIndex && !isBossFight
                return (
                  <span key={mob.id}
                    className={`text-sm leading-none transition-all ${done ? 'opacity-30' : current ? '' : 'opacity-55'}`}
                    style={current ? { filter: `drop-shadow(0 0 4px ${tc})` } : undefined}
                  >
                    {mob.image
                      ? <img src={mob.image} alt="" className="w-4 h-4 object-contain inline" />
                      : mob.icon}
                  </span>
                )
              })}
              <span className="text-micro text-gray-600 font-mono mx-0.5">›</span>
              <span className={`text-sm leading-none transition-all ${isBossFight ? '' : 'opacity-45'}`}
                style={isBossFight ? { filter: 'drop-shadow(0 0 5px gold)' } : undefined}>
                {zone.boss.image
                  ? <img src={zone.boss.image} alt="" className="w-4 h-4 object-contain inline" />
                  : zone.boss.icon}
              </span>
            </div>
          )}
        </div>

        {/* Power bar + Requirements + CTA (hidden while active battle) */}
        {!isActive && (
          <>
            {/* Requirements section */}
            <div className="border-t" style={{ borderColor: `${tc}12` }}>
              <button
                type="button"
                onClick={() => setReqOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-micro uppercase tracking-wider font-mono text-gray-600">Requirements</span>
                <span className="text-micro text-gray-600 font-mono">{reqOpen ? '▲' : '▼'}</span>
              </button>
            <div className={`px-4 pb-3 space-y-1.5 ${reqOpen ? '' : 'hidden'}`}>

              {/* Prev zone unlock */}
              {zone.prevZoneId && (() => {
                const prevZone = ZONES.find((z) => z.id === zone.prevZoneId)
                const done = clearedZones.includes(zone.prevZoneId!)
                return (
                  <div className="flex items-center gap-2">
                    <span className={`text-micro ${done ? 'text-green-400' : 'text-red-400'}`}>{done ? '✓' : '✗'}</span>
                    <span className="text-micro text-gray-400">Clear {prevZone?.name ?? zone.prevZoneId}</span>
                  </div>
                )
              })()}

              {/* Warrior level */}
              {zone.warriorLevelRequired && (() => {
                const hasLevel = (skillLevels['warrior'] ?? 0) >= zone.warriorLevelRequired!
                return (
                  <div className="flex items-center gap-2">
                    <span className={`text-micro ${hasLevel ? 'text-green-400' : 'text-red-400'}`}>{hasLevel ? '✓' : '✗'}</span>
                    <span className="text-micro text-gray-400">Warrior Lvl.{zone.warriorLevelRequired}</span>
                  </div>
                )
              })()}

              {/* Gate items */}
              {zone.gateItems?.map((gateItemId) => {
                const item = LOOT_ITEMS.find((x) => x.id === gateItemId)
                const has = (ownedItems[gateItemId] ?? 0) >= 1
                return (
                  <div key={gateItemId} className="flex items-center gap-2">
                    <span className={`text-micro ${has ? 'text-green-400' : 'text-red-400'}`}>{has ? '✓' : '✗'}</span>
                    <span className="text-micro text-gray-400 flex-1">{item?.icon ?? '📦'} {item?.name ?? gateItemId}</span>
                    {!has && navigateTo && (
                      <button
                        type="button"
                        onClick={() => { playClickSound(); navigateTo('craft') }}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-colors shrink-0"
                      >
                        Craft →
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Entry cost (per run) */}
              {zone.entryCost?.map((c) => {
                const item = LOOT_ITEMS.find((x) => x.id === c.itemId)
                const owned = ownedItems[c.itemId] ?? 0
                const enough = owned >= c.quantity
                return (
                  <div key={c.itemId} className="flex items-center gap-2">
                    <span className={`text-micro ${enough ? 'text-green-400' : 'text-red-400'}`}>{enough ? '✓' : '✗'}</span>
                    <span className="text-micro text-gray-400">
                      {item?.icon ?? '📦'} {item?.name ?? c.itemId} ×{c.quantity}
                    </span>
                    <span className="ml-auto text-micro font-mono text-gray-600">
                      {owned}/{c.quantity} available
                    </span>
                  </div>
                )
              })}

              {/* No requirements */}
              {!zone.prevZoneId && !zone.warriorLevelRequired && (!zone.gateItems?.length) && (!zone.entryCost?.length) && (
                <p className="text-micro font-mono text-gray-600 italic">No requirements</p>
              )}
            </div>
            </div>

            {/* Food selector */}
            {unlocked && !activeBattle && foodSlots && onFoodChange && (
              <div className="px-4 pb-3">
                <FoodSelector slots={foodSlots} onChange={onFoodChange} ownedItems={ownedItems} />
              </div>
            )}

            {/* CTA */}
            <div className="px-4 pb-4">
              {inActiveRaid ? (
                <div className="w-full py-2.5 rounded text-micro font-mono text-center text-amber-500/70 border border-amber-500/20 bg-amber-500/05">
                  🔒 Raid in progress — dungeons locked
                </div>
              ) : activeBattle ? (
                <div className="w-full py-2.5 rounded text-micro font-mono text-center text-gray-500 border border-white/[0.06]">
                  In battle...
                </div>
              ) : unlocked ? (
                <div className="flex gap-1.5">
                  {affordable ? (
                    <button
                      type="button"
                      onClick={() => { playClickSound(); onEnter(zone.id) }}
                      className="flex-1 py-2.5 rounded text-xs font-bold transition-all active:scale-[0.98]"
                      style={{
                        background: `linear-gradient(135deg, ${tc}30, ${tc}18)`,
                        border: `1px solid ${tc}60`,
                        color: '#fff',
                        textShadow: `0 0 12px ${tc}`,
                      }}
                    >
                      ⚔ Enter
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex-1 py-2.5 rounded text-xs font-bold disabled:opacity-35"
                      style={{ background: 'transparent', border: `1px solid ${tc}25`, color: tc }}
                    >
                      Insufficient entry cost
                    </button>
                  )}
                  {passCount > 0 && (
                    <button
                      type="button"
                      title={`Auto-run ${passCount} dungeon pass${passCount === 1 ? '' : 'es'} — runs automatically without manual battles`}
                      onClick={() => { playClickSound(); onAutoFarm(zone.id) }}
                      className="px-3 py-2.5 rounded text-micro font-semibold transition-all active:scale-[0.98]"
                      style={{ color: '#fbbf24', border: '1px solid rgba(251,191,36,0.28)', background: 'rgba(251,191,36,0.08)' }}
                    >
                      🎫 ×{passCount}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 rounded text-xs font-bold disabled:opacity-35"
                  style={{ background: 'transparent', border: `1px solid ${tc}15`, color: '#6b7280' }}
                >
                  🔒 Locked
                </button>
              )}
            </div>
          </>
        )}
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
            className="overflow-hidden rounded-b border border-t-0"
            style={{ borderColor: `${tc}55`, background: `linear-gradient(180deg, ${tc}12 0%, rgba(12,12,20,0.95) 100%)` }}
          >
            {battleComplete ? (
              /* ── Battle resolved — auto-resolves via useEffect ── */
              <div className="w-full px-4 py-5 flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{battleState?.victory ? (isBossFight ? '🏆' : (currentEnemy?.icon ?? '⚔️')) : '💀'}</span>
                  <div className="text-left">
                    <p className={`text-sm font-bold leading-tight ${battleState?.victory ? 'text-white' : 'text-red-400'}`}>
                      {battleState?.victory
                        ? (isBossFight ? 'Boss defeated!' : `${currentEnemy?.name ?? 'Mob'} slain!`)
                        : 'You were defeated'}
                    </p>
                  </div>
                </div>
                {!battleState?.victory && lastInsuranceUsed && (
                  <p className="text-micro font-mono text-emerald-400 mt-0.5">
                    Death Insurance consumed — no items lost!
                  </p>
                )}
              </div>
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
                    <span className="text-micro font-mono uppercase tracking-widest text-amber-400/55 leading-none">boss</span>
                  )}
                  <span
                    className="text-5xl leading-none select-none"
                    style={{
                      filter: `drop-shadow(0 0 8px ${isBossFight ? 'rgba(251,191,36,0.5)' : `${tc}66`})`,
                    }}
                  >
                    {currentEnemy.image
                      ? <img src={currentEnemy.image} alt="" className="w-12 h-12 object-contain" />
                      : currentEnemy.icon}
                  </span>
                  <span
                    className="text-micro font-mono tabular-nums leading-none"
                    style={{ color: `${tc}88` }}
                  >
                    {Math.max(0, Math.round((battleState.bossHp / activeBattle.bossSnapshot.hp) * 100))}%
                  </span>
                </div>

                {/* Battle info */}
                <div className="flex-1 min-w-0 px-3 pt-2.5 pb-3 space-y-2.5">

                {/* Enemy name + dungeon step */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white leading-tight">{currentEnemy.name}</p>
                    <p className="text-micro font-mono" style={{ color: `${tc}aa` }}>
                      {isBossFight ? 'Boss' : `Mob ${mobIndex + 1} of 3`}
                      {!isBossFight && activeBattle.mobDef?.xpReward ? ` · +${formatShort(activeBattle.mobDef.xpReward)} XP` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeDungeon && activeDungeon.goldEarned > 0 && (
                      <span className="text-micro font-mono text-yellow-400 leading-none">
                        🪙 {fmt(activeDungeon.goldEarned)}
                      </span>
                    )}
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
                      <span className={`text-micro font-semibold transition-colors duration-100 ${playerFlash ? 'text-red-300' : playerDanger ? 'text-yellow-400' : 'text-green-400'}`}>
                        You {playerDanger && <span className="text-micro">⚠</span>}
                      </span>
                      <span className="text-micro text-gray-400 font-mono tabular-nums">
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
                            className="absolute right-1 top-0 pointer-events-none text-micro font-bold font-mono tabular-nums"
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
                      <span className="text-micro font-semibold text-red-400">
                        {currentEnemy.name}
                      </span>
                      <span className="text-micro text-gray-400 font-mono tabular-nums">
                        {formatShort(battleState.bossHp)} / {formatShort(activeBattle.bossSnapshot.hp)}
                      </span>
                    </div>
                    <div className="relative">
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(9,9,17,0.8)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${tc}cc, ${tc})`,
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
                            className="absolute right-1 top-0 pointer-events-none text-micro font-bold font-mono tabular-nums"
                            style={{ color: tc, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                          >
                            -{formatShort(n.value)}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Combat stats + footer row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-micro font-mono flex-wrap">
                    <span style={{ color: '#4ade80bb' }}>⚔ {activeBattle.playerSnapshot.atk}/s</span>
                    <span style={{ color: '#f87171bb' }}>♥ −{activeBattle.bossSnapshot.atk}/s</span>
                    {activeBattle.playerSnapshot.hpRegen > 0 && (
                      <span style={{ color: '#22d3eebb' }}>❋ +{activeBattle.playerSnapshot.hpRegen}/s</span>
                    )}
                    {(activeBattle.playerSnapshot.def ?? 0) > 0 && (
                      <span style={{ color: '#818cf8bb' }}>🛡 {activeBattle.playerSnapshot.def}</span>
                    )}
                    <span style={{ color: '#fbbf24aa' }}>= −{effectiveBossDps(activeBattle.bossSnapshot.atk, activeBattle.playerSnapshot.hpRegen, activeBattle.playerSnapshot.def).toFixed(1)}/s</span>
                    {activeBattle.foodLoadout?.some(Boolean) && (
                      <span style={{ color: '#fb923cbb' }}>🍳 Food</span>
                    )}
                  </div>

                  {/* Forfeit */}
                  {confirmForfeit ? (
                    <div className="flex flex-col gap-1 items-end">
                      {activeDungeon && activeDungeon.goldEarned > 0 && (
                        <p className="text-micro font-mono text-red-400/80">
                          lose 🪙{fmt(activeDungeon.goldEarned)} accumulated
                        </p>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { onForfeit(); setConfirmForfeit(false) }}
                          className="text-micro font-semibold text-red-200 border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 px-2.5 py-1 rounded transition-colors"
                        >
                          Abandon
                        </button>
                        <button
                          type="button"
                          onClick={() => { playClickSound(); setConfirmForfeit(false) }}
                          className="text-micro font-semibold text-gray-400 hover:text-gray-300 border border-white/10 px-2 py-1 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { playClickSound(); setConfirmForfeit(true) }}
                      className="text-micro text-gray-400 hover:text-red-400 transition-colors font-mono underline-offset-2 hover:underline"
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
  const [arenaTab, setArenaTab] = useState<'dungeons' | 'raids' | 'hall'>('dungeons')

  const activeBattle = useArenaStore((s) => s.activeBattle)
  const activeDungeon = useArenaStore((s) => s.activeDungeon)
  const clearedZones = useArenaStore((s) => s.clearedZones)
  const inActiveRaid = useRaidStore((s) => s.activeRaid?.status === 'active')
  const getBattleState = useArenaStore((s) => s.getBattleState)
  const endBattle = useArenaStore((s) => s.endBattle)
  const startDungeon = useArenaStore((s) => s.startDungeon)
  const passCount = useInventoryStore((s) => s.items['dungeon_pass'] ?? 0)
  const pushToast = useToastStore((s) => s.push)
  const [autoRunResult, setAutoRunResult] = useState<AutoRunResult | null>(null)
  const [battleState, setBattleState] = useState<ReturnType<typeof getBattleState>>(null)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  const [foodSlots, setFoodSlots] = useState<(FoodLoadoutSlot | null)[]>([null, null, null])

  // Auto mode: chain dungeon runs with passes (animated, not instant)
  const autoAccRef = useRef<{
    zoneId: string
    remaining: number
    runsCompleted: number
    totalGold: number
    totalWarriorXP: number
    materials: Record<string, { name: string; icon: string; qty: number }>
    chests: ChestType[]
    chestResults: { chestType: ChestType; itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[] }[]
    failed: boolean
    failedAt?: string
    passesUsed: number
    foodLoadout?: FoodLoadout
  } | null>(null)
  const isAutoRunning = useArenaStore((s) => s.isAutoRunning)
  const setAutoRunning = useArenaStore((s) => s.setAutoRunning)
  const [isAutoMode, _setIsAutoMode] = useState(false)
  const setIsAutoMode = useCallback((v: boolean) => { _setIsAutoMode(v); setAutoRunning(v) }, [setAutoRunning])
  const [playerFlash, setPlayerFlash] = useState(false)
  const [bossFlash, setBossFlash] = useState(false)
  const [lastInsuranceUsed, setLastInsuranceUsed] = useState(false)
  const prevPlayerHpRef = useRef<number | null>(null)
  const prevBossHpRef = useRef<number | null>(null)
  const flashTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dailyBossId = getDailyBossId()
  const hotZoneId = useMemo(() => getHotZoneId(), [])
  const hotZoneDaysLeft = useMemo(() => hotZoneResetsInDays(), [])
  const hotZone = ZONES.find((z) => z.id === hotZoneId)
  // Restore auto-mode state on mount (survives tab switches)
  useEffect(() => {
    if (isAutoRunning && !autoAccRef.current) {
      try {
        const saved = localStorage.getItem('grindly_auto_acc')
        if (saved) {
          autoAccRef.current = JSON.parse(saved)
          _setIsAutoMode(true)
        } else {
          // No saved state — reset store flag
          setAutoRunning(false)
        }
      } catch {
        setAutoRunning(false)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist auto accumulator when it changes
  useEffect(() => {
    if (isAutoMode && autoAccRef.current) {
      localStorage.setItem('grindly_auto_acc', JSON.stringify(autoAccRef.current))
    } else {
      localStorage.removeItem('grindly_auto_acc')
    }
  }, [isAutoMode, battleState])

  const handleAutoFarm = useCallback((zoneId: string) => {
    const inv = useInventoryStore.getState()
    const passes = inv.items['dungeon_pass'] ?? 0
    if (passes <= 0) return

    // Consume 1 dungeon_pass for the first run
    inv.deleteItem('dungeon_pass', 1)
    for (const slot of foodSlots) { if (slot) inv.deleteItem(slot.foodId, 1) }

    const activeFood = foodSlots.some(Boolean) ? foodSlots : undefined
    const started = startDungeon(zoneId, null, activeFood)
    if (!started) {
      inv.addItem('dungeon_pass', 1)
      // Also refund food since startDungeon failed
      for (const slot of foodSlots) { if (slot) inv.addItem(slot.foodId, 1) }
      const zone = ZONES.find((z) => z.id === zoneId)
      const missingItems = zone?.entryCost?.filter((c) => (inv.items[c.itemId] ?? 0) < c.quantity)
      if (missingItems?.length) {
        const names = missingItems.map((c) => {
          const item = LOOT_ITEMS.find((x) => x.id === c.itemId)
          return `${item?.icon ?? '📦'} ${item?.name ?? c.itemId} ×${c.quantity}`
        }).join(', ')
        pushToast({ kind: 'generic', message: `Need entry cost: ${names}`, type: 'error' })
      }
      return
    }

    const acc = {
      zoneId,
      remaining: passes - 1,
      runsCompleted: 0,
      totalGold: 0,
      totalWarriorXP: 0,
      materials: {} as Record<string, { name: string; icon: string; qty: number }>,
      chests: [] as ChestType[],
      chestResults: [] as { chestType: ChestType; itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[] }[],
      failed: false,
      passesUsed: 1,
      foodLoadout: activeFood,
    }
    autoAccRef.current = acc
    setAutoAcc(acc)
    setIsAutoMode(true)
  }, [startDungeon, setIsAutoMode, foodSlots])

  const forfeitDungeon = useArenaStore((s) => s.forfeitDungeon)

  const handleForfeit = useCallback(() => {
    const auto = autoAccRef.current
    // Cancel any pending resolve timer so it doesn't fire after forfeit
    if (resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current)
      resolveTimerRef.current = null
    }
    forfeitDungeon()
    if (auto) {
      // Auto-farm forfeit: current pass burns, show accumulated loot from completed runs
      setAutoRunResult({
        runsCompleted: auto.runsCompleted,
        totalGold: Math.max(0, auto.totalGold),
        totalWarriorXP: auto.totalWarriorXP,
        materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
        chests: auto.chests,
        chestResults: auto.chestResults,
        failed: false,
        passesUsed: auto.passesUsed,
      })
      autoAccRef.current = null
      setAutoAcc(null)
      setIsAutoMode(false)
    }
  }, [forfeitDungeon, setIsAutoMode])

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
    const interval = setInterval(tick, 500)
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

  useEffect(() => { setConfirmForfeit(false); if (activeBattle) setLastInsuranceUsed(false) }, [activeBattle])

  // Safety net: if auto mode is on but nothing is running, show accumulated loot
  useEffect(() => {
    if (isAutoMode && !activeBattle && !activeDungeon && !isAutoRunning) {
      const t = setTimeout(() => {
        const s = useArenaStore.getState()
        if (!s.activeBattle && !s.activeDungeon) {
          const auto = autoAccRef.current
          if (auto && (auto.runsCompleted > 0 || auto.passesUsed > 0)) {
            // Show accumulated loot instead of silently discarding
            setAutoRunResult({
              runsCompleted: auto.runsCompleted,
              totalGold: Math.max(0, auto.totalGold),
              totalWarriorXP: auto.totalWarriorXP,
              materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
              chests: auto.chests,
              chestResults: auto.chestResults,
              failed: false,
              passesUsed: auto.passesUsed,
            })
          }
          autoAccRef.current = null
          setAutoAcc(null)
          _setIsAutoMode(false)
        }
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [isAutoMode, isAutoRunning, activeBattle, activeDungeon])

  // Safety net: if dungeon is active but no battle, auto-advance (e.g. toast dismissed early)
  const advanceDungeon = useArenaStore((s) => s.advanceDungeon)
  useEffect(() => {
    if (activeDungeon && !activeBattle) {
      const t = setTimeout(() => advanceDungeon(), 400)
      return () => clearTimeout(t)
    }
  }, [activeDungeon, activeBattle, advanceDungeon])

  // Auto-resolve completed battles (both mob and boss).
  // Uses a ref to fire exactly once per battle, preventing the 500ms tick from resetting the timeout.
  const resolvedKeyRef = useRef<string | null>(null)

  // Pick up auto-farm results from useArenaBattleTick
  useEffect(() => {
    if (!isAutoRunning) {
      const raw = localStorage.getItem('grindly_auto_result')
      if (raw) {
        try {
          const result = JSON.parse(raw) as AutoRunResult
          setAutoRunResult(result)
        } catch { /* ignore */ }
        localStorage.removeItem('grindly_auto_result')
        autoAccRef.current = null
        _setIsAutoMode(false)
      }
    }
  }, [isAutoRunning])

  // Ensure auto mode flag stays in sync with store (prevents stale local state)
  useEffect(() => {
    if (isAutoRunning && !isAutoMode) {
      _setIsAutoMode(true)
    }
  }, [isAutoRunning, isAutoMode])

  useEffect(() => {
    if (!battleState?.isComplete || !activeBattle) return
    // When auto-running, useArenaBattleTick handles all resolution.
    // Also check isAutoMode and autoAccRef as fallback — prevents showing
    // modal on brief timing gaps between store updates and local state.
    if (useArenaStore.getState().isAutoRunning || isAutoMode || autoAccRef.current) return

    const battleKey = `${activeBattle.bossId}:${activeBattle.startTime}`
    if (resolvedKeyRef.current === battleKey) return
    resolvedKeyRef.current = battleKey

    const victory = battleState.victory ?? false
    const isMob = activeBattle.isMob
    const enemyName = activeBattle.bossSnapshot?.name ?? 'Enemy'

    resolveTimerRef.current = setTimeout(() => {
      resolveTimerRef.current = null
      const auto = autoAccRef.current

      if (isMob) {
        const { goldLost, lostItem, materialDrop, warriorXP: mobXP, insuranceUsed } = endBattle()
        if (insuranceUsed) setLastInsuranceUsed(true)
        if (victory) {
          // Track mob drops in auto accumulator
          if (auto) {
            auto.totalWarriorXP += mobXP
            if (materialDrop) {
              if (auto.materials[materialDrop.id]) {
                auto.materials[materialDrop.id].qty += materialDrop.qty
              } else {
                auto.materials[materialDrop.id] = { name: materialDrop.name, icon: materialDrop.icon, qty: materialDrop.qty }
              }
            }
          }
          // Dungeon auto-advances via safety net effect
        } else {
          // Mob defeat
          if (auto) {
            setAutoRunResult({
              runsCompleted: auto.runsCompleted,
              totalGold: Math.max(0, auto.totalGold),
              totalWarriorXP: auto.totalWarriorXP,
              materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
              chests: auto.chests,
              chestResults: auto.chestResults,
              failed: true,
              failedAt: enemyName,
              lostItem,
              passesUsed: auto.passesUsed,
            })
            autoAccRef.current = null
            setIsAutoMode(false)
          }
          // Mob defeat in dungeon — show death modal
          if (activeBattle.dungeonZoneId) {
            const dz = ZONES.find((z) => z.id === activeBattle.dungeonZoneId)
            setDungeonDeathModal({
              zoneName: dz?.name ?? 'Dungeon',
              zoneId: activeBattle.dungeonZoneId,
              goldLost,
              lostItem: lostItem ?? null,
              insuranceUsed,
            })
          }
        }
      } else {
        // Boss battle
        const { goldLost, chest, lostItem, materialDrop, dungeonGold, warriorXP, insuranceUsed: bossInsurance } = endBattle()
        if (bossInsurance) setLastInsuranceUsed(true)

        if (auto) {
          if (victory) {
            auto.runsCompleted++
            auto.totalGold += dungeonGold
            auto.totalWarriorXP += warriorXP
            if (materialDrop) {
              if (auto.materials[materialDrop.id]) {
                auto.materials[materialDrop.id].qty += materialDrop.qty
              } else {
                auto.materials[materialDrop.id] = { name: materialDrop.name, icon: materialDrop.icon, qty: materialDrop.qty }
              }
            }
            // Open chest silently (grant item but no animation — shown after summary)
            if (chest) {
              // Claim the pending reward first (endBattle adds to pendingRewards, not chest count)
              const inv = useInventoryStore.getState()
              const pending = inv.pendingRewards.find((r) => !r.claimed && r.chestType === chest.type)
              if (pending) inv.claimPendingReward(pending.id)
              const opened = useInventoryStore.getState().openChestAndGrantItem(chest.type as ChestType, { source: 'session_complete', focusCategory: null })
              auto.chests.push(chest.type as ChestType)
              if (opened) {
                if (opened.goldDropped) auto.totalGold += opened.goldDropped
                auto.chestResults.push({ chestType: chest.type as ChestType, itemId: opened.itemId, goldDropped: opened.goldDropped, bonusMaterials: opened.bonusMaterials })
              }
            }
            // More runs?
            if (auto.remaining > 0) {
              const inv = useInventoryStore.getState()
              const passes = inv.items['dungeon_pass'] ?? 0
              const zone = ZONES.find((z) => z.id === auto.zoneId)
              if (passes > 0 && zone && canAffordEntry(zone, inv.items)) {
                inv.deleteItem('dungeon_pass', 1)
                if (auto.foodLoadout) { for (const slot of auto.foodLoadout) { if (slot) inv.deleteItem(slot.foodId, 1) } }
                auto.remaining--
                auto.passesUsed++
                setTimeout(() => startDungeon(auto.zoneId, null, auto.foodLoadout), 800)
              } else {
                // Can't continue
                setAutoRunResult({
                  runsCompleted: auto.runsCompleted,
                  totalGold: Math.max(0, auto.totalGold),
                  totalWarriorXP: auto.totalWarriorXP,
                  materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
                  chests: auto.chests,
                  chestResults: auto.chestResults,
                  failed: false,
                  passesUsed: auto.passesUsed,
                })
                autoAccRef.current = null
                setIsAutoMode(false)
              }
            } else {
              // All runs done
              setAutoRunResult({
                runsCompleted: auto.runsCompleted,
                totalGold: Math.max(0, auto.totalGold),
                totalWarriorXP: auto.totalWarriorXP,
                materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
                chests: auto.chests,
                chestResults: auto.chestResults,
                failed: false,
                passesUsed: auto.passesUsed,
              })
              autoAccRef.current = null
              setIsAutoMode(false)
            }
          } else {
            // Boss defeat in auto mode
            setAutoRunResult({
              runsCompleted: auto.runsCompleted,
              totalGold: Math.max(0, auto.totalGold),
              totalWarriorXP: auto.totalWarriorXP,
              materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
              chests: auto.chests,
              chestResults: auto.chestResults,
              failed: true,
              failedAt: enemyName,
              lostItem,
              passesUsed: auto.passesUsed,
            })
            autoAccRef.current = null
            setIsAutoMode(false)
          }
        } else {
          // Normal mode (no auto)
          if (victory) {
            const matBonuses: BonusMaterial[] = materialDrop ? [{ itemId: materialDrop.id, qty: materialDrop.qty }] : []
            // Log boss kill for friend activity feed
            const uid = useAuthStore.getState().user?.id
            if (uid) {
              const zone = ZONES.find((z) => z.id === activeBattle.dungeonZoneId)
              if (zone) {
                logFriendActivity(uid, {
                  type: 'boss_kill',
                  zoneId: zone.id,
                  zoneName: zone.name,
                  bossName: activeBattle.bossSnapshot.name,
                  goldEarned: dungeonGold,
                })
              }
            }
            if (chest) {
              // Claim the pending reward first (endBattle adds to pendingRewards, not chest count)
              const inv = useInventoryStore.getState()
              const pending = inv.pendingRewards.find((r) => !r.claimed && r.chestType === chest.type)
              if (pending) inv.claimPendingReward(pending.id)
              const opened = useInventoryStore.getState().openChestAndGrantItem(chest.type as ChestType, { source: 'session_complete', focusCategory: null })
              if (opened) {
                setArenaChestModal({
                  chestType: chest.type as ChestType,
                  itemId: opened.itemId,
                  goldDropped: opened.goldDropped + dungeonGold,
                  bonusMaterials: [...matBonuses, ...opened.bonusMaterials],
                  warriorXP,
                })
              } else {
                // Fallback: chest was rolled but inventory count was 0 — show no-chest summary
                setArenaChestModal({
                  chestType: null,
                  itemId: null,
                  goldDropped: dungeonGold,
                  bonusMaterials: matBonuses,
                  warriorXP,
                })
              }
            } else {
              // No chest — show ChestOpenModal with just gold + materials + XP
              setArenaChestModal({
                chestType: null,
                itemId: null,
                goldDropped: dungeonGold,
                bonusMaterials: matBonuses,
                warriorXP,
              })
            }
          }
          // Boss defeat — show death modal if dungeon
          if (!victory && activeBattle.dungeonZoneId) {
            const dz = ZONES.find((z) => z.id === activeBattle.dungeonZoneId)
            setDungeonDeathModal({
              zoneName: dz?.name ?? 'Dungeon',
              zoneId: activeBattle.dungeonZoneId,
              goldLost,
              lostItem: lostItem ?? null,
              insuranceUsed: bossInsurance,
            })
          }
        }
      }
    }, isMob ? 600 : 1200)
  }, [battleState, activeBattle, endBattle, startDungeon, isAutoMode])

  // Clear resolve timer on forfeit / unmount
  useEffect(() => {
    if (!activeBattle && resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current)
      resolveTimerRef.current = null
    }
  }, [activeBattle])
  useEffect(() => {
    return () => { if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current) }
  }, [])

  // Chest open modal state for boss victories
  const [arenaChestModal, setArenaChestModal] = useState<{
    chestType: ChestType | null
    itemId: string | null
    goldDropped: number
    bonusMaterials: BonusMaterial[]
    warriorXP: number
  } | null>(null)

  // Dungeon death modal
  const [dungeonDeathModal, setDungeonDeathModal] = useState<{
    zoneName: string
    zoneId: string
    goldLost: number
    lostItem: { name: string; icon: string } | null
    insuranceUsed: boolean
  } | null>(null)

  const killCounts = useArenaStore((s) => s.killCounts)
  const ownedItems = useInventoryStore((s) => s.items)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const playerAtk = computePlayerStats(equippedBySlot, permanentStats).atk
  // Merge owned + equipped into a single lookup for gate checks
  const ownedOrEquipped = { ...ownedItems }
  for (const itemId of Object.values(equippedBySlot)) {
    if (itemId) ownedOrEquipped[itemId] = (ownedOrEquipped[itemId] ?? 0) + 1
  }

  const inBattle = Boolean(activeBattle || activeDungeon)

  if (showBackpack) {
    return <InventoryPage onBack={() => setShowBackpack(false)} />
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-4 pb-20 space-y-4"
    >
      {/* ── Header ── */}
      <PageHeader
        title="Arena"
        icon={<Sword className="w-4 h-4 text-red-400" />}
        rightSlot={
          <div className="flex items-center gap-2">
            <BackpackButton onClick={() => setShowBackpack(true)} />
            <GoldDisplay />
          </div>
        }
      />

      {/* ── Character Panel ── */}
      <CharacterCard locked={inBattle} />

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 p-1 rounded bg-white/[0.04] border border-white/[0.07]">
        {([
          { id: 'dungeons', label: '🗺 Dungeons', color: '#f87171' },
          { id: 'raids',    label: '⚔ Raids',    color: '#f59e0b' },
          { id: 'hall',     label: '🏛 Hall',     color: '#a78bfa' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { playClickSound(); setArenaTab(tab.id) }}
            className="flex-1 py-1.5 rounded text-caption font-semibold transition-colors"
            style={arenaTab === tab.id
              ? { background: `${tab.color}20`, color: tab.color, border: `1px solid ${tab.color}55` }
              : { color: '#6b7280' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Raids Tab ── */}
      {arenaTab === 'raids' && (
        <Suspense fallback={<p className="text-micro text-gray-600 font-mono text-center py-8 animate-pulse">Loading raids...</p>}>
          <RaidsTab />
        </Suspense>
      )}

      {/* ── Hall of Raids Tab ── */}
      {arenaTab === 'hall' && (
        <Suspense fallback={<p className="text-micro text-gray-600 font-mono text-center py-8 animate-pulse">Loading hall...</p>}>
          <HallOfRaidsTab />
        </Suspense>
      )}

      {/* ── Dungeons Tab ── */}
      {arenaTab === 'dungeons' && <>

      {/* ── Hot Zone Banner ── */}
      {hotZone && (
        <motion.div
          animate={{ boxShadow: ['0 0 0px rgba(249,115,22,0)', '0 0 12px rgba(249,115,22,0.35)', '0 0 0px rgba(249,115,22,0)'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="rounded border border-orange-500/50 bg-orange-500/[0.08] px-3 py-2 flex items-center gap-2.5"
        >
          <span className="text-lg">{hotZone.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-caption font-semibold text-orange-400">🔥 Hot Zone this week: {hotZone.name}</p>
              <span className="text-micro font-bold font-mono px-1 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 animate-pulse">LIVE</span>
            </div>
            <p className="text-micro text-gray-400 font-mono">2× gold · 2× drops · +1 chest tier · resets in {hotZoneDaysLeft}d</p>
          </div>
        </motion.div>
      )}

      {/* ── Zone Map ── */}
      <div className="space-y-2.5">
        <p className="text-micro uppercase tracking-wider text-gray-400 font-mono px-0.5">Zones</p>
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
            onEnter={(zoneId) => {
              if (inActiveRaid) return
              const inv = useInventoryStore.getState()
              for (const slot of foodSlots) { if (slot) inv.deleteItem(slot.foodId, 1) }
              startDungeon(zoneId, null, foodSlots.some(Boolean) ? foodSlots : undefined)
            }}
            foodSlots={foodSlots}
            onFoodChange={setFoodSlots}
            onAutoFarm={handleAutoFarm}
            onForfeit={handleForfeit}
            passCount={passCount}
            isAutoMode={isAutoMode}
            inActiveRaid={inActiveRaid}
            lastInsuranceUsed={lastInsuranceUsed}
            isHotZone={zone.id === hotZoneId}
            playerAtk={playerAtk}
          />
        ))}
      </div>

      <div className="text-center">
        <p className="text-micro text-gray-400 font-mono">
          Daily zone boss: {ZONES.find((z) => z.boss.id === dailyBossId)?.name ?? '—'}
        </p>
      </div>

      </> /* end dungeons tab */}

    </motion.div>

    <ChestOpenModal
      open={Boolean(arenaChestModal)}
      chestType={arenaChestModal?.chestType ?? null}
      item={arenaChestModal?.itemId ? (LOOT_ITEMS.find((x) => x.id === arenaChestModal.itemId) ?? null) : null}
      goldDropped={arenaChestModal?.goldDropped}
      bonusMaterials={arenaChestModal?.bonusMaterials}
      warriorXP={arenaChestModal?.warriorXP}
      onClose={() => setArenaChestModal(null)}
    />

    {/* Auto-Farm Loot Bag Modal */}
    <AutoFarmLootModal
      open={Boolean(autoRunResult)}
      result={autoRunResult}
      onClose={() => setAutoRunResult(null)}
    />

    {/* Dungeon Death Modal */}
    <AnimatePresence>
      {dungeonDeathModal && (
        <motion.div
          key="dungeon-death"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.88, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="rounded-card border border-red-500/30 bg-surface-0 w-full max-w-xs p-5 text-center space-y-4"
          >
            <div className="space-y-1">
              <div className="text-4xl leading-none">💀</div>
              <p className="text-base font-bold text-white">You Died</p>
              <p className="text-caption text-gray-400 font-mono">in {dungeonDeathModal.zoneName}</p>
            </div>

            <div className="rounded bg-white/5 border border-white/10 p-3 space-y-2 text-left">
              {dungeonDeathModal.goldLost > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Gold lost</span>
                  <span className="text-red-400 font-mono font-semibold">−🪙{dungeonDeathModal.goldLost}</span>
                </div>
              )}
              {dungeonDeathModal.insuranceUsed && (
                <div className="flex items-center gap-1.5 text-caption text-emerald-400">
                  <span>🛡</span>
                  <span>Death Insurance activated — no item lost</span>
                </div>
              )}
              {dungeonDeathModal.lostItem && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Item lost</span>
                  <span className="text-red-400 font-mono">
                    {dungeonDeathModal.lostItem.icon} {dungeonDeathModal.lostItem.name}
                  </span>
                </div>
              )}
              {!dungeonDeathModal.goldLost && !dungeonDeathModal.lostItem && !dungeonDeathModal.insuranceUsed && (
                <p className="text-caption text-gray-400 text-center">Nothing lost this time.</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const zid = dungeonDeathModal.zoneId
                  setDungeonDeathModal(null)
                  const inv2 = useInventoryStore.getState()
                  for (const slot of foodSlots) { if (slot) inv2.deleteItem(slot.foodId, 1) }
                  startDungeon(zid, null, foodSlots.some(Boolean) ? foodSlots : undefined)
                }}
                className="flex-1 text-xs font-semibold px-3 py-2 rounded border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
              >
                ⚔ Try Again
              </button>
              <button
                type="button"
                onClick={() => setDungeonDeathModal(null)}
                className="flex-1 text-xs font-semibold px-3 py-2 rounded border border-white/10 text-gray-400 hover:text-gray-300 transition-colors"
              >
                Retreat
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
