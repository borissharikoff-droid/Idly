import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ZONES,
  isZoneUnlocked, getMissingGateItems, canAffordEntry, getDailyBossId, effectiveBossDps, type ZoneDef,
} from '../../lib/combat'
import { LOOT_ITEMS, type ChestType, type BonusMaterial } from '../../lib/loot'
import { useInventoryStore } from '../../stores/inventoryStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { useArenaStore, type AutoRunResult } from '../../stores/arenaStore'
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
  onAutoFarm,
  passCount,
  isAutoMode,
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
  passCount: number
  isAutoMode?: boolean
}) {
  const unlocked = isZoneUnlocked(zone, skillLevels, clearedZones, ownedItems)
  const cleared = clearedZones.includes(zone.id)
  const isActive = activeDungeon?.zoneId === zone.id
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

  const affordable = canAffordEntry(zone, ownedItems)
  const tc = zone.themeColor

  // Material drop for current mob

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
            {zone.image
              ? <img src={zone.image} alt="" className="w-8 h-8 object-contain" />
              : zone.icon}
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
                  ● {isAutoMode ? 'AUTO' : 'ACTIVE'}
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
                    {mob.image
                      ? <img src={mob.image} alt="" className="w-4 h-4 object-contain inline" />
                      : mob.icon}
                  </span>
                )
              })}
              <span className="text-[8px] text-gray-500 font-mono mx-0.5">›</span>
              <span className={`text-sm leading-none transition-all ${isBossFight ? '' : 'opacity-50'}`}
                style={isBossFight ? { filter: 'drop-shadow(0 0 4px gold)' } : undefined}>
                {zone.boss.image
                  ? <img src={zone.boss.image} alt="" className="w-4 h-4 object-contain inline" />
                  : zone.boss.icon}
              </span>
            </div>

            {!isActive && (
              <div className="mt-1.5 space-y-1">
                {/* Boss stats row */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-400 font-mono">
                    <span className="text-red-400/70">♥</span> Boss HP {formatShort(zone.boss.hp)}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono">
                    <span className="text-orange-400/70">⚔</span> Boss ATK {zone.boss.atk}/s
                  </span>
                </div>
                {/* Unified requirements */}
                {(reqTexts.length > 0 || (zone.entryCost && zone.entryCost.length > 0)) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[8px] text-gray-500 font-mono uppercase tracking-wider">Req:</span>
                    {reqTexts.map((txt) => (
                      <span
                        key={txt}
                        className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1 py-0.5 rounded"
                        style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)' }}
                      >
                        {txt}
                      </span>
                    ))}
                    {zone.entryCost?.map((c) => {
                      const item = LOOT_ITEMS.find((x) => x.id === c.itemId)
                      const owned = ownedItems[c.itemId] ?? 0
                      const enough = owned >= c.quantity
                      return (
                        <span
                          key={c.itemId}
                          className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1 py-0.5 rounded"
                          style={{
                            color: enough ? 'rgba(255,255,255,0.7)' : '#ff6b6b',
                            background: enough ? 'rgba(255,255,255,0.05)' : 'rgba(255,107,107,0.1)',
                          }}
                        >
                          {item?.icon ?? '📦'}
                          <span>{item?.name ?? c.itemId}</span>
                          <span style={{ color: enough ? 'rgba(255,255,255,0.4)' : 'rgba(255,107,107,0.7)' }}>
                            ×{c.quantity}
                          </span>
                          <span className="text-[8px]" style={{ color: enough ? 'rgba(134,239,172,0.6)' : 'rgba(255,107,107,0.5)' }}>
                            ({owned})
                          </span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Enter / locked button */}
          {!isActive && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!unlocked || !!activeBattle || !affordable}
                onClick={() => { playClickSound(); onEnter(zone.id) }}
                className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={unlocked && !activeBattle && affordable
                  ? { color: tc, borderColor: `${tc}60`, border: `1px solid ${tc}60`, background: `${tc}20` }
                  : { color: 'rgba(156,163,175,0.6)', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', cursor: 'not-allowed' }}
              >
                {!unlocked ? '🔒 Locked' : activeBattle ? 'Busy' : !affordable ? '📦 Need items' : 'Enter →'}
              </button>
              {cleared && passCount > 0 && !activeBattle && (
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => { playClickSound(); onAutoFarm(zone.id) }}
                  className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={affordable
                    ? { color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.12)' }
                    : { color: 'rgba(156,163,175,0.6)', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', cursor: 'not-allowed' }}
                >
                  🎫 Auto ×{passCount}
                </button>
              )}
            </div>
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
              /* ── Battle resolved — auto-resolves via useEffect ── */
              <div className="w-full px-4 py-5 flex items-center justify-center gap-2.5">
                <span className="text-2xl">{battleState?.victory ? (isBossFight ? '🏆' : (currentEnemy?.icon ?? '⚔️')) : '💀'}</span>
                <div className="text-left">
                  <p className={`text-sm font-bold leading-tight ${battleState?.victory ? 'text-white' : 'text-red-400'}`}>
                    {battleState?.victory
                      ? (isBossFight ? 'Boss defeated!' : `${currentEnemy?.name ?? 'Mob'} slain!`)
                      : 'You were defeated'}
                  </p>
                </div>
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
                    <span className="text-[7px] font-mono uppercase tracking-widest text-amber-400/55 leading-none">boss</span>
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

                {/* Combat stats + footer row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[9px] font-mono flex-wrap">
                    <span style={{ color: '#4ade80bb' }}>⚔ {activeBattle.playerSnapshot.atk}/s</span>
                    <span style={{ color: '#f87171bb' }}>♥ −{activeBattle.bossSnapshot.atk}/s</span>
                    {activeBattle.playerSnapshot.hpRegen > 0 && (
                      <span style={{ color: '#22d3eebb' }}>❋ +{activeBattle.playerSnapshot.hpRegen}/s</span>
                    )}
                    <span style={{ color: '#fbbf24aa' }}>= −{effectiveBossDps(activeBattle.bossSnapshot.atk, activeBattle.playerSnapshot.hpRegen).toFixed(1)}/s</span>
                  </div>

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
  const passCount = useInventoryStore((s) => s.items['dungeon_pass'] ?? 0)
  const [autoRunResult, setAutoRunResult] = useState<AutoRunResult | null>(null)
  const [battleState, setBattleState] = useState<ReturnType<typeof getBattleState>>(null)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [confirmForfeit, setConfirmForfeit] = useState(false)

  // Auto mode: chain dungeon runs with passes (animated, not instant)
  const autoAccRef = useRef<{
    zoneId: string
    remaining: number
    runsCompleted: number
    totalGold: number
    totalWarriorXP: number
    materials: Record<string, { name: string; icon: string; qty: number }>
    chests: ChestType[]
    failed: boolean
    failedAt?: string
    passesUsed: number
  } | null>(null)
  const [isAutoMode, setIsAutoMode] = useState(false)
  const [playerFlash, setPlayerFlash] = useState(false)
  const [bossFlash, setBossFlash] = useState(false)
  const prevPlayerHpRef = useRef<number | null>(null)
  const prevBossHpRef = useRef<number | null>(null)
  const flashTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const dailyBossId = getDailyBossId()

  const handleAutoFarm = useCallback((zoneId: string) => {
    const inv = useInventoryStore.getState()
    const passes = inv.items['dungeon_pass'] ?? 0
    if (passes <= 0) return

    // Consume 1 dungeon_pass for the first run
    inv.deleteItem('dungeon_pass', 1)

    const started = startDungeon(zoneId)
    if (!started) {
      inv.addItem('dungeon_pass', 1)
      return
    }

    autoAccRef.current = {
      zoneId,
      remaining: passes - 1,
      runsCompleted: 0,
      totalGold: 0,
      totalWarriorXP: 0,
      materials: {},
      chests: [],
      failed: false,
      passesUsed: 1,
    }
    setIsAutoMode(true)
  }, [startDungeon])

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

  useEffect(() => { setConfirmForfeit(false) }, [activeBattle])

  // Clear auto mode if dungeon was forfeited (both states null for >2s)
  useEffect(() => {
    if (isAutoMode && !activeBattle && !activeDungeon) {
      const t = setTimeout(() => {
        const s = useArenaStore.getState()
        if (!s.activeBattle && !s.activeDungeon) {
          autoAccRef.current = null
          setIsAutoMode(false)
        }
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [isAutoMode, activeBattle, activeDungeon])

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
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!battleState?.isComplete || !activeBattle) return

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
        const { goldLost, lostItem, materialDrop, warriorXP: mobXP } = endBattle()
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
              failed: true,
              failedAt: enemyName,
              passesUsed: auto.passesUsed,
            })
            autoAccRef.current = null
            setIsAutoMode(false)
          } else if (lostItem) {
            setResultModal({ victory: false, gold: 0, goldAlreadyAdded: true, goldLost, lostItemName: lostItem.name, lostItemIcon: lostItem.icon })
          }
        }
      } else {
        // Boss battle
        const { goldLost, chest, lostItem, materialDrop, dungeonGold, warriorXP } = endBattle()

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
            // Open chest silently (grant item but no animation)
            if (chest) {
              const inv = useInventoryStore.getState()
              const opened = inv.openChestAndGrantItem(chest.type as ChestType, { source: 'session_complete', focusCategory: null })
              auto.chests.push(chest.type as ChestType)
              if (opened?.goldDropped) auto.totalGold += opened.goldDropped
            }
            // More runs?
            if (auto.remaining > 0) {
              const inv = useInventoryStore.getState()
              const passes = inv.items['dungeon_pass'] ?? 0
              const zone = ZONES.find((z) => z.id === auto.zoneId)
              if (passes > 0 && zone && canAffordEntry(zone, inv.items)) {
                inv.deleteItem('dungeon_pass', 1)
                auto.remaining--
                auto.passesUsed++
                setTimeout(() => startDungeon(auto.zoneId), 800)
              } else {
                // Can't continue
                setAutoRunResult({
                  runsCompleted: auto.runsCompleted,
                  totalGold: Math.max(0, auto.totalGold),
                  totalWarriorXP: auto.totalWarriorXP,
                  materials: Object.entries(auto.materials).map(([id, m]) => ({ id, ...m })),
                  chests: auto.chests,
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
              failed: true,
              failedAt: enemyName,
              passesUsed: auto.passesUsed,
            })
            autoAccRef.current = null
            setIsAutoMode(false)
          }
        } else {
          // Normal mode (no auto)
          if (victory && chest) {
            const inv = useInventoryStore.getState()
            const opened = inv.openChestAndGrantItem(chest.type as ChestType, { source: 'session_complete', focusCategory: null })
            if (opened) {
              setArenaChestModal({
                chestType: chest.type as ChestType,
                itemId: opened.itemId,
                goldDropped: opened.goldDropped + dungeonGold,
                bonusMaterials: opened.bonusMaterials,
                warriorXP,
              })
            }
          } else if (victory) {
            setResultModal({ victory: true, gold: dungeonGold, goldAlreadyAdded: true, bossName: enemyName, materialDrop, warriorXP })
          } else {
            setResultModal({ victory: false, gold: 0, goldAlreadyAdded: true, bossName: enemyName, goldLost, lostItemName: lostItem?.name, lostItemIcon: lostItem?.icon })
          }
        }
      }
    }, isMob ? 600 : 1200)
  }, [battleState, activeBattle, endBattle, setResultModal, startDungeon])

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
    chestType: ChestType
    itemId: string | null
    goldDropped: number
    bonusMaterials: BonusMaterial[]
    warriorXP: number
  } | null>(null)

  const killCounts = useArenaStore((s) => s.killCounts)
  const ownedItems = useInventoryStore((s) => s.items)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
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
            onAutoFarm={handleAutoFarm}
            passCount={passCount}
            isAutoMode={isAutoMode}
          />
        ))}
      </div>

      <div className="text-center">
        <p className="text-[9px] text-gray-400 font-mono">
          Daily zone boss: {ZONES.find((z) => z.boss.id === dailyBossId)?.name ?? '—'}
        </p>
      </div>

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

    {/* Auto-Farm Result Modal */}
    <AnimatePresence>
      {autoRunResult && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAutoRunResult(null)}
        >
          <motion.div
            initial={{ scale: 0.86, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 10, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            className="w-[300px] rounded-2xl border border-amber-500/30 bg-discord-card overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center mb-3">
                <span className="text-2xl">🎫</span>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1">Auto-Farm Complete</p>
              <p className="text-white font-bold text-xl mb-3">
                {autoRunResult.runsCompleted} / {autoRunResult.passesUsed} runs
              </p>

              <div className="space-y-1.5 text-left">
                {autoRunResult.totalGold > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
                    <span>🪙</span>
                    <span className="text-[12px] text-amber-300 font-semibold">+{formatShort(autoRunResult.totalGold)} Gold</span>
                  </div>
                )}
                {autoRunResult.materials.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5">
                    <span>{m.icon}</span>
                    <span className="text-[12px] text-emerald-300 font-semibold">×{m.qty} {m.name}</span>
                  </div>
                ))}
                {autoRunResult.chests.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-1.5">
                    <span>📦</span>
                    <span className="text-[12px] text-purple-300 font-semibold">{autoRunResult.chests.length} chest{autoRunResult.chests.length > 1 ? 's' : ''}</span>
                  </div>
                )}
                {autoRunResult.totalWarriorXP > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
                    <span>⚔️</span>
                    <span className="text-[12px] text-red-300 font-semibold">+{formatShort(autoRunResult.totalWarriorXP)} Warrior XP</span>
                  </div>
                )}
                {autoRunResult.failed && autoRunResult.failedAt && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-1.5">
                    <span>💀</span>
                    <span className="text-[12px] text-red-300 font-semibold">Died vs {autoRunResult.failedAt}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAutoRunResult(null)}
                className="mt-4 w-full py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/15 text-amber-300 text-sm font-semibold hover:bg-amber-500/25 transition-colors"
              >
                OK
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
