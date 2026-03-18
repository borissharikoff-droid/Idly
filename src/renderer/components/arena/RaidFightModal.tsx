import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  computeBattleStateAtTimeWithFood,
  simulateBattleWithFood,
  computePlayerStats,
  computeWarriorBonuses,
  type BossDef,
  type FoodLoadoutSlot,
} from '../../lib/combat'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useRaidStore } from '../../stores/raidStore'
import { skillLevelFromXP } from '../../lib/skills'
import { RAID_TIER_CONFIGS, getRaidPhase, RAID_PHASE_ATK_MULT, type RaidTierId } from '../../services/raidService'
import { FoodSelector } from '../shared/FoodSelector'

const TICK_MS = 500

interface Props {
  tier: RaidTierId
  onClose: () => void
  onComplete: (damageDealt: number, wonFight: boolean) => void
}

export function RaidFightModal({ tier, onClose, onComplete }: Props) {
  const cfg = RAID_TIER_CONFIGS[tier]
  const baseBoss = cfg.encounter as BossDef

  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const ownedItems = useInventoryStore((s) => s.items)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const activeRaid = useRaidStore((s) => s.activeRaid)

  const warriorLevel = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
      return skillLevelFromXP(stored['warrior'] ?? 0)
    } catch { return 0 }
  })()

  const warriorBonuses = computeWarriorBonuses(warriorLevel)
  const player = computePlayerStats(equippedBySlot, permanentStats, warriorBonuses)

  const currentPhase = getRaidPhase(activeRaid?.boss_hp_remaining ?? cfg.boss_hp, cfg.boss_hp)
  const boss: BossDef = { ...baseBoss, atk: baseBoss.atk * RAID_PHASE_ATK_MULT[currentPhase] }

  // Backpack food slots
  const [foodSlots, setFoodSlots] = useState<(FoodLoadoutSlot | null)[]>([null, null, null])

  const [phase, setPhase] = useState<'backpack' | 'fighting' | 'result'>('backpack')
  const [elapsed, setElapsed] = useState(0)
  const [victory, setVictory] = useState(false)
  const [playerFlash, setPlayerFlash] = useState(false)
  const [bossFlash, setBossFlash] = useState(false)
  const seedRef = useRef(Date.now())
  const prevPlayerHp = useRef<number | null>(null)
  const prevBossHp = useRef<number | null>(null)

  const activeFood = foodSlots.filter(Boolean) as FoodLoadoutSlot[]

  // Pre-compute outcome for display (uses selected food)
  const outcome = simulateBattleWithFood(player, boss, activeFood, 0.5, seedRef.current)

  const MAX_FIGHT_SECONDS = 120

  useEffect(() => {
    if (phase !== 'fighting') return
    const interval = setInterval(() => {
      setElapsed((e) => {
        const next = e + TICK_MS / 1000
        const state = computeBattleStateAtTimeWithFood(player, boss, activeFood, next, 0.5, seedRef.current)
        if (state.isComplete || next >= MAX_FIGHT_SECONDS) {
          clearInterval(interval)
          const won = state.victory === true && next < MAX_FIGHT_SECONDS
          setVictory(won)
          setPhase('result')
          // Consume food from inventory
          for (const slot of activeFood) {
            deleteItem(slot.foodId, 1)
          }
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const state = computeBattleStateAtTimeWithFood(player, boss, activeFood, elapsed, 0.5, seedRef.current)

  // Flash effects
  useEffect(() => {
    if (!state || state.isComplete) return
    const pp = prevPlayerHp.current
    const pb = prevBossHp.current
    if (pp !== null && state.playerHp < pp - 0.1) {
      setPlayerFlash(true)
      setTimeout(() => setPlayerFlash(false), 280)
    }
    if (pb !== null && state.bossHp < pb - 0.1) {
      setBossFlash(true)
      setTimeout(() => setBossFlash(false), 280)
    }
    prevPlayerHp.current = state.playerHp
    prevBossHp.current = state.bossHp
  }, [state?.playerHp, state?.bossHp]) // eslint-disable-line react-hooks/exhaustive-deps

  const playerHpPct = Math.max(0, (state.playerHp / player.hp) * 100)
  const bossHpPct = Math.max(0, (state.bossHp / boss.hp) * 100)

  const handleResult = () => {
    const contribution = victory ? RAID_TIER_CONFIGS[tier].contribution_per_win : 0
    onComplete(contribution, victory)
  }

  const foodBuffSummary = activeFood.reduce(
    (acc, s) => ({
      atk: acc.atk + (s.effect.buffAtk ?? 0),
      def: acc.def + (s.effect.buffDef ?? 0),
      regen: acc.regen + (s.effect.buffRegen ?? 0),
    }),
    { atk: 0, def: 0, regen: 0 },
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={phase === 'result' ? handleResult : undefined}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="w-[340px] rounded-2xl border overflow-hidden shadow-2xl"
        style={{ borderColor: `${cfg.color}40`, background: '#0d0d1a' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2.5" style={{ borderColor: `${cfg.color}25`, background: `${cfg.color}0a` }}>
          <span className="text-2xl" style={{ filter: `drop-shadow(0 0 6px ${cfg.color})` }}>{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white">{cfg.name}</p>
            <p className="text-[10px] font-mono" style={{ color: `${cfg.color}cc` }}>
              {phase === 'backpack' ? 'Prepare Backpack' : `Daily Attack — ${baseBoss.name}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">
              {phase === 'fighting' ? `${Math.floor(elapsed)}s` : phase === 'result' ? (victory ? 'WIN' : 'DEFEAT') : 'READY'}
            </span>
            <span className={`text-[10px] font-mono font-bold ${currentPhase === 1 ? 'text-gray-500' : currentPhase === 2 ? 'text-amber-400' : 'text-red-400'}`}>
              {currentPhase === 1 ? 'Phase 1' : currentPhase === 2 ? '⚠ Phase 2 — Enraged' : '🔥 Phase 3 — Berserk'}
            </span>
          </div>
        </div>

        {/* Backpack phase */}
        {phase === 'backpack' && (
          <div className="px-4 py-4 space-y-4">
            {/* Player stats preview */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
              <p className="text-[10px] font-mono text-gray-500 mb-1.5">Your stats</p>
              <div className="flex gap-4 text-[10px] font-mono">
                <span className="text-red-400">ATK {(player.atk + foodBuffSummary.atk).toFixed(1)}{foodBuffSummary.atk > 0 && <span className="text-green-400 ml-0.5">(+{foodBuffSummary.atk})</span>}</span>
                <span className="text-blue-400">DEF {(player.def + foodBuffSummary.def)}{foodBuffSummary.def > 0 && <span className="text-green-400 ml-0.5">(+{foodBuffSummary.def})</span>}</span>
                <span className="text-green-400">Regen {(player.hpRegen + foodBuffSummary.regen).toFixed(1)}/s{foodBuffSummary.regen > 0 && <span className="text-green-400 ml-0.5">(+{foodBuffSummary.regen})</span>}</span>
              </div>
            </div>

            {/* Boss threat */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 flex items-center gap-3">
              <span className="text-2xl">{boss.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-white">{boss.name}</p>
                <p className="text-[10px] font-mono text-gray-500">ATK {boss.atk.toFixed(1)} · HP {boss.hp}</p>
              </div>
              <p className="text-[10px] font-mono" style={{ color: outcome.willWin ? '#4ade80' : '#f87171' }}>
                {outcome.willWin ? `~${outcome.tWinSeconds.toFixed(0)}s win` : 'Risky'}
              </p>
            </div>

            {/* Food selector */}
            <div>
              <p className="text-[10px] font-mono text-gray-500 mb-1.5">Pack food <span className="text-gray-700">(consumed on use)</span></p>
              <FoodSelector slots={foodSlots} onChange={setFoodSlots} ownedItems={ownedItems} />
              {!activeFood.length && (
                <p className="text-[10px] text-gray-700 font-mono mt-1.5">No food packed — fight with base stats.</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPhase('fighting')}
              className="w-full py-2.5 rounded-xl text-[12px] font-bold transition-colors"
              style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}50`, color: cfg.color }}
            >
              Enter Battle
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-[10px] text-gray-600 hover:text-gray-400 transition-colors font-mono text-center"
            >
              cancel
            </button>
          </div>
        )}

        {/* Fight phase */}
        {phase !== 'backpack' && (
          <>
            {/* Battle arena */}
            <div className="px-4 py-5">
              <div className="flex items-center justify-between gap-3">

                {/* Player */}
                <div className="flex-1 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-3xl border transition-all duration-150"
                    style={{
                      borderColor: playerFlash ? '#f87171' : 'rgba(255,255,255,0.1)',
                      background: playerFlash ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)',
                      boxShadow: playerFlash ? '0 0 12px rgba(248,113,113,0.4)' : 'none',
                    }}
                  >
                    ⚔️
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-1.5">You</p>
                  <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mt-1">
                    <motion.div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${playerHpPct}%`,
                        background: playerHpPct > 50 ? '#4ade80' : playerHpPct > 25 ? '#fbbf24' : '#f87171',
                      }}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-gray-600 mt-0.5">{Math.ceil(state.playerHp)}/{player.hp} HP</p>
                </div>

                {/* VS */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono text-gray-600">VS</span>
                  <AnimatePresence>
                    {phase === 'fighting' && (
                      <motion.div
                        key="swords"
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="text-base"
                      >⚡</motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Boss */}
                <div className="flex-1 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-3xl border transition-all duration-150"
                    style={{
                      borderColor: bossFlash ? cfg.color : `${cfg.color}30`,
                      background: bossFlash ? `${cfg.color}20` : `${cfg.color}08`,
                      boxShadow: bossFlash ? `0 0 14px ${cfg.color}60` : `0 0 6px ${cfg.color}20`,
                    }}
                  >
                    {boss.icon}
                  </div>
                  <p className="text-[10px] font-mono mt-1.5" style={{ color: `${cfg.color}cc` }}>{boss.name}</p>
                  <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mt-1">
                    <motion.div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${bossHpPct}%`, background: cfg.color }}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-gray-600 mt-0.5">{Math.ceil(state.bossHp)}/{boss.hp} HP</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="mt-3 flex justify-center gap-4 text-[10px] font-mono text-gray-600">
                <span>ATK {player.atk.toFixed(1)}</span>
                <span>DEF {player.def}</span>
                <span>Regen {player.hpRegen.toFixed(1)}/s</span>
                {activeFood.length > 0 && (
                  <span className="text-green-500">🍽 {activeFood.length} food</span>
                )}
              </div>

              {/* Prediction */}
              {phase === 'fighting' && (
                <p className="text-center text-[10px] font-mono mt-2" style={{ color: outcome.willWin ? '#4ade8088' : '#f8717188' }}>
                  {outcome.willWin ? `Est. win in ${outcome.tWinSeconds.toFixed(0)}s` : 'Outcome uncertain — gear up!'}
                </p>
              )}
            </div>

            {/* Result */}
            <AnimatePresence>
              {phase === 'result' && victory && (
                <motion.div
                  key="victory"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 pb-4"
                >
                  <div
                    className="rounded-xl p-3 text-center border"
                    style={{ borderColor: `${cfg.color}40`, background: `${cfg.color}0c` }}
                  >
                    <p className="text-lg mb-1">🏆</p>
                    <p className="text-sm font-bold text-white">Victory!</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: cfg.color }}>
                      +{(RAID_TIER_CONFIGS[tier].contribution_per_win / 1_000).toFixed(0)}K raid damage dealt
                    </p>
                    {activeFood.length > 0 && (
                      <p className="text-[10px] font-mono text-gray-600 mt-1">{activeFood.length} food consumed</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleResult}
                    className="w-full mt-3 py-2.5 rounded-xl text-[11px] font-bold transition-colors"
                    style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}40`, color: cfg.color }}
                  >
                    Continue
                  </button>
                </motion.div>
              )}
              {phase === 'result' && !victory && (
                <motion.div
                  key="defeat"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 pb-4"
                >
                  <div className="text-center py-6">
                    <p className="text-4xl mb-2">💀</p>
                    <p className="text-[14px] font-bold text-red-400">You Fell in Battle</p>
                    <p className="text-[10px] text-gray-500 mt-1 font-mono">No damage dealt today.</p>
                    <p className="text-[10px] text-gray-600 mt-2 font-mono leading-relaxed">
                      Your party fights on...<br />Return tomorrow with better gear.
                    </p>
                    {activeFood.length > 0 && (
                      <p className="text-[10px] font-mono text-gray-700 mt-1">{activeFood.length} food consumed</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleResult}
                    className="w-full py-2.5 rounded-xl text-[11px] font-bold transition-colors"
                    style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
                  >
                    Back to Raid
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cancel during fight */}
            {phase === 'fighting' && (
              <div className="px-4 pb-4 text-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors font-mono"
                >
                  cancel
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}
