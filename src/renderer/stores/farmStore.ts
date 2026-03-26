import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SLOT_UNLOCK_COSTS,
  MAX_FARM_SLOTS,
  SEED_DEFS,
  getSeedById,
  rollSeedZipFromChest,
  rollSeedFromZip,
  HARVEST_SEED_ZIP_CHANCE,
  rollHarvestSeedZipTier,
  CHEST_TO_ZIP_TIER,
  grantFarmerXP,
  rollCropRot,
  getEffectiveGrowTime,
  getFarmhouseBonuses,
  getNextFarmhouseUpgrade,
  FARMHOUSE_UNLOCK_LEVEL,
  canUnlockSlot,
  getFarmerSpeedMultiplier,
  getFarmerBonusYieldChance,
  type SeedDef,
  type SeedZipTier,
  type FieldId,
} from '../lib/farming'
import { skillLevelFromXP } from '../lib/skills'
import type { ChestType } from '../lib/loot'
import { recordHarvest } from '../services/dailyActivityService'
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { useAuthStore } from './authStore'
import { useBountyStore } from './bountyStore'
import { useWeeklyStore } from './weeklyStore'
import { track } from '../lib/analytics'
import { getGuildFarmYieldBonus } from '../lib/guildBuffs'
import { useGuildStore } from './guildStore'

function getFarmerLevel(): number {
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    return skillLevelFromXP(stored['farmer'] ?? 0)
  } catch {
    return 0
  }
}

export interface PlantedSlot {
  seedId: string
  plantedAt: number       // Date.now() ms
  growTimeSeconds: number
  composted?: boolean
  rotAt?: number          // timestamp when crop will rot (if rolled)
  rotted?: boolean        // true once crop has rotted
}

export interface HarvestResult {
  yieldPlantId: string
  qty: number
  xpGained: number
  seedZipTier: SeedZipTier | null
  composted?: boolean
  compostDrop?: boolean
  /** True if harvest failed (crop wilted). */
  failed?: boolean
  /** Aggregated: number of compost drops (when merging multiple plots) */
  compostDropCount?: number
  /** Aggregated: number of composted plots */
  compostedCount?: number
  /** Aggregated: all seed zip drops (when merging multiple plots) */
  seedZipDrops?: { tier: SeedZipTier; count: number }[]
  /** Aggregated: total plots merged into this result */
  plotCount?: number
  /** Seed returned on harvest (30% chance) */
  seedDrop?: string
  /** Aggregated: number of seed drops */
  seedDropCount?: number
}

/** Chance to drop 1 compost on any harvest. */
const HARVEST_COMPOST_DROP_CHANCE = 0.08

/** Chance to return 1 of the planted seed on harvest. */
const HARVEST_SEED_RETURN_CHANCE = 0.30

/** Compost cost per plot. */
export const COMPOST_PER_PLOT = 3

interface FarmState {
  unlockedSlots: number                           // 1–16
  planted: Partial<Record<number, PlantedSlot>>   // slot index → planted info
  compostedSlots: Record<number, boolean>         // slot index → pre-composted (empty slot)
  seeds: Record<string, number>                   // seedId → count in storage
  seedZips: Record<SeedZipTier, number>           // tier → Seed Zip count
  seedCabinetUnlocked: boolean
  farmhouseLevel: number                          // 0 = not built, 1–10 = upgrade level
  farmhouseBuildStartedAt: number | null          // timestamp when build/upgrade started
  farmhouseBuildTargetLevel: number | null        // which level is being built
  activeField: FieldId                            // currently selected field tab

