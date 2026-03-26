import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getDailyActivities, getWeeklyActivities,
  claimDailyActivity, claimWeeklyActivity, claimDailyAllBonus,
  isDailyAllBonusClaimed,
  type DailyActivityId, type WeeklyActivityId,
} from '../../services/dailyActivityService'
import {
  ACHIEVEMENTS, getAchievementProgress,
  type AchievementDef, type AchievementProgressContext,
} from '../../lib/xp'
import { skillLevelFromXP } from '../../lib/skills'
import { CHEST_DEFS, LOOT_ITEMS, type BonusMaterial, type ChestType } from '../../lib/loot'
import { defaultSkillForAchievement } from '../../services/rewardGrant'
import { getSkillById } from '../../lib/skills'
import { useInventoryStore, ensureInventoryHydrated } from '../../stores/inventoryStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { BulkChestOpenModal, type BulkOpenResult } from '../animations/BulkChestOpenModal'
import { SEED_ZIP_ITEM_IDS, type SeedZipTier } from '../../lib/farming'
import { playClickSound } from '../../lib/sounds'
import { FRAMES, BADGES, ACHIEVEMENT_COSMETIC_UNLOCKS } from '../../lib/cosmetics'

// Aggregate multiple chest results into BulkOpenResult
function aggregateChestResults(
  results: { itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[] }[]
): BulkOpenResult {
  const itemMap = new Map<string, number>()
  const materialMap = new Map<string, number>()
  const seedZipMap = new Map<SeedZipTier, number>()
  let totalGold = 0

  const seedZipIds = new Set(Object.values(SEED_ZIP_ITEM_IDS))
  const tierByItemId = Object.fromEntries(
    Object.entries(SEED_ZIP_ITEM_IDS).map(([tier, id]) => [id, tier as SeedZipTier])
  )

  for (const r of results) {
    totalGold += r.goldDropped ?? 0
    if (r.itemId) itemMap.set(r.itemId, (itemMap.get(r.itemId) ?? 0) + 1)
    for (const mat of r.bonusMaterials ?? []) {
      if (seedZipIds.has(mat.itemId)) {
        const tier = tierByItemId[mat.itemId]
        if (tier) seedZipMap.set(tier, (seedZipMap.get(tier) ?? 0) + mat.qty)
      } else {
        materialMap.set(mat.itemId, (materialMap.get(mat.itemId) ?? 0) + mat.qty)
      }
    }
  }

  const items = Array.from(itemMap.entries())
    .map(([id, qty]) => ({ def: LOOT_ITEMS.find((x) => x.id === id)!, qty }))
    .filter((x) => x.def)
  const materials = Array.from(materialMap.entries())
    .map(([id, qty]) => ({ def: LOOT_ITEMS.find((x) => x.id === id)!, qty }))
    .filter((x) => x.def)
  const seedZips = Array.from(seedZipMap.entries()).map(([tier, qty]) => ({ tier, qty }))

  return { items, totalGold, materials, seedZips, totalOpened: results.length }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatQuestProgress(id: string, progress: number, target: number): string {
  if (id === 'focus_minutes' || id === 'weekly_grind') {
    const pMin = Math.floor(progress / 60)
    const tMin = Math.floor(target / 60)
    if (tMin >= 60) {
      const pH = Math.floor(pMin / 60)
      const pM = pMin % 60
      const tH = Math.floor(tMin / 60)
      const tM = tMin % 60
      return `${pH}h ${pM}m / ${tH}h${tM ? ` ${tM}m` : ''}`
    }
    return `${pMin}m / ${tMin}m`
  }
  return `${Math.min(Math.floor(progress), target)} / ${target}`
}

const DIFFICULTY: Record<string, { label: string; color: string }> = {
  common_chest:    { label: 'Easy',   color: 'text-gray-400' },
  rare_chest:      { label: 'Medium', color: 'text-blue-400' },
  epic_chest:      { label: 'Hard',   color: 'text-purple-400' },
  legendary_chest: { label: 'Elite',  color: 'text-yellow-400' },
}

const ACH_CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  grind:   { label: 'Grind',   icon: '⚡' },
  streak:  { label: 'Streak',  icon: '🔥' },
  social:  { label: 'Social',  icon: '🤝' },
  special: { label: 'Special', icon: '✨' },
  skill:   { label: 'Skills',  icon: '⚡' },
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuestsSectionProps {
  unlockedIds: string[]
  claimedIds: string[]
  onClaimAchievement: (def: AchievementDef) => void
  onClaimAll?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuestsSection({ unlockedIds, claimedIds, onClaimAchievement, onClaimAll }: QuestsSectionProps) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((v) => v + 1), [])

  const dailies = useMemo(() => getDailyActivities(), [tick])
  const weeklies = useMemo(() => getWeeklyActivities(), [tick])
  const allBonusClaimed = useMemo(() => isDailyAllBonusClaimed(), [tick])
  const allDailyClaimed = dailies.every((d) => d.claimed)

  const dailyDoneCount = dailies.filter((d) => d.completed).length
  const weeklyDoneCount = weeklies.filter((w) => w.completed).length

  const grantAndOpenChest = useInventoryStore((s) => s.grantAndOpenChest)

  const [opened, setOpened] = useState<{
    chestType: ChestType; itemId: string | null; goldDropped?: number; bonusMaterials?: BonusMaterial[]
  } | null>(null)
  const [bulkOpened, setBulkOpened] = useState<{ chestType: ChestType; result: BulkOpenResult } | null>(null)
  useEffect(() => { ensureInventoryHydrated() }, [])
  useEffect(() => { const id = setInterval(refresh, 10_000); return () => clearInterval(id) }, [refresh])

  // Achievement progress context
  const [progressCtx, setProgressCtx] = useState<AchievementProgressContext>({
    totalSessions: 0, streakCount: 0, friendCount: 0, skillLevels: {},
  })
  useEffect(() => {
    const load = async () => {
      const api = window.electronAPI
      let totalSessions = 0
      let streakCount = 0
      let friendCount = 0
      const skillLevels: Record<string, number> = {}
      try {
        if (api?.db?.getSessions) { const s = await api.db.getSessions() as unknown[]; totalSessions = s.length }
        if (api?.db?.getStreak) streakCount = await api.db.getStreak()
        if (api?.db?.getAllSkillXP) {
          const rows = await api.db.getAllSkillXP() as { skill_id: string; total_xp: number }[]
          for (const r of rows) skillLevels[r.skill_id] = skillLevelFromXP(r.total_xp)
        }
      } catch { /* ignore */ }
      // Friend count from localStorage cache or API
      try {
        const stored = localStorage.getItem('grindly_friends_count')
        if (stored) friendCount = parseInt(stored, 10) || 0
      } catch { /* ignore */ }
      setProgressCtx({ totalSessions, streakCount, friendCount, skillLevels })
    }
    load()
  }, [tick])

  // ── Claim handlers ──

  const openChest = (chestType: ChestType, source: string) => {
    const result = grantAndOpenChest(chestType, { source: source as 'daily_activity' })
    setOpened({ chestType, itemId: result.itemId, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
  }

  const handleClaimDaily = (id: DailyActivityId) => {
    const chestType = claimDailyActivity(id)
    if (!chestType) return
    playClickSound()
    openChest(chestType, 'daily_activity')
    refresh()
  }

  const handleClaimWeekly = (id: WeeklyActivityId) => {
    const chestType = claimWeeklyActivity(id)
    if (!chestType) return
    playClickSound()
    openChest(chestType, 'daily_activity')
    refresh()
  }

  const handleClaimAllBonus = () => {
    const chestType = claimDailyAllBonus()
    if (!chestType) return
    playClickSound()
    openChest(chestType, 'daily_activity')
    refresh()
  }

  const handleClaimAllDaily = () => {
    const claimable = dailies.filter((d) => d.completed && !d.claimed)
    if (claimable.length === 0) return
    playClickSound()
    const rawResults: { itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[] }[] = []
    let lastChest: ChestType = 'common_chest'
    for (const q of claimable) {
      const ct = claimDailyActivity(q.id)
      if (ct) {
        lastChest = ct
        const r = grantAndOpenChest(ct, { source: 'daily_activity' })
        rawResults.push({ itemId: r.itemId, goldDropped: r.goldDropped, bonusMaterials: r.bonusMaterials })
      }
    }
    const allNowClaimed = dailies.every((d) => d.claimed || claimable.some((c) => c.id === d.id))
    if (allNowClaimed && !isDailyAllBonusClaimed()) {
      const bonusCt = claimDailyAllBonus()
      if (bonusCt) {
        lastChest = bonusCt
        const r = grantAndOpenChest(bonusCt, { source: 'daily_activity' })
        rawResults.push({ itemId: r.itemId, goldDropped: r.goldDropped, bonusMaterials: r.bonusMaterials })
      }
    }
    if (rawResults.length > 1) {
      setBulkOpened({ chestType: lastChest, result: aggregateChestResults(rawResults) })
    } else if (rawResults.length === 1) {
      setOpened({ chestType: lastChest, itemId: rawResults[0].itemId, goldDropped: rawResults[0].goldDropped, bonusMaterials: rawResults[0].bonusMaterials })
    }
    refresh()
  }

  const handleClaimAllWeekly = () => {
    const claimable = weeklies.filter((w) => w.completed && !w.claimed)
    if (claimable.length === 0) return
    playClickSound()
    const rawResults: { itemId: string | null; goldDropped: number; bonusMaterials: BonusMaterial[] }[] = []
    let lastChest: ChestType = 'common_chest'
    for (const q of claimable) {
      const ct = claimWeeklyActivity(q.id)
      if (ct) {
        lastChest = ct
        const r = grantAndOpenChest(ct, { source: 'daily_activity' })
        rawResults.push({ itemId: r.itemId, goldDropped: r.goldDropped, bonusMaterials: r.bonusMaterials })
      }
    }
    if (rawResults.length > 1) {
      setBulkOpened({ chestType: lastChest, result: aggregateChestResults(rawResults) })
    } else if (rawResults.length === 1) {
      setOpened({ chestType: lastChest, itemId: rawResults[0].itemId, goldDropped: rawResults[0].goldDropped, bonusMaterials: rawResults[0].bonusMaterials })
    }
    refresh()
  }

  const dailyClaimableCount = dailies.filter((d) => d.completed && !d.claimed).length + (allDailyClaimed && !allBonusClaimed ? 1 : 0)
  const weeklyClaimableCount = weeklies.filter((w) => w.completed && !w.claimed).length

  const openedItem = useMemo(
    () => (opened ? LOOT_ITEMS.find((x) => x.id === opened.itemId) ?? null : null),
    [opened],
  )

  // ── Achievement categories ──

  const achCategories = ['grind', 'streak', 'social', 'special', 'skill'] as const

  return (
    <>
      <div className="space-y-5">

        {/* ══════════ DAILY QUESTS ══════════ */}
        <section className="space-y-2">
          <SectionHeader
            title="Daily Quests"
            subtitle="resets at midnight"
            count={dailyDoneCount}
            total={dailies.length}
            claimableCount={dailyClaimableCount}
            onClaimAll={handleClaimAllDaily}
          />
          <div className="space-y-1.5">
            {dailies.map((q) => {
              const pct = Math.min(100, q.target > 0 ? (q.progress / q.target) * 100 : 0)
              const chest = CHEST_DEFS[q.rewardChest]
              const diff = DIFFICULTY[q.rewardChest]
              return (
                <QuestRow
                  key={q.id}
                  icon={q.icon}
                  title={q.title}
                  description={q.description}
                  progressText={formatQuestProgress(q.id, q.progress, q.target)}
                  pct={pct}
                  completed={q.completed}
                  claimed={q.claimed}
                  chest={chest}
                  difficulty={diff}
                  onClaim={() => handleClaimDaily(q.id)}
                />
              )
            })}
          </div>

          {/* All-complete bonus */}
          <BonusRow
            claimed={allBonusClaimed}
            canClaim={allDailyClaimed && !allBonusClaimed}
            progress={dailies.filter((d) => d.claimed).length}
            total={dailies.length}
            onClaim={handleClaimAllBonus}
          />
        </section>

        {/* ══════════ WEEKLY CHALLENGES ══════════ */}
        <section className="space-y-2">
          <SectionHeader
            title="Weekly Challenges"
            subtitle="resets Monday"
            count={weeklyDoneCount}
            total={weeklies.length}
            accent="purple"
            claimableCount={weeklyClaimableCount}
            onClaimAll={handleClaimAllWeekly}
          />
          <div className="space-y-1.5">
            {weeklies.map((q) => {
              const pct = Math.min(100, q.target > 0 ? (q.progress / q.target) * 100 : 0)
              const chest = CHEST_DEFS[q.rewardChest]
              const diff = DIFFICULTY[q.rewardChest]
              return (
                <QuestRow
                  key={q.id}
                  icon={q.icon}
                  title={q.title}
                  description={q.description}
                  progressText={formatQuestProgress(q.id, q.progress, q.target)}
                  pct={pct}
                  completed={q.completed}
                  claimed={q.claimed}
                  chest={chest}
                  difficulty={diff}
                  onClaim={() => handleClaimWeekly(q.id)}
                  accent="purple"
                />
              )
            })}
          </div>
        </section>

        {/* ══════════ ACHIEVEMENTS ══════════ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-micro uppercase tracking-wider text-gray-400 font-mono">Achievements</p>
            <div className="flex items-center gap-2">
              {(() => {
                const claimableCount = ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id) && !claimedIds.includes(a.id)).length
                return claimableCount > 0 ? (
                  <button
                    onClick={onClaimAll}
                    className="text-micro font-mono px-2 py-0.5 rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    Claim All ({claimableCount})
                  </button>
                ) : null
              })()}
              <span className="text-micro font-mono text-gray-500">
                {ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id)).length}/{ACHIEVEMENTS.length}
              </span>
            </div>
          </div>

          {achCategories.map((cat) => {
            const items = ACHIEVEMENTS.filter((a) => a.category === cat)
            if (items.length === 0) return null
            const catMeta = ACH_CATEGORY_LABELS[cat]
            const catUnlocked = items.filter((a) => unlockedIds.includes(a.id)).length
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="text-micro text-gray-500 font-mono uppercase tracking-wider">
                    {catMeta?.icon} {catMeta?.label || cat}
                  </span>
                  <span className="text-micro text-gray-600 font-mono">{catUnlocked}/{items.length}</span>
                </div>
                {items.map((a) => {
                  const unlocked = unlockedIds.includes(a.id)
                  const claimed = claimedIds.includes(a.id)
                  const progress = getAchievementProgress(a.id, progressCtx)
                  const skill = getSkillById(defaultSkillForAchievement(a))
                  return (
                    <AchievementRow
                      key={a.id}
                      achievement={a}
                      unlocked={unlocked}
                      claimed={claimed}
                      progress={progress}
                      skillIcon={skill?.icon}
                      onClaim={() => onClaimAchievement(a)}
                    />
                  )
                })}
              </div>
            )
          })}
        </section>
      </div>

      <ChestOpenModal
        open={Boolean(opened)}
        chestType={opened?.chestType ?? null}
        item={openedItem}
        goldDropped={opened?.goldDropped}
        bonusMaterials={opened?.bonusMaterials}
        onClose={() => setOpened(null)}
      />
      <BulkChestOpenModal
        open={Boolean(bulkOpened)}
        chestType={bulkOpened?.chestType ?? null}
        result={bulkOpened?.result ?? null}
        onClose={() => setBulkOpened(null)}
      />
    </>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, count, total, accent, claimableCount, onClaimAll }: {
  title: string; subtitle: string; count: number; total: number; accent?: 'purple'
  claimableCount?: number; onClaimAll?: () => void
}) {
  const done = count === total
  const isPurple = accent === 'purple'
  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-2">
        <p className="text-micro uppercase tracking-wider text-gray-400 font-mono">{title}</p>
        <span className="text-micro font-mono text-gray-600">{subtitle}</span>
      </div>
      <div className="flex items-center gap-2">
        {(claimableCount ?? 0) > 0 && onClaimAll && (
          <button
            onClick={onClaimAll}
            className={`text-micro font-mono px-2 py-0.5 rounded border transition-colors ${
              isPurple
                ? 'border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
                : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >
            Claim All ({claimableCount})
          </button>
        )}
        <span className={`text-micro font-mono ${done ? isPurple ? 'text-purple-400' : 'text-accent' : 'text-gray-500'}`}>
          {count}/{total}
        </span>
      </div>
    </div>
  )
}

// ── Quest Row ─────────────────────────────────────────────────────────────────

function QuestRow({ icon, title, description, progressText, pct, completed, claimed, chest, difficulty, onClaim, accent = 'neon' }: {
  icon: string; title: string; description: string; progressText: string
  pct: number; completed: boolean; claimed: boolean
  chest: { name: string; icon: string; image?: string }
  difficulty?: { label: string; color: string }
  onClaim: () => void; accent?: 'neon' | 'purple'
}) {
  const isPurple = accent === 'purple'
  const barColor = isPurple ? 'bg-purple-500/70' : 'bg-accent/70'
  const doneBarColor = isPurple ? 'bg-purple-400' : 'bg-accent'

  return (
    <div className={`rounded border p-2.5 transition-all ${
      claimed ? 'border-white/5 bg-surface-1/30 opacity-50'
      : completed ? isPurple ? 'border-purple-500/30 bg-purple-500/5' : 'border-accent/25 bg-accent/5'
      : 'border-white/8 bg-surface-2/50'
    }`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
          claimed ? 'bg-white/5' : completed ? isPurple ? 'bg-purple-500/15' : 'bg-accent/15' : 'bg-surface-0/80'
        }`}>
          <span className="text-base leading-none">{claimed ? '✓' : icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className={`text-caption font-medium truncate ${claimed ? 'text-gray-500' : 'text-gray-200'}`}>{title}</p>
              {difficulty && !claimed && (
                <span className={`text-micro font-mono ${difficulty.color} shrink-0`}>{difficulty.label}</span>
              )}
            </div>
            {claimed ? (
              <span className="text-micro px-1.5 py-0.5 rounded border border-accent/20 bg-accent/8 text-accent font-mono shrink-0">Done</span>
            ) : completed ? (
              <button type="button" onClick={onClaim}
                className={`text-micro px-2 py-1 rounded border font-semibold transition-colors shrink-0 ${
                  isPurple ? 'border-purple-500/40 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25'
                  : 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
                }`}>
                <span className="inline-flex items-center gap-1">
                  Claim
                  {chest.image ? <img src={chest.image} alt="" className="w-3.5 h-3.5 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} /> : <span className="text-micro">{chest.icon}</span>}
                </span>
              </button>
            ) : (
              <span className="text-micro text-gray-500 font-mono shrink-0">{progressText}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className={`text-micro ${claimed ? 'text-gray-600' : 'text-gray-500'} truncate`}>{description}</p>
            {!claimed && !completed && (
              <span className="text-micro text-gray-600 font-mono shrink-0 inline-flex items-center gap-0.5">
                {chest.image ? <img src={chest.image} alt="" className="w-3 h-3 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} /> : chest.icon}
              </span>
            )}
          </div>
        </div>
      </div>
      {!claimed && (
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${completed ? doneBarColor : barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Bonus Row ─────────────────────────────────────────────────────────────────

function BonusRow({ claimed, canClaim, progress, total, onClaim }: {
  claimed: boolean; canClaim: boolean; progress: number; total: number; onClaim: () => void
}) {
  const legendaryChest = CHEST_DEFS['legendary_chest']
  return (
    <div className={`rounded border p-3 transition-all ${
      canClaim ? 'border-yellow-500/40 bg-yellow-500/5' : claimed ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-white/5 bg-surface-1/30'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${claimed ? 'bg-yellow-500/15' : 'bg-surface-0/80'}`}>
            <span className="text-base">🏅</span>
          </div>
          <div className="min-w-0">
            <p className={`text-caption font-semibold ${claimed ? 'text-yellow-400' : canClaim ? 'text-yellow-300' : 'text-gray-300'}`}>
              Complete All Dailies
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              {legendaryChest && (
                legendaryChest.image
                  ? <img src={legendaryChest.image} alt="" className="w-3 h-3 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                  : <span className="text-micro">{legendaryChest.icon}</span>
              )}
              <p className="text-micro text-gray-500">Legendary Chest bonus</p>
            </div>
          </div>
        </div>
        {claimed ? (
          <span className="text-micro px-2 py-1 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-mono shrink-0">Claimed</span>
        ) : canClaim ? (
          <button type="button" onClick={onClaim}
            className="text-micro px-3 py-1.5 rounded border border-yellow-500/40 bg-yellow-500/15 text-yellow-400 font-semibold hover:bg-yellow-500/25 transition-colors animate-pulse shrink-0 flex items-center gap-1">
            Claim
            {legendaryChest && (
              legendaryChest.image
                ? <img src={legendaryChest.image} alt="" className="w-3.5 h-3.5 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                : <span className="text-micro">{legendaryChest.icon}</span>
            )}
          </button>
        ) : (
          <span className="text-micro text-gray-600 font-mono shrink-0">{progress}/{total}</span>
        )}
      </div>
      {!claimed && (
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-yellow-500/60 transition-all duration-500" style={{ width: `${(progress / total) * 100}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Cosmetic reward preview ───────────────────────────────────────────────────

function CosmeticRewardPreview({ achievementId, dimmed }: { achievementId: string; dimmed?: boolean }) {
  const unlock = ACHIEVEMENT_COSMETIC_UNLOCKS[achievementId]
  if (!unlock) return null
  const opacity = dimmed ? 'opacity-50' : ''

  const parts: React.ReactNode[] = []

  if (unlock.frameId) {
    const frame = FRAMES.find((f) => f.id === unlock.frameId)
    if (frame) {
      const rarityColor = frame.rarity === 'Legendary' ? '#FFD700' : frame.rarity === 'Epic' ? '#C084FC' : '#4FC3F7'
      parts.push(
        <span key="frame" className="inline-flex items-center gap-1">
          <span
            className={`w-4 h-4 rounded-[3px] flex items-center justify-center text-[7px] border frame-style-${frame.style}`}
            style={{ borderColor: frame.color, background: frame.gradient, opacity: 0.8 }}
          >
            {'\u2726'}
          </span>
          <span className="text-micro font-mono" style={{ color: rarityColor }}>{frame.name}</span>
        </span>
      )
    }
  }

  if (unlock.badgeId) {
    const badge = BADGES.find((b) => b.id === unlock.badgeId)
    if (badge) {
      parts.push(
        <span
          key="badge"
          className="text-micro px-1 py-[1px] rounded font-medium border"
          style={{ borderColor: `${badge.color}40`, backgroundColor: `${badge.color}15`, color: badge.color }}
        >
          {badge.icon} {badge.label}
        </span>
      )
    }
  }

  if (unlock.avatarEmoji) {
    parts.push(
      <span key="avatar" className="inline-flex items-center gap-0.5">
        <span className="text-sm leading-none">{unlock.avatarEmoji}</span>
        {!unlock.frameId && !unlock.badgeId && <span className="text-micro font-mono text-gray-400">Avatar</span>}
      </span>
    )
  }

  if (parts.length === 0) return null
  return <div className={`inline-flex items-center gap-1.5 ${opacity}`}>{parts}</div>
}

// ── Achievement Row ───────────────────────────────────────────────────────────

function AchievementRow({ achievement, unlocked, claimed, progress, skillIcon, onClaim }: {
  achievement: AchievementDef
  unlocked: boolean; claimed: boolean
  progress: { current: number; target: number; label: string; complete: boolean } | null
  skillIcon?: string
  onClaim: () => void
}) {
  const pct = progress ? Math.min(100, (progress.current / progress.target) * 100) : (unlocked ? 100 : 0)
  const canClaim = unlocked && !claimed && !!achievement.reward

  return (
    <div className={`rounded border p-2.5 transition-all ${
      claimed ? 'border-white/5 bg-surface-1/30 opacity-50'
      : unlocked ? 'border-accent/20 bg-accent/5'
      : 'border-white/5 bg-surface-1/40'
    }`}>
      <div className="flex items-center gap-2.5">
        {/* Icon */}
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
          claimed ? 'bg-white/5' : unlocked ? 'bg-accent/15' : 'bg-surface-0/80'
        }`}>
          <span className="text-base leading-none">{unlocked ? achievement.icon : '🔒'}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <p className={`text-caption font-medium truncate ${claimed ? 'text-gray-500' : unlocked ? 'text-white' : 'text-gray-400'}`}>
              {achievement.name}
            </p>
            {canClaim ? (
              <button type="button" onClick={onClaim}
                className="text-micro px-2 py-1 rounded border border-accent/40 bg-accent/15 text-accent font-semibold hover:bg-accent/25 transition-colors shrink-0 animate-pulse">
                CLAIM
              </button>
            ) : claimed ? (
              <span className="text-micro px-1.5 py-0.5 rounded border border-accent/20 bg-accent/8 text-accent font-mono shrink-0">Done</span>
            ) : progress ? (
              <span className="text-micro text-gray-500 font-mono shrink-0">{progress.label}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <CosmeticRewardPreview achievementId={achievement.id} dimmed={claimed} />
            {achievement.reward && !ACHIEVEMENT_COSMETIC_UNLOCKS[achievement.id] && !claimed && (
              <span className="text-micro text-gray-500 font-mono">{achievement.reward.label || achievement.reward.value}</span>
            )}
            <span className={`text-micro font-mono ${unlocked ? 'text-accent/60' : 'text-gray-600'}`}>+{achievement.xpReward}xp{skillIcon ? ` ${skillIcon}` : ''}</span>
          </div>
          {!unlocked && achievement.description && (
            <p className="text-micro text-gray-600 mt-0.5 truncate">{achievement.description}</p>
          )}
        </div>
      </div>

      {/* Progress bar — only for unclaimed achievements with known progress */}
      {!claimed && progress && !unlocked && (
        <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-accent/50 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
