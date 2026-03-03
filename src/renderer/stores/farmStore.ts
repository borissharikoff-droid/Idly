import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SLOT_UNLOCK_COSTS,
  MAX_FARM_SLOTS,
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
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { useAuthStore } from './authStore'

export interface PlantedSlot {
  seedId: string
  plantedAt: number       // Date.now() ms
  growTimeSeconds: number
}

export interface HarvestResult {
  yieldPlantId: string
  qty: number
  xpGained: number
  seedZipTier: SeedZipTier | null
}

interface FarmState {
  unlockedSlots: number                           // 1–8
  planted: Partial<Record<number, PlantedSlot>>   // slot index → planted info
  seeds: Record<string, number>                   // seedId → count in storage
  seedZips: Record<SeedZipTier, number>           // tier → Seed Zip count

  unlockNextSlot: () => boolean
  plantSeed: (slotIndex: number, seedId: string) => void
  harvestSlot: (slotIndex: number) => HarvestResult | null
  harvestAll: () => HarvestResult[]
  rollSeedDrop: (chestType: ChestType) => SeedZipTier | null
  addSeed: (seedId: string, qty: number) => void
  addSeedZip: (tier: SeedZipTier, qty?: number) => void
  removeSeedZip: (tier: SeedZipTier, qty?: number) => void
  openSeedZip: (tier: SeedZipTier) => string | null
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
      seeds: {},
      seedZips: { common: 0, rare: 0, epic: 0, legendary: 0 },

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
        const { planted, seeds, unlockedSlots } = get()
        if (slotIndex >= unlockedSlots) return
        if (planted[slotIndex]) return
        const qty = seeds[seedId] ?? 0
        if (qty <= 0) return
        const seed = getSeedById(seedId)
        if (!seed) return

        set({
          planted: {
            ...planted,
            [slotIndex]: {
              seedId,
              plantedAt: Date.now(),
              growTimeSeconds: seed.growTimeSeconds,
            },
          },
          seeds: { ...seeds, [seedId]: qty - 1 },
        })

        grantFarmerXP(seed.xpOnPlant).catch(() => undefined)
      },

      harvestSlot(slotIndex) {
        const { planted } = get()
        const slot = planted[slotIndex]
        if (!slot || !isSlotReady(slot)) return null

        const seed: SeedDef | undefined = getSeedById(slot.seedId)
        if (!seed) return null

        const qty = randomBetween(seed.yieldMin, seed.yieldMax)
        useInventoryStore.getState().addItem(seed.yieldPlantId, qty)

        const newPlanted = { ...planted }
        delete newPlanted[slotIndex]

        // Bonus: chance to drop a Seed Zip on harvest
        const newZips = { ...get().seedZips }
        let seedZipTier: SeedZipTier | null = null
        if (Math.random() < HARVEST_SEED_ZIP_CHANCE) {
          seedZipTier = rollHarvestSeedZipTier()
          newZips[seedZipTier] = (newZips[seedZipTier] ?? 0) + 1
        }

        set({ planted: newPlanted, seedZips: newZips })
        grantFarmerXP(seed.xpOnHarvest).catch(() => undefined)

        return { yieldPlantId: seed.yieldPlantId, qty, xpGained: seed.xpOnHarvest, seedZipTier }
      },

      harvestAll() {
        const { planted } = get()
        const newPlanted = { ...planted }
        const newZips = { ...get().seedZips }
        const results: HarvestResult[] = []

        for (const [idxStr, slot] of Object.entries(planted)) {
          if (!slot) continue
          if (!isSlotReady(slot)) continue
          const seed = getSeedById(slot.seedId)
          if (!seed) continue
          const qty = randomBetween(seed.yieldMin, seed.yieldMax)
          useInventoryStore.getState().addItem(seed.yieldPlantId, qty)
          grantFarmerXP(seed.xpOnHarvest).catch(() => undefined)
          delete newPlanted[Number(idxStr)]

          let seedZipTier: SeedZipTier | null = null
          if (Math.random() < HARVEST_SEED_ZIP_CHANCE) {
            seedZipTier = rollHarvestSeedZipTier()
            newZips[seedZipTier] = (newZips[seedZipTier] ?? 0) + 1
          }

          results.push({ yieldPlantId: seed.yieldPlantId, qty, xpGained: seed.xpOnHarvest, seedZipTier })
        }

        set({ planted: newPlanted, seedZips: newZips })
        return results
      },

      rollSeedDrop(chestType) {
        if (!rollSeedZipFromChest(chestType)) return null
        const tier = CHEST_TO_ZIP_TIER[chestType]
        const { seedZips } = get()
        set({ seedZips: { ...seedZips, [tier]: (seedZips[tier] ?? 0) + 1 } })
        return tier
      },

      addSeed(seedId, qty) {
        const { seeds } = get()
        set({ seeds: { ...seeds, [seedId]: (seeds[seedId] ?? 0) + qty } })
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
        const { seedZips, seeds } = get()
        if ((seedZips[tier] ?? 0) <= 0) return null
        const seedId = rollSeedFromZip(tier)
        const newZips = { ...seedZips, [tier]: seedZips[tier] - 1 }
        if (!seedId) { set({ seedZips: newZips }); return null }
        set({ seedZips: newZips, seeds: { ...seeds, [seedId]: (seeds[seedId] ?? 0) + 1 } })
        return seedId
      },

      mergeSeedsFromCloud(cloudSeeds) {
        const { seeds } = get()
        const merged: Record<string, number> = { ...seeds }
        for (const [seedId, cloudQty] of Object.entries(cloudSeeds)) {
          if (getSeedById(seedId) && (cloudQty ?? 0) > 0) {
            merged[seedId] = Math.max(merged[seedId] ?? 0, cloudQty)
          }
        }
        set({ seeds: merged })
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
        seeds: s.seeds,
        seedZips: s.seedZips,
      }),
    },
  ),
)