  unlockNextSlot: () => boolean
  plantSeed: (slotIndex: number, seedId: string) => void
  cancelPlanting: (slotIndex: number) => boolean
  harvestSlot: (slotIndex: number) => HarvestResult | null
  harvestAll: () => HarvestResult[]
  /** Plant the same seed in all empty slots. Returns number planted. */
  plantAll: (seedId: string) => number
  /** Compost an empty slot (costs COMPOST_PER_PLOT from inventory). */
  compostSlot: (slotIndex: number) => boolean
  /** Compost all empty uncomposted slots. Returns count composted. */
  compostAll: () => number
  rollSeedDrop: (chestType: ChestType) => SeedZipTier | null
  addSeed: (seedId: string, qty: number) => void
  removeSeed: (seedId: string, qty: number) => void
  unlockSeedCabinet: () => void
  addSeedZip: (tier: SeedZipTier, qty?: number) => void
  removeSeedZip: (tier: SeedZipTier, qty?: number) => void
  openSeedZip: (tier: SeedZipTier) => string | null
  /** Transfer seeds from inventory into the cabinet (farmStore.seeds). Called when cabinet opens. */
  transferSeedsFromInventory: () => void
  /** Merge cloud seeds into local (takes max). Used after sync. */
  mergeSeedsFromCloud: (cloudSeeds: Record<string, number>) => void
  /** Merge cloud seed zips into local (takes max). Used after sync. */
  mergeSeedZipsFromCloud: (cloudSeedZips: Record<SeedZipTier, number>) => void
  /** Switch active field tab. */
  setActiveField: (field: FieldId) => void
  /** Start farmhouse build/upgrade. Deducts costs and starts timer. Returns false if requirements not met. */
  upgradeFarmhouse: () => boolean
  /** Complete a finished farmhouse build. Returns true if build was complete. */
  completeFarmhouseBuild: () => boolean
  /** Auto-harvest all ready crops (farmhouse L10). Returns results. */
  autoHarvestReady: () => HarvestResult[]
  /** Check all planted slots for rot. Returns indices of newly rotted slots. */
  checkAllRots: () => number[]
}

