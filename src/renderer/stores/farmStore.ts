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
  type SeedDef,
  type SeedZipTier,
} from '../lib/farming'
import type { ChestType } from '../lib/loot'
import { recordHarvest } from '../services/dailyActivityService'
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { useAuthStore } from './authStore'

export interface PlantedSlot {
  seedId: string
  plantedAt: number       // Date.now() ms
  growTimeSeconds: number
  composted?: boolean
}

export interface HarvestResult {
  yieldPlantId: string
  qty: number
  xpGained: number
  seedZipTier: SeedZipTier | null
  composted?: boolean
  compostDrop?: boolean
  /** Aggregated: number of compost drops (when merging multiple plots) */
  compostDropCount?: number
  /** Aggregated: number of composted plots */
  compostedCount?: number
  /** Aggregated: all seed zip drops (when merging multiple plots) */
  seedZipDrops?: { tier: SeedZipTier; count: number }[]
  /** Aggregated: total plots merged into this result */
  plotCount?: number
}

/** Chance to drop 1 compost on any harvest. */
const HARVEST_COMPOST_DROP_CHANCE = 0.08

/** Compost cost per plot. */
export const COMPOST_PER_PLOT = 3

interface FarmState {
  unlockedSlots: number                           // 1–8
  planted: Partial<Record<number, PlantedSlot>>   // slot index → planted info
  compostedSlots: Record<number, boolean>         // slot index → pre-composted (empty slot)
  seeds: Record<string, number>                   // seedId → count in storage
  seedZips: Record<SeedZipTier, number>           // tier → Seed Zip count
  seedCabinetUnlocked: boolean

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

      unlockNextSlot() {
        const { unlockedSlots } = get()
        if (unlockedSlots >= MAX_FARM_SLOTS) return false
        const cost = SLOT_UNLOCK_COSTS[unlockedSlots]
        if (cost == null) return false
        const gold = useGoldStore.getState().gold ?? 0
        if (gold < cost) return false
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
        const { planted, seeds, unlockedSlots, compostedSlots } = get()
        if (slotIndex >= unlockedSlots) return
        if (planted[slotIndex]) return
        const qty = seeds[seedId] ?? 0
        if (qty <= 0) return
        const seed = getSeedById(seedId)
        if (!seed) return

        const wasComposted = !!compostedSlots[slotIndex]
        const newComposted = { ...compostedSlots }
        if (wasComposted) delete newComposted[slotIndex]

        set({
          planted: {
            ...planted,
            [slotIndex]: {
              seedId,
              plantedAt: Date.now(),
              growTimeSeconds: seed.growTimeSeconds,
              composted: wasComposted || undefined,
            },
          },
          seeds: { ...seeds, [seedId]: qty - 1 },
          compostedSlots: newComposted,
        })

        grantFarmerXP(seed.xpOnPlant).catch(() => undefined)
      },

      plantAll(seedId) {
        const { planted, seeds, unlockedSlots, compostedSlots } = get()
        const seed = getSeedById(seedId)
        if (!seed) return 0
        let available = seeds[seedId] ?? 0
        if (available <= 0) return 0

        const newPlanted = { ...planted }
        const newSeeds = { ...seeds }
        const newComposted = { ...compostedSlots }
        let count = 0
        const now = Date.now()

        for (let i = 0; i < unlockedSlots; i++) {
          if (newPlanted[i] || available <= 0) continue
          const wasComposted = !!newComposted[i]
          if (wasComposted) delete newComposted[i]
          newPlanted[i] = {
            seedId,
            plantedAt: now,
            growTimeSeconds: seed.growTimeSeconds,
            composted: wasComposted || undefined,
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
        const { planted, seedZips } = get()
        const slot = planted[slotIndex]
        if (!slot || !isSlotReady(slot)) return null

        const seed: SeedDef | undefined = getSeedById(slot.seedId)
        if (!seed) return null

        const isComposted = !!slot.composted
        let qty = randomBetween(seed.yieldMin, seed.yieldMax)
        if (isComposted) qty = Math.ceil(qty * 1.2)
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

        set({ planted: newPlanted, seedZips: newZips })
        const xp = isComposted ? Math.ceil(seed.xpOnHarvest * 1.05) : seed.xpOnHarvest
        grantFarmerXP(xp).catch(() => undefined)

        recordHarvest(1)
        return { yieldPlantId: seed.yieldPlantId, qty, xpGained: xp, seedZipTier, composted: isComposted, compostDrop }
      },

      harvestAll() {
        const { planted, seedZips } = get()
        const newPlanted = { ...planted }
        const newZips = { ...seedZips }
        const results: HarvestResult[] = []

        for (const [idxStr, slot] of Object.entries(planted)) {
          if (!slot) continue
          if (!isSlotReady(slot)) continue
          const seed = getSeedById(slot.seedId)
          if (!seed) continue
          const isComposted = !!slot.composted
          let qty = randomBetween(seed.yieldMin, seed.yieldMax)
          if (isComposted) qty = Math.ceil(qty * 1.2)
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

          results.push({ yieldPlantId: seed.yieldPlantId, qty, xpGained: xp, seedZipTier, composted: isComposted, compostDrop })
        }

        set({ planted: newPlanted, seedZips: newZips })
        if (results.length > 0) recordHarvest(results.length)
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
      }),
    },
  ),
)
