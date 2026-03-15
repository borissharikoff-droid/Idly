import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  computeBattleStateAtTimeWithFood,
  simulateBattleWithFood,
  computePlayerStats,
  computeWarriorBonuses,
  type BossDef,
} from '../../lib/combat'
import { useInventoryStore } from '../../stores/inventoryStore'
import { skillLevelFromXP } from '../../lib/skills'
import { RAID_TIER_CONFIGS, type RaidTierId } from '../../services/raidService'

const TICK_MS = 500

interface Props {
  tier: RaidTierId
  onClose: () => void
  onComplete: (damageDealt: number, wonFight: boolean) => void
}

export function RaidFightModal({ tier, onClose, onComplete }: Props) {
  const cfg = RAID_TIER_CONFIGS[tier]
  const boss = cfg.encounter as BossDef

  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats = useInventoryStore((s) => s.permanentStats)

  const warriorLevel = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
      return skillLevelFromXP(stored['warrior'] ?? 0)
    } catch { return 0 }
  })()

  const warriorBonuses = computeWarriorBonuses(warriorLevel)
  const player = computePlayerStats(equippedBySlot, permanentStats, warriorBonuses)

  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<'fighting' | 'result'>('fighting')
  const [victory, setVictory] = useState(false)
  const [playerFlash, setPlayerFlash] = useState(false)
  const [bossFlash, setBossFlash] = useState(false)
  const seedRef = useRef(Date.now())
  const prevPlayerHp = useRef<number | null>(null)
  const prevBossHp = useRef<number | null>(null)

  // Pre-compute outcome for display
  const outcome = simulateBattleWithFood(player, boss, [], 0.5, seedRef.current)

  const MAX_FIGHT_SECONDS = 120

  useEffect(() => {
    if (phase !== 'fighting') return
    const interval = setInterval(() => {
      setElapsed((e) => {
        const next = e + TICK_MS / 1000
        const state = computeBattleStateAtTimeWithFood(player, boss, [], next, 0.5, seedRef.current)
        if (state.isComplete || next >= MAX_FIGHT_SECONDS) {
          clearInterval(interval)
          const won = state.victory === true && next < MAX_FIGHT_SECONDS
          setVictory(won)
          setPhase('result')
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const state = computeBattleStateAtTimeWithFood(player, boss, [], elapsed, 0.5, seedRef.current)

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
            <p className="text-[9px] font-mono" style={{ color: `${cfg.color}cc` }}>Daily Attack — {boss.name}</p>
          </div>
          <span className="text-[8px] font-mono text-gray-600 uppercase tracking-wider">
            {phase === 'fighting' ? `${Math.floor(elapsed)}s` : victory ? 'WIN' : 'DEFEAT'}
          </span>
        </div>

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
              <p className="text-[9px] text-gray-400 font-mono mt-1.5">You</p>
              <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mt-1">
                <motion.div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${playerHpPct}%`,
                    background: playerHpPct > 50 ? '#4ade80' : playerHpPct > 25 ? '#fbbf24' : '#f87171',
                  }}
                />
              </div>
              <p className="text-[8px] font-mono text-gray-600 mt-0.5">{Math.ceil(state.playerHp)}/{player.hp} HP</p>
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
              <p className="text-[9px] font-mono mt-1.5" style={{ color: `${cfg.color}cc` }}>{boss.name}</p>
              <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mt-1">
                <motion.div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${bossHpPct}%`, background: cfg.color }}
                />
              </div>
              <p className="text-[8px] font-mono text-gray-600 mt-0.5">{Math.ceil(state.bossHp)}/{boss.hp} HP</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-3 flex justify-center gap-4 text-[9px] font-mono text-gray-600">
            <span>ATK {player.atk.toFixed(1)}</span>
            <span>DEF {player.def}</span>
            <span>Regen {player.hpRegen.toFixed(1)}/s</span>
          </div>

          {/* Prediction */}
          {phase === 'fighting' && (
            <p className="text-center text-[9px] font-mono mt-2" style={{ color: outcome.willWin ? '#4ade8088' : '#f8717188' }}>
              {outcome.willWin ? `Est. win in ${outcome.tWinSeconds.toFixed(0)}s` : 'Outcome uncertain — gear up!'}
            </p>
          )}
        </div>

        {/* Result */}
        <AnimatePresence>
          {phase === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 pb-4"
            >
              <div
                className="rounded-xl p-3 text-center border"
                style={{
                  borderColor: victory ? `${cfg.color}40` : 'rgba(248,113,113,0.25)',
                  background: victory ? `${cfg.color}0c` : 'rgba(248,113,113,0.06)',
                }}
              >
                <p className="text-lg mb-1">{victory ? '🏆' : '💀'}</p>
                <p className="text-sm font-bold text-white">{victory ? 'Victory!' : 'Defeated'}</p>
                {victory ? (
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: cfg.color }}>
                    +{(RAID_TIER_CONFIGS[tier].contribution_per_win / 1_000).toFixed(0)}K raid damage dealt
                  </p>
                ) : (
                  <p className="text-[10px] font-mono text-gray-500 mt-0.5">No damage contribution</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleResult}
                className="w-full mt-3 py-2.5 rounded-xl text-[11px] font-bold transition-colors"
                style={{
                  background: `${cfg.color}20`,
                  border: `1px solid ${cfg.color}40`,
                  color: cfg.color,
                }}
              >
                Continue
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
              className="text-[9px] text-gray-600 hover:text-gray-400 transition-colors font-mono"
            >
              cancel
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