function isSlotReady(slot: PlantedSlot): boolean {
  const elapsed = (Date.now() - slot.plantedAt) / 1000
  return elapsed >= slot.growTimeSeconds
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export const useFarmStore = create<FarmState>()(
  persist(
    (set, get) => ({
      unlockedSlots: 1,
      planted: {},
      compostedSlots: {},
      seeds: {},
      seedZips: { common: 0, rare: 0, epic: 0, legendary: 0 },
      seedCabinetUnlocked: false,
      farmhouseLevel: 0,
      farmhouseBuildStartedAt: null,
      farmhouseBuildTargetLevel: null,
      activeField: 'field1',

      unlockNextSlot() {
        const { unlockedSlots } = get()
        if (unlockedSlots >= MAX_FARM_SLOTS) return false
        const cost = SLOT_UNLOCK_COSTS[unlockedSlots]
        if (cost == null) return false
        const gold = useGoldStore.getState().gold ?? 0
        // Check level requirements
        let skillXP: Record<string, number> = {}
        try { skillXP = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number> } catch { /* */ }
        const check = canUnlockSlot(unlockedSlots, gold, skillXP)
        if (!check.canUnlock) return false
        useGoldStore.getState().addGold(-cost)
        try {
          const userId = useAuthStore.getState().user?.id
          if (userId) {
            useGoldStore.getState().syncToSupabase(userId).catch(() => {})
          }
        } catch { /* ignore */ }
        set({ unlockedSlots: unlockedSlots + 1 })
        return true
      },

      plantSeed(slotIndex, seedId) {
        const { planted, seeds, unlockedSlots, compostedSlots, farmhouseLevel } = get()
        if (slotIndex >= unlockedSlots) return
        if (planted[slotIndex]) return
        const qty = seeds[seedId] ?? 0
        if (qty <= 0) return
        const seed = getSeedById(seedId)
        if (!seed) return

        let wasComposted = !!compostedSlots[slotIndex]
        const newComposted = { ...compostedSlots }
        if (wasComposted) delete newComposted[slotIndex]

        // Auto-compost chance from farmhouse
        if (!wasComposted && farmhouseLevel > 0) {
          const bonuses = getFarmhouseBonuses(farmhouseLevel)
          if (bonuses.autoCompostPct > 0 && Math.random() * 100 < bonuses.autoCompostPct) {
            wasComposted = true
          }
        }

        const now = Date.now()
        const farmerLvl = getFarmerLevel()
        const effectiveGrowTime = Math.ceil(getEffectiveGrowTime(seed.growTimeSeconds, farmhouseLevel) * getFarmerSpeedMultiplier(farmerLvl))

        set({
          planted: {
            ...planted,
            [slotIndex]: {
              seedId,
              plantedAt: now,
              growTimeSeconds: effectiveGrowTime,
              composted: wasComposted || undefined,
            },
          },
          seeds: { ...seeds, [seedId]: qty - 1 },
          compostedSlots: newComposted,
        })

        grantFarmerXP(seed.xpOnPlant).catch(() => undefined)
      },

      plantAll(seedId) {
        const { planted, seeds, unlockedSlots, compostedSlots, farmhouseLevel } = get()
        const seed = getSeedById(seedId)
        if (!seed) return 0
        let available = seeds[seedId] ?? 0
        if (available <= 0) return 0

        const newPlanted = { ...planted }
        const newSeeds = { ...seeds }
        const newComposted = { ...compostedSlots }
        let count = 0
        const now = Date.now()
        const farmerLvl = getFarmerLevel()
        const effectiveGrowTime = Math.ceil(getEffectiveGrowTime(seed.growTimeSeconds, farmhouseLevel) * getFarmerSpeedMultiplier(farmerLvl))
        const autoCompostPct = getFarmhouseBonuses(farmhouseLevel).autoCompostPct

        for (let i = 0; i < unlockedSlots; i++) {
          if (newPlanted[i] || available <= 0) continue
          let wasComposted = !!newComposted[i]
          if (wasComposted) delete newComposted[i]
          // Auto-compost from farmhouse
          if (!wasComposted && autoCompostPct > 0 && Math.random() * 100 < autoCompostPct) {
            wasComposted = true
          }
          const rotResult = rollCropRot(seed.rarity, farmhouseLevel)
          const rotAt = rotResult ? now + Math.floor(effectiveGrowTime * rotResult.rotAtFraction * 1000) : undefined
          newPlanted[i] = {
            seedId,
            plantedAt: now,
            growTimeSeconds: effectiveGrowTime,
            composted: wasComposted || undefined,
            rotAt,
          }
          available--
          count++
        }

        if (count > 0) {
          newSeeds[seedId] = available
          set({ planted: newPlanted, seeds: newSeeds, compostedSlots: newComposted })
          grantFarmerXP(seed.xpOnPlant * count).catch(() => undefined)
        }
        return count
      },

      cancelPlanting(slotIndex) {
        const { planted } = get()
        const slot = planted[slotIndex]
        if (!slot) return false
        if (isSlotReady(slot)) return false
        const newPlanted = { ...planted }
        delete newPlanted[slotIndex]
        set({ planted: newPlanted })
        return true
      },

      harvestSlot(slotIndex) {
        const { planted, seedZips, farmhouseLevel } = get()
        const slot = planted[slotIndex]
        if (!slot || !isSlotReady(slot)) return null
        if (slot.rotted) return null // can't harvest rotted crops

        const seed: SeedDef | undefined = getSeedById(slot.seedId)
        if (!seed) return null

        const isComposted = !!slot.composted
        let qty = randomBetween(seed.yieldMin, seed.yieldMax)
        if (isComposted) qty = Math.ceil(qty * 1.2)
        // Farmer level bonus yield chance (+1 per proc)
        const farmerBonusChance = getFarmerBonusYieldChance(getFarmerLevel())
        if (farmerBonusChance > 0 && Math.random() < farmerBonusChance) qty += 1
        // Farmhouse + guild hall yield bonus (additive)
        const yieldBonus = getFarmhouseBonuses(farmhouseLevel).yieldBonusPct
          + getGuildFarmYieldBonus(useGuildStore.getState().hallLevel)
        if (yieldBonus > 0) qty = Math.ceil(qty * (1 + yieldBonus / 100))
        useInventoryStore.getState().addItem(seed.yieldPlantId, qty)

        const newPlanted = { ...planted }
        delete newPlanted[slotIndex]

        // Bonus: chance to drop a Seed Zip on harvest
        const newZips = { ...seedZips }
        let seedZipTier: SeedZipTier | null = null
        if (Math.random() < HARVEST_SEED_ZIP_CHANCE) {
          seedZipTier = rollHarvestSeedZipTier()
          newZips[seedZipTier] = (newZips[seedZipTier] ?? 0) + 1
        }

        // Bonus: chance to drop 1 compost on any harvest
        const compostDrop = Math.random() < HARVEST_COMPOST_DROP_CHANCE
        if (compostDrop) useInventoryStore.getState().addItem('compost', 1)

        // Bonus: 30% chance to return 1 of the planted seed
        const seedDrop = Math.random() < HARVEST_SEED_RETURN_CHANCE ? seed.id : undefined
        if (seedDrop) useInventoryStore.getState().addItem(seedDrop, 1)

        set({ planted: newPlanted, seedZips: newZips })
        const xp = isComposted ? Math.ceil(seed.xpOnHarvest * 1.05) : seed.xpOnHarvest
        grantFarmerXP(xp).catch(() => undefined)

        recordHarvest(1)
        useBountyStore.getState().incrementFarm(1)
        useWeeklyStore.getState().incrementFarm(1)
        import('./guildStore').then(({ useGuildStore }) => useGuildStore.getState().incrementRaidProgress('farm', 1)).catch(() => {})
        track('farm_harvest', { seed_id: slot.seedId, yield_count: qty })
        return { yieldPlantId: seed.yieldPlantId, qty, xpGained: xp, seedZipTier, composted: isComposted, compostDrop, seedDrop }
      },

      harvestAll() {
        const { planted, seedZips, farmhouseLevel } = get()
        const newPlanted = { ...planted }
        const newZips = { ...seedZips }
        const results: HarvestResult[] = []
        const yieldBonus = getFarmhouseBonuses(farmhouseLevel).yieldBonusPct
          + getGuildFarmYieldBonus(useGuildStore.getState().hallLevel)
        const farmerBonusChance = getFarmerBonusYieldChance(getFarmerLevel())

        for (const [idxStr, slot] of Object.entries(planted)) {
          if (!slot) continue
          if (!isSlotReady(slot)) continue
          if (slot.rotted) continue
          const seed = getSeedById(slot.seedId)
          if (!seed) continue
          const isComposted = !!slot.composted
          let qty = randomBetween(seed.yieldMin, seed.yieldMax)
          if (isComposted) qty = Math.ceil(qty * 1.2)
          if (farmerBonusChance > 0 && Math.random() < farmerBonusChance) qty += 1
          if (yieldBonus > 0) qty = Math.ceil(qty * (1 + yieldBonus / 100))
          useInventoryStore.getState().addItem(seed.yieldPlantId, qty)
          const xp = isComposted ? Math.ceil(seed.xpOnHarvest * 1.05) : seed.xpOnHarvest
          grantFarmerXP(xp).catch(() => undefined)
          delete newPlanted[Number(idxStr)]

          let seedZipTier: SeedZipTier | null = null
          if (Math.random() < HARVEST_SEED_ZIP_CHANCE) {
            seedZipTier = rollHarvestSeedZipTier()
            newZips[seedZipTier] = (newZips[seedZipTier] ?? 0) + 1
          }

          const compostDrop = Math.random() < HARVEST_COMPOST_DROP_CHANCE
          if (compostDrop) useInventoryStore.getState().addItem('compost', 1)

          const seedDrop = Math.random() < HARVEST_SEED_RETURN_CHANCE ? seed.id : undefined
          if (seedDrop) useInventoryStore.getState().addItem(seedDrop, 1)

          track('farm_harvest', { seed_id: slot.seedId, yield_count: qty })
          results.push({ yieldPlantId: seed.yieldPlantId, qty, xpGained: xp, seedZipTier, composted: isComposted, compostDrop, seedDrop })
        }

        set({ planted: newPlanted, seedZips: newZips })
        if (results.length > 0) {
          recordHarvest(results.length)
          useBountyStore.getState().incrementFarm(results.length)
          useWeeklyStore.getState().incrementFarm(results.length)
          import('./guildStore').then(({ useGuildStore }) => useGuildStore.getState().incrementRaidProgress('farm', results.length)).catch(() => {})
        }
        return results
      },

      compostSlot(slotIndex) {
        const { planted, compostedSlots, unlockedSlots } = get()
        if (slotIndex >= unlockedSlots) return false
        // Only compost empty, uncomposted slots
        if (planted[slotIndex]) return false
        if (compostedSlots[slotIndex]) return false
        const inv = useInventoryStore.getState()
        if ((inv.items['compost'] ?? 0) < COMPOST_PER_PLOT) return false
        inv.deleteItem('compost', COMPOST_PER_PLOT)
        set({ compostedSlots: { ...compostedSlots, [slotIndex]: true } })
        return true
      },

      compostAll() {
        const { planted, compostedSlots, unlockedSlots } = get()
        const inv = useInventoryStore.getState()
        let available = inv.items['compost'] ?? 0
        const newComposted = { ...compostedSlots }
        let count = 0
        for (let i = 0; i < unlockedSlots; i++) {
          if (planted[i] || newComposted[i] || available < COMPOST_PER_PLOT) continue
          newComposted[i] = true
          available -= COMPOST_PER_PLOT
          count++
        }
        if (count > 0) {
          inv.deleteItem('compost', count * COMPOST_PER_PLOT)
          set({ compostedSlots: newComposted })
        }
        return count
      },

      rollSeedDrop(chestType) {
        if (!rollSeedZipFromChest(chestType)) return null
        const tier = CHEST_TO_ZIP_TIER[chestType]
        const { seedZips } = get()
        set({ seedZips: { ...seedZips, [tier]: (seedZips[tier] ?? 0) + 1 } })
        return tier
      },

      addSeed(seedId, qty) {
        // Seeds land in inventory; cabinet pulls them when opened
        useInventoryStore.getState().addItem(seedId, qty)
      },

      removeSeed(seedId, qty) {
        const { seeds } = get()
        const current = seeds[seedId] ?? 0
        const next = Math.max(0, current - qty)
        const updated = { ...seeds }
        if (next === 0) delete updated[seedId]
        else updated[seedId] = next
        set({ seeds: updated })
      },

      unlockSeedCabinet() {
        set({ seedCabinetUnlocked: true })
      },

      addSeedZip(tier, qty = 1) {
        const { seedZips } = get()
        set({ seedZips: { ...seedZips, [tier]: (seedZips[tier] ?? 0) + qty } })
      },

      removeSeedZip(tier, qty = 1) {
        const { seedZips } = get()
        set({ seedZips: { ...seedZips, [tier]: Math.max(0, (seedZips[tier] ?? 0) - qty) } })
      },

      openSeedZip(tier) {
        const { seedZips } = get()
        if ((seedZips[tier] ?? 0) <= 0) return null
        const seedId = rollSeedFromZip(tier)
        if (!seedId) return null // Don't consume zip if roll fails
        set({ seedZips: { ...seedZips, [tier]: seedZips[tier] - 1 } })
        // Seeds go to inventory first; cabinet pulls them when opened
        useInventoryStore.getState().addItem(seedId, 1)
        return seedId
      },

      transferSeedsFromInventory() {
        const invStore = useInventoryStore.getState()
        const { seeds } = get()
        const newSeeds = { ...seeds }
        let changed = false
        for (const seed of SEED_DEFS) {
          const qty = invStore.items[seed.id] ?? 0
          if (qty > 0) {
            newSeeds[seed.id] = (newSeeds[seed.id] ?? 0) + qty
            invStore.deleteItem(seed.id, qty)
            changed = true
          }
        }
        if (changed) set({ seeds: newSeeds })
      },

      mergeSeedsFromCloud(cloudSeeds) {
        const invStore = useInventoryStore.getState()
        const { seeds } = get()
        for (const [seedId, cloudQty] of Object.entries(cloudSeeds)) {
          if (!getSeedById(seedId) || !(cloudQty ?? 0)) continue
          const cabinetQty = seeds[seedId] ?? 0
          const inventoryQty = invStore.items[seedId] ?? 0
          const totalLocal = cabinetQty + inventoryQty
          if (cloudQty > totalLocal) {
            invStore.addItem(seedId, cloudQty - totalLocal)
          }
        }
      },

      mergeSeedZipsFromCloud(cloudSeedZips) {
        const { seedZips } = get()
        const merged = { ...seedZips }
        for (const tier of ['common', 'rare', 'epic', 'legendary'] as SeedZipTier[]) {
          const cloudQty = cloudSeedZips[tier] ?? 0
          if (cloudQty > 0) {
            merged[tier] = Math.max(merged[tier] ?? 0, cloudQty)
          }
        }
        set({ seedZips: merged })
      },

      setActiveField(field) {
        set({ activeField: field })
      },

      upgradeFarmhouse() {
        const { farmhouseLevel, farmhouseBuildStartedAt } = get()
        // Don't allow starting a new build while one is in progress
        if (farmhouseBuildStartedAt != null) return false

        // Check farmer level requirement
        let skillXP: Record<string, number> = {}
        try { skillXP = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number> } catch { /* */ }
        const farmerLvl = skillLevelFromXP(skillXP['farmer'] ?? 0)
        if (farmerLvl < FARMHOUSE_UNLOCK_LEVEL) return false

        const upgrade = getNextFarmhouseUpgrade(farmhouseLevel)
        if (!upgrade) return false

        // Check gold
        const gold = useGoldStore.getState().gold ?? 0
        if (gold < upgrade.goldCost) return false

        // Check materials
        const inv = useInventoryStore.getState()
        for (const [matId, qty] of Object.entries(upgrade.materials)) {
          if ((inv.items[matId] ?? 0) < qty) return false
        }

        // Deduct costs
        useGoldStore.getState().addGold(-upgrade.goldCost)
        for (const [matId, qty] of Object.entries(upgrade.materials)) {
          inv.deleteItem(matId, qty)
        }

        try {
          const userId = useAuthStore.getState().user?.id
          if (userId) {
            useGoldStore.getState().syncToSupabase(userId).catch(() => {})
          }
        } catch { /* ignore */ }

        // Start build timer
        set({
          farmhouseBuildStartedAt: Date.now(),
          farmhouseBuildTargetLevel: upgrade.level,
        })
        return true
      },

      completeFarmhouseBuild() {
        const { farmhouseBuildStartedAt, farmhouseBuildTargetLevel, farmhouseLevel } = get()
        if (farmhouseBuildStartedAt == null || farmhouseBuildTargetLevel == null) return false

        const upgrade = getNextFarmhouseUpgrade(farmhouseLevel)
        if (!upgrade) return false

        const elapsed = Date.now() - farmhouseBuildStartedAt
        if (elapsed < upgrade.buildDurationMs) return false

        set({
          farmhouseLevel: farmhouseBuildTargetLevel,
          farmhouseBuildStartedAt: null,
          farmhouseBuildTargetLevel: null,
        })
        return true
      },

      checkAllRots() {
        const { planted } = get()
        const now = Date.now()
        const rotted: number[] = []
        const newPlanted = { ...planted }
        let changed = false

        for (const [idxStr, slot] of Object.entries(planted)) {
          if (!slot || slot.rotted) continue
          if (slot.rotAt && now >= slot.rotAt) {
            const idx = Number(idxStr)
            // Mark as rotted — remove the planted entry, give wilted_plant
            delete newPlanted[idx]
            useInventoryStore.getState().addItem('wilted_plant', 1)
            rotted.push(idx)
            changed = true
          }
        }

        if (changed) set({ planted: newPlanted })
        return rotted
      },

      autoHarvestReady() {
        const { farmhouseLevel } = get()
        const bonuses = getFarmhouseBonuses(farmhouseLevel)
        if (!bonuses.autoHarvest) return []
        return get().harvestAll()
      },
    }),
    {
      name: 'grindly_farm_state',
      partialize: (s) => ({
        unlockedSlots: s.unlockedSlots,
        planted: s.planted,
        compostedSlots: s.compostedSlots,
        seeds: s.seeds,
        seedZips: s.seedZips,
        seedCabinetUnlocked: s.seedCabinetUnlocked,
        farmhouseLevel: s.farmhouseLevel,
        farmhouseBuildStartedAt: s.farmhouseBuildStartedAt,
        farmhouseBuildTargetLevel: s.farmhouseBuildTargetLevel,
      }),
    },
  ),
)
