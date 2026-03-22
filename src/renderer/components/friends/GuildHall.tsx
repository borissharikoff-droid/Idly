import { useState, useEffect, useMemo } from 'react'
import { fmt } from '../../lib/format'
import { motion, AnimatePresence } from 'framer-motion'
import { useGuildStore } from '../../stores/guildStore'
import { useGoldStore } from '../../stores/goldStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useToastStore } from '../../stores/toastStore'
import {
  GUILD_HALL_LEVELS,
  MAX_HALL_LEVEL,
  getHallDef,
  type GuildHallLevel,
} from '../../lib/guildBuffs'
import { LOOT_ITEMS } from '../../lib/loot'
import { playClickSound } from '../../lib/sounds'

// ── Item lookup ────────────────────────────────────────────────────────────────

const ITEM_META: Record<string, { name: string; icon: string }> = {}
for (const item of LOOT_ITEMS) {
  ITEM_META[item.id] = { name: item.name, icon: item.icon }
}

function getItemDisplay(id: string): { name: string; icon: string } {
  return ITEM_META[id] ?? { name: id, icon: '📦' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Instant'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatCountdown(endMs: number): string {
  const remaining = Math.max(0, endMs - Date.now())
  return formatDuration(remaining)
}

function BuffChip({ icon, label, next }: { icon: string; label: string; next?: string }) {
  const [showTip, setShowTip] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-micro text-amber-300 font-mono hover:border-amber-500/50 transition-colors"
      >
        <span>{icon}</span>
        <span>{label}</span>
      </button>
      <AnimatePresence>
        {showTip && next && (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-surface-1 border border-white/15 rounded text-micro text-gray-400 whitespace-nowrap z-10"
          >
            Next: {next}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Level overview modal ──────────────────────────────────────────────────────

function LevelsOverviewModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="bg-surface-0 border border-white/10 rounded-card w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
          <p className="text-caption font-bold text-white">🏰 Guild Hall — All Levels</p>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-body leading-none"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-2 space-y-1.5">
          {GUILD_HALL_LEVELS.map((lvl) => (
            <div
              key={lvl.level}
              className="rounded border border-white/[0.06] bg-white/[0.02] p-2"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-micro font-mono text-amber-400/60 bg-amber-500/10 px-1 rounded">
                    Lv.{lvl.level}
                  </span>
                  <span className="text-micro font-semibold text-white">{lvl.name}</span>
                </div>
                <span className="text-micro font-mono text-gray-500">
                  {lvl.goldCost === 0 ? 'Free' : `${fmt(lvl.goldCost)}🪙`}
                </span>
              </div>
              {/* Buffs */}
              <div className="flex flex-wrap gap-1 mb-1">
                <span className="text-micro text-amber-300 font-mono">+{lvl.xpBonusPct}% XP</span>
                <span className="text-micro text-gray-600">·</span>
                <span className="text-micro text-amber-300 font-mono">+{lvl.goldBonusPct}% Gold</span>
                {lvl.chestDropBonusPct > 0 && (
                  <>
                    <span className="text-micro text-gray-600">·</span>
                    <span className="text-micro text-blue-300 font-mono">+{lvl.chestDropBonusPct}% Drop</span>
                  </>
                )}
                {lvl.craftSpeedBonusPct > 0 && (
                  <>
                    <span className="text-micro text-gray-600">·</span>
                    <span className="text-micro text-purple-300 font-mono">-{lvl.craftSpeedBonusPct}% Craft</span>
                  </>
                )}
                {lvl.farmYieldBonusPct > 0 && (
                  <>
                    <span className="text-micro text-gray-600">·</span>
                    <span className="text-micro text-green-300 font-mono">+{lvl.farmYieldBonusPct}% Farm</span>
                  </>
                )}
              </div>
              {/* Materials */}
              {lvl.materials.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {lvl.materials.map((m) => {
                    const meta = getItemDisplay(m.id)
                    return (
                      <span
                        key={m.id}
                        className="text-micro text-gray-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]"
                      >
                        {meta.icon} {meta.name} ×{fmt(m.qty)}
                      </span>
                    )
                  })}
                </div>
              )}
              {/* Build time */}
              {lvl.buildDurationMs > 0 && (
                <p className="text-micro text-gray-600 font-mono mt-1">
                  ⏳ Build: {formatDuration(lvl.buildDurationMs)}
                </p>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Material row with slider ───────────────────────────────────────────────────

interface MaterialRowProps {
  matId: string
  required: number
  donated: number
  owned: number
  donating: boolean
  onDonate: (matId: string, qty: number) => void
}

function MaterialRow({ matId, required, donated, owned, donating, onDonate }: MaterialRowProps) {
  const meta = getItemDisplay(matId)
  const isDone = donated >= required
  const remaining = Math.max(0, required - donated)
  const maxDonatable = Math.min(owned, remaining)
  const [amount, setAmount] = useState(() => maxDonatable)

  // Keep amount in range when max changes
  useEffect(() => {
    setAmount((prev) => Math.min(prev, maxDonatable))
  }, [maxDonatable])

  const pct = required > 0 ? (donated / required) * 100 : 100
  const canDonate = !isDone && maxDonatable > 0 && !donating && amount > 0

  const handleSliderChange = (v: number) => {
    setAmount(Math.max(0, Math.min(maxDonatable, v)))
  }

  const handleInputChange = (raw: string) => {
    const n = parseInt(raw, 10)
    if (!isNaN(n)) setAmount(Math.max(0, Math.min(maxDonatable, n)))
  }

  return (
    <div className="space-y-1">
      {/* Top row: icon + name + progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-caption">{meta.icon}</span>
          <span className={`text-micro font-medium ${isDone ? 'text-accent' : 'text-gray-200'}`}>
            {meta.name}
          </span>
          {isDone && <span className="text-micro text-accent">✓</span>}
        </div>
        <span className="text-micro text-gray-500 font-mono">
          {fmt(donated)} / {fmt(required)}
          {owned > 0 && !isDone && (
            <span className="text-gray-700 ml-1">({fmt(owned)} owned)</span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${isDone ? 'bg-accent' : 'bg-amber-500'}`}
          style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
        />
      </div>

      {/* Slider + input + donate — only if not done */}
      {!isDone && maxDonatable > 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <input
            type="range"
            min={0}
            max={maxDonatable}
            value={amount}
            onChange={(e) => handleSliderChange(parseInt(e.target.value, 10))}
            className="flex-1 h-1 accent-amber-400 cursor-pointer"
          />
          <input
            type="number"
            min={0}
            max={maxDonatable}
            value={amount}
            onChange={(e) => handleInputChange(e.target.value)}
            className="w-14 px-1.5 py-0.5 rounded text-micro font-mono bg-white/[0.06] border border-white/10 text-gray-200 text-right focus:outline-none focus:border-amber-500/40"
          />
          <button
            type="button"
            disabled={!canDonate}
            onClick={() => { onDonate(matId, amount) }}
            className="px-2 py-0.5 rounded text-micro font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
          >
            Donate
          </button>
        </div>
      )}
      {!isDone && maxDonatable === 0 && owned === 0 && (
        <p className="text-micro text-gray-700 font-mono">You have none</p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GuildHall() {
  const hallLevel = useGuildStore((s) => s.hallLevel)
  const hallContributions = useGuildStore((s) => s.hallContributions)
  const hallBuildStartedAt = useGuildStore((s) => s.hallBuildStartedAt)
  const hallBuildTargetLevel = useGuildStore((s) => s.hallBuildTargetLevel)
  const donateToHall = useGuildStore((s) => s.donateToHall)
  const completeHallUpgrade = useGuildStore((s) => s.completeHallUpgrade)
  const fetchHallData = useGuildStore((s) => s.fetchHallData)
  const gold = useGoldStore((s) => s.gold)
  const items = useInventoryStore((s) => s.items)
  const pushToast = useToastStore((s) => s.push)

  const [donating, setDonating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
  const [, setTick] = useState(0)

  // Timer tick for countdown display
  useEffect(() => {
    if (!hallBuildStartedAt) return
    const interval = setInterval(() => setTick((t) => t + 1), 10000)
    return () => clearInterval(interval)
  }, [hallBuildStartedAt])

  // Refresh contributions on mount
  useEffect(() => { fetchHallData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentDef = getHallDef(hallLevel)
  const nextDef: GuildHallLevel | null = hallLevel < MAX_HALL_LEVEL ? GUILD_HALL_LEVELS[hallLevel] ?? null : null

  // Build timer
  const isBuilding = !!hallBuildStartedAt && !!hallBuildTargetLevel
  const buildTargetDef = useMemo(
    () => (hallBuildTargetLevel ? GUILD_HALL_LEVELS[hallBuildTargetLevel - 1] ?? null : null),
    [hallBuildTargetLevel],
  )
  const buildEndMs = hallBuildStartedAt
    ? new Date(hallBuildStartedAt).getTime() + (buildTargetDef?.buildDurationMs ?? 0)
    : 0
  const buildReady = isBuilding && Date.now() >= buildEndMs
  const buildPct = isBuilding && buildTargetDef?.buildDurationMs
    ? Math.min(100, ((Date.now() - new Date(hallBuildStartedAt!).getTime()) / buildTargetDef.buildDurationMs) * 100)
    : 0

  // Check if all materials are met
  const allMaterialsMet = nextDef
    ? nextDef.materials.every((m) => (hallContributions[m.id] ?? 0) >= m.qty)
    : false

  const handleDonate = async (matId: string, qty: number) => {
    if (donating || qty <= 0) return
    playClickSound()
    setDonating(true)
    try {
      const meta = getItemDisplay(matId)
      const result = await donateToHall([{ id: matId, qty }])
      if (result.ok) {
        if (result.buildStarted) {
          pushToast({ kind: 'generic', message: `Hall upgrade to Lv.${hallLevel + 1} started!`, type: 'success' })
        } else {
          pushToast({ kind: 'generic', message: `Donated ${qty}× ${meta.name}`, type: 'success' })
        }
      } else {
        pushToast({ kind: 'generic', message: result.error ?? 'Donation failed', type: 'error' })
      }
    } finally {
      setDonating(false)
    }
  }

  const handleDonateAll = async () => {
    if (!nextDef || donating) return
    const itemsToDonate = nextDef.materials
      .map((m) => {
        const donated = hallContributions[m.id] ?? 0
        const remaining = m.qty - donated
        const owned = items[m.id] ?? 0
        return { id: m.id, qty: Math.min(owned, remaining) }
      })
      .filter((i) => i.qty > 0)

    if (itemsToDonate.length === 0) {
      pushToast({ kind: 'generic', message: 'No items to donate', type: 'error' })
      return
    }
    playClickSound()
    setDonating(true)
    try {
      const result = await donateToHall(itemsToDonate)
      if (result.ok) {
        if (result.buildStarted) {
          pushToast({ kind: 'generic', message: `Hall upgrade to Lv.${hallBuildTargetLevel ?? (hallLevel + 1)} underway!`, type: 'success' })
        } else {
          const total = itemsToDonate.reduce((s, i) => s + i.qty, 0)
          pushToast({ kind: 'generic', message: `Donated ${total} items to hall`, type: 'success' })
        }
      } else {
        pushToast({ kind: 'generic', message: result.error ?? 'Donation failed', type: 'error' })
      }
    } finally {
      setDonating(false)
    }
  }

  const handlePayAndBuild = async () => {
    if (!nextDef || donating) return
    if (gold < nextDef.goldCost) {
      pushToast({ kind: 'generic', message: `Need ${fmt(nextDef.goldCost)}🪙 to start construction`, type: 'error' })
      return
    }
    playClickSound()
    setDonating(true)
    try {
      const result = await donateToHall([])
      if (result.ok && result.buildStarted) {
        pushToast({ kind: 'generic', message: `Construction of ${nextDef.name} started!`, type: 'success' })
      } else {
        pushToast({ kind: 'generic', message: result.error ?? 'Could not start build', type: 'error' })
      }
    } finally {
      setDonating(false)
    }
  }

  const handleComplete = async () => {
    if (completing) return
    playClickSound()
    setCompleting(true)
    try {
      const result = await completeHallUpgrade()
      if (result.ok) {
        pushToast({ kind: 'generic', message: `Guild Hall upgraded to Lv.${hallLevel}!`, type: 'success' })
      } else {
        pushToast({ kind: 'generic', message: result.error ?? 'Not ready yet', type: 'error' })
      }
    } finally {
      setCompleting(false)
    }
  }

  return (
    <>
      <div className="space-y-2.5">

        {/* ── Hall header ── */}
        <div className="rounded-card border border-amber-500/25 bg-surface-2 overflow-hidden">
          <div className="h-[2px] bg-gradient-to-r from-amber-500/60 via-yellow-400/20 to-transparent" />
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🏰</span>
                  <span className="text-body font-bold text-white">{currentDef?.name ?? 'Guild Hall'}</span>
                  <span className="text-micro font-mono text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    Lv.{hallLevel}/{MAX_HALL_LEVEL}
                  </span>
                </div>
                {isBuilding && !buildReady && (
                  <p className="text-micro text-amber-400/60 font-mono mt-0.5">
                    Upgrading → Lv.{hallBuildTargetLevel}
                  </p>
                )}
              </div>
              {/* ? button */}
              <button
                type="button"
                onClick={() => setShowLevels(true)}
                className="w-6 h-6 rounded-full border border-white/15 text-gray-500 text-micro hover:border-amber-500/40 hover:text-amber-400 transition-colors flex items-center justify-center"
                title="View all level costs and rewards"
              >
                ?
              </button>
            </div>

            {/* Active buffs */}
            {currentDef && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <BuffChip
                  icon="⚡"
                  label={`+${currentDef.xpBonusPct}% XP`}
                  next={nextDef ? `+${nextDef.xpBonusPct}%` : undefined}
                />
                <BuffChip
                  icon="🪙"
                  label={`+${currentDef.goldBonusPct}% Gold`}
                  next={nextDef ? `+${nextDef.goldBonusPct}%` : undefined}
                />
                {currentDef.chestDropBonusPct > 0 && (
                  <BuffChip
                    icon="📦"
                    label={`+${currentDef.chestDropBonusPct}% Drop`}
                    next={nextDef && nextDef.chestDropBonusPct > currentDef.chestDropBonusPct ? `+${nextDef.chestDropBonusPct}%` : undefined}
                  />
                )}
                {currentDef.craftSpeedBonusPct > 0 && (
                  <BuffChip
                    icon="⚒️"
                    label={`-${currentDef.craftSpeedBonusPct}% Craft`}
                    next={nextDef && nextDef.craftSpeedBonusPct > currentDef.craftSpeedBonusPct ? `-${nextDef.craftSpeedBonusPct}%` : undefined}
                  />
                )}
                {currentDef.farmYieldBonusPct > 0 && (
                  <BuffChip
                    icon="🌾"
                    label={`+${currentDef.farmYieldBonusPct}% Farm`}
                    next={nextDef && nextDef.farmYieldBonusPct > currentDef.farmYieldBonusPct ? `+${nextDef.farmYieldBonusPct}%` : undefined}
                  />
                )}
                {hallLevel === MAX_HALL_LEVEL && (
                  <span className="text-micro text-amber-400/50 font-mono self-center ml-1">MAX</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Build timer ── */}
        <AnimatePresence>
          {isBuilding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="rounded-card border border-amber-500/20 bg-surface-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-micro font-mono text-amber-400/70 uppercase tracking-wider">
                      {buildReady ? '✓ Construction Complete' : '⏳ Upgrading Hall'}
                    </p>
                    {!buildReady && (
                      <p className="text-xs font-bold text-white mt-0.5">
                        Ready in: {formatCountdown(buildEndMs)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={!buildReady || completing}
                    className="px-3 py-1.5 rounded text-micro font-semibold border transition-colors disabled:opacity-40
                      enabled:bg-accent/15 enabled:border-accent/30 enabled:text-accent enabled:hover:bg-accent/25
                      disabled:border-white/10 disabled:text-gray-600"
                  >
                    {completing ? '...' : 'Complete'}
                  </button>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300 transition-[width] duration-1000"
                    style={{ width: `${Math.max(2, buildPct)}%` }}
                  />
                </div>
                <p className="text-micro text-gray-600 font-mono text-right">{Math.round(buildPct)}%</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Upgrade panel (not building, not max) ── */}
        {!isBuilding && nextDef && (
          <div className="rounded-card border border-white/[0.08] bg-surface-2 overflow-hidden">
            <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.05]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-micro uppercase tracking-widest text-gray-500 font-mono">Upgrade to</p>
                  <p className="text-xs font-bold text-white">{nextDef.name} <span className="text-amber-400/70">Lv.{nextDef.level}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-micro text-gray-600 font-mono">Gold cost</p>
                  <p className={`text-caption font-bold font-mono ${gold >= nextDef.goldCost ? 'text-amber-400' : 'text-red-400'}`}>
                    {fmt(nextDef.goldCost)}🪙
                  </p>
                </div>
              </div>

              {/* Next level buffs preview */}
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-micro text-gray-600 font-mono self-center">Buffs:</span>
                <span className="text-micro text-amber-300 font-mono">+{nextDef.xpBonusPct}% XP</span>
                <span className="text-micro text-gray-700">·</span>
                <span className="text-micro text-amber-300 font-mono">+{nextDef.goldBonusPct}% Gold</span>
                {nextDef.chestDropBonusPct > 0 && (
                  <>
                    <span className="text-micro text-gray-700">·</span>
                    <span className="text-micro text-blue-300 font-mono">+{nextDef.chestDropBonusPct}% Drop</span>
                  </>
                )}
                {nextDef.craftSpeedBonusPct > 0 && (
                  <>
                    <span className="text-micro text-gray-700">·</span>
                    <span className="text-micro text-purple-300 font-mono">-{nextDef.craftSpeedBonusPct}% Craft</span>
                  </>
                )}
                {nextDef.farmYieldBonusPct > 0 && (
                  <>
                    <span className="text-micro text-gray-700">·</span>
                    <span className="text-micro text-green-300 font-mono">+{nextDef.farmYieldBonusPct}% Farm</span>
                  </>
                )}
              </div>
            </div>

            {/* Materials */}
            <div className="p-3 space-y-3">
              {nextDef.materials.map((mat) => {
                const donated = Math.min(hallContributions[mat.id] ?? 0, mat.qty)
                const owned = items[mat.id] ?? 0
                return (
                  <MaterialRow
                    key={mat.id}
                    matId={mat.id}
                    required={mat.qty}
                    donated={donated}
                    owned={owned}
                    donating={donating}
                    onDonate={handleDonate}
                  />
                )
              })}

              {/* Donate all button */}
              {nextDef.materials.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDonateAll}
                    disabled={donating || nextDef.materials.every((m) => {
                      const donated = hallContributions[m.id] ?? 0
                      return donated >= m.qty || (items[m.id] ?? 0) <= 0
                    })}
                    className="flex-1 py-1.5 rounded text-micro font-semibold border border-amber-500/25 text-amber-400/70 bg-amber-500/[0.07] hover:bg-amber-500/15 disabled:opacity-40 transition-colors"
                  >
                    {donating ? 'Donating…' : 'Donate All Available'}
                  </button>
                </div>
              )}

              {/* Gold pay confirmation */}
              <AnimatePresence>
                {allMaterialsMet && !isBuilding && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 p-2.5 rounded border border-accent/25 bg-accent/[0.05]">
                      <p className="text-micro text-accent font-semibold mb-1.5">
                        ✓ All materials collected!
                      </p>
                      <p className="text-micro text-gray-400 mb-2">
                        Pay <span className={`font-bold ${gold >= nextDef.goldCost ? 'text-amber-400' : 'text-red-400'}`}>
                          {fmt(nextDef.goldCost)}🪙
                        </span> from your wallet to begin construction ({formatDuration(nextDef.buildDurationMs)}).
                      </p>
                      <button
                        type="button"
                        onClick={handlePayAndBuild}
                        disabled={gold < nextDef.goldCost || donating}
                        className="w-full py-1.5 rounded text-micro font-semibold border transition-colors
                          enabled:bg-accent/15 enabled:border-accent/30 enabled:text-accent enabled:hover:bg-accent/25
                          disabled:opacity-40 disabled:border-white/10 disabled:text-gray-600"
                      >
                        {donating ? '…' : gold < nextDef.goldCost
                          ? `Need ${fmt(nextDef.goldCost - gold)} more 🪙`
                          : `Build (${formatDuration(nextDef.buildDurationMs)})`}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Max level */}
        {hallLevel >= MAX_HALL_LEVEL && !isBuilding && (
          <div className="rounded-card border border-amber-500/20 bg-amber-500/[0.04] p-3 text-center">
            <p className="text-caption text-amber-400 font-semibold">🏆 Guild Hall at Maximum Level</p>
            <p className="text-micro text-gray-500 mt-0.5">All buffs are fully upgraded.</p>
          </div>
        )}
      </div>

      {/* Levels overview modal */}
      <AnimatePresence>
        {showLevels && <LevelsOverviewModal onClose={() => setShowLevels(false)} />}
      </AnimatePresence>
    </>
  )
}
