import React, { useEffect, useMemo, useState } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CHEST_DEFS, ITEM_POWER_BY_RARITY, LOOT_ITEMS, MARKETPLACE_BLOCKED_ITEMS, POTION_IDS, POTION_MAX, estimateLootDropRate, getItemPower, getItemPerks, type ChestType, getItemPerkDescription } from '../../lib/loot'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useRaidStore } from '../../stores/raidStore'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { BulkChestOpenModal, type BulkOpenResult } from '../animations/BulkChestOpenModal'
import { ListForSaleModal } from './ListForSaleModal'
import { PageHeader } from '../shared/PageHeader'
import { Package, X } from '../../lib/icons'
import { playClickSound, playPotionSound } from '../../lib/sounds'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { useNotificationStore } from '../../stores/notificationStore'
import { useFarmStore } from '../../stores/farmStore'
import { SEED_DEFS, formatGrowTime } from '../../lib/farming'
import { getFoodItemById } from '../../lib/cooking'
import { SLOT_LABEL, LootVisual, RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { CharacterCard } from '../character/CharacterCard'
import { MOTION } from '../../lib/motion'

type SlotEntry =
  | { id: string; kind: 'pending'; icon: string; image?: string; title: string; subtitle: string; quantity: number; rewardIds: string[]; chestType: ChestType }
  | { id: string; kind: 'chest'; icon: string; image?: string; title: string; subtitle: string; quantity: number; chestType: ChestType }
  | { id: string; kind: 'item'; icon: string; image?: string; title: string; subtitle: string; quantity: number; itemId: string; equipped: boolean }
  | { id: string; kind: 'seed'; icon: string; image?: string; title: string; subtitle: string; quantity: number; seedId: string }

// ─── Module-level constants (stable references, never recreated per render) ──

const RARITY_ORDER: Record<string, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 }

const SLOT_SORT_ORDER: Record<string, number> = {
  weapon: 0, head: 1, body: 2, legs: 3, ring: 4, consumable: 5, food: 6, plant: 7,
}

const FILTERS = [
  { id: 'all',       label: 'All',       icon: '🎒' },
  { id: 'weapons',   label: 'Weapons',   icon: '⚔️' },
  { id: 'combat',    label: 'Combat',    icon: '🛡️' },
  { id: 'xp',        label: 'XP',        icon: '📈' },
  { id: 'drops',     label: 'Drops',     icon: '🎁' },
  { id: 'potions',   label: 'Potions',   icon: '⚗️' },
  { id: 'food',      label: 'Food',      icon: '🍽️' },
  { id: 'resources', label: 'Resources', icon: '🪨' },
  { id: 'chests',    label: 'Bags',      icon: '📦' },
  { id: 'cosmetic',  label: 'Cosmetic',  icon: '✨' },
  { id: 'plants',    label: 'Plants',    icon: '🌿' },
  { id: 'seeds',     label: 'Seeds',     icon: '🌱' },
] as const

function getSlotRarity(slot: SlotEntry): string {
  if (slot.kind === 'item') return LOOT_ITEMS.find((x) => x.id === slot.itemId)?.rarity ?? 'common'
  if (slot.kind === 'chest' || slot.kind === 'pending') return CHEST_DEFS[slot.chestType].rarity
  if (slot.kind === 'seed') return SEED_DEFS.find((x) => x.id === slot.seedId)?.rarity ?? 'common'
  return 'common'
}

function slotMatchesFilter(slot: SlotEntry, fid: string): boolean {
  if (fid === 'all') return true
  if (fid === 'seeds') return slot.kind === 'seed'
  if (fid === 'chests') return slot.kind === 'chest' || slot.kind === 'pending'
  if (slot.kind !== 'item') return false
  const item = LOOT_ITEMS.find((x) => x.id === slot.itemId)
  if (!item) return false
  if (fid === 'food')     return item.slot === 'food'
  if (fid === 'weapons')  return item.slot === 'weapon'
  if (fid === 'combat')   return ['atk_boost', 'hp_boost', 'hp_regen_boost'].includes(item.perkType as string)
  if (fid === 'xp')       return ['xp_skill_boost', 'xp_global_boost', 'focus_boost'].includes(item.perkType as string)
  if (fid === 'drops')    return (item.perkType as string) === 'chest_drop_boost'
  if (fid === 'potions')   return item.slot === 'consumable'
  if (fid === 'resources') return item.slot === 'material'
  if (fid === 'cosmetic')  return ['cosmetic', 'status_title', 'streak_shield'].includes(item.perkType as string) && item.slot !== 'material'
  if (fid === 'plants')    return item.slot === 'plant'
  return true
}

export function InventoryPage({ onBack, onNavigateFarm }: { onBack: () => void; onNavigateFarm?: () => void }) {
  useAdminConfigStore((s) => s.rev) // re-render when admin config updates (item skins etc.)
  const items = useInventoryStore((s) => s.items)
  const chests = useInventoryStore((s) => s.chests)
  const pendingRewards = useInventoryStore((s) => s.pendingRewards)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const claimPendingReward = useInventoryStore((s) => s.claimPendingReward)
  const deletePendingReward = useInventoryStore((s) => s.deletePendingReward)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)
  const deleteChest = useInventoryStore((s) => s.deleteChest)
  const equipItem = useInventoryStore((s) => s.equipItem)
  const unequipSlot = useInventoryStore((s) => s.unequipSlot)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const consumePotion = useInventoryStore((s) => s.consumePotion)
  const inBattle = Boolean(useArenaStore((s) => s.activeBattle))
  const inRaid = Boolean(useRaidStore((s) => s.activeRaid?.status === 'active'))
  const farmSeeds = useFarmStore((s) => s.seeds)
  const seedCabinetUnlocked = useFarmStore((s) => s.seedCabinetUnlocked)
  const [sortBy, setSortByRaw] = useState<'rarity' | 'name' | 'slot'>(() => {
    try { return (localStorage.getItem('inv_sortBy') as 'rarity' | 'name' | 'slot') || 'rarity' } catch { return 'rarity' }
  })
  const [viewMode, setViewModeRaw] = useState<'list' | 'grid' | 'compact'>(() => {
    try { return (localStorage.getItem('inv_viewMode') as 'list' | 'grid' | 'compact') || 'grid' } catch { return 'grid' }
  })
  type FilterById = 'all' | 'combat' | 'weapons' | 'xp' | 'drops' | 'potions' | 'food' | 'resources' | 'chests' | 'cosmetic' | 'plants' | 'seeds'
  const [filterBy, setFilterByRaw] = useState<FilterById>(() => {
    try { return (localStorage.getItem('inv_filterBy') as FilterById) || 'all' } catch { return 'all' }
  })
  const setSortBy = (v: typeof sortBy) => { setSortByRaw(v); try { localStorage.setItem('inv_sortBy', v) } catch {} }
  const setViewMode = (v: typeof viewMode) => { setViewModeRaw(v); try { localStorage.setItem('inv_viewMode', v) } catch {} }
  const setFilterBy = (v: FilterById) => { setFilterByRaw(v); try { localStorage.setItem('inv_filterBy', v) } catch {} }
  const [searchQuery, setSearchQuery] = useState('')
  const [showCharacterCard, setShowCharacterCard] = useState(() => {
    try { return localStorage.getItem('inv_showCharCard') !== '0' } catch { return true }
  })
  const toggleCharacterCard = () => setShowCharacterCard((v) => {
    const next = !v
    try { localStorage.setItem('inv_showCharCard', next ? '1' : '0') } catch {}
    return next
  })
  const [inspectSlotId, setInspectSlotId] = useState<string | null>(null)
  const [listForSaleTarget, setListForSaleTarget] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slotId: string } | null>(null)
  const [openChestModal, setOpenChestModal] = useState<{ chestType: ChestType; itemId: string | null; seedZipTier: import('../../lib/farming').SeedZipTier | null; goldDropped: number; bonusMaterials: import('../../lib/loot').BonusMaterial[] } | null>(null)
  const [chestModalAnimSeed, setChestModalAnimSeed] = useState(0)
  const [chestChainMessage, setChestChainMessage] = useState<string | null>(null)
  const [bulkOpenModal, setBulkOpenModal] = useState<{ chestType: ChestType; result: BulkOpenResult } | null>(null)
  useEscapeHandler(() => setBulkOpenModal(null), bulkOpenModal !== null)

  const slots = useMemo<SlotEntry[]>(() => {
    const out: SlotEntry[] = []
    const pendingByChest = new Map<ChestType, { rewardIds: string[]; sources: Set<string> }>()
    for (const reward of pendingRewards.filter((r) => !r.claimed)) {
      const current = pendingByChest.get(reward.chestType) ?? { rewardIds: [], sources: new Set<string>() }
      current.rewardIds.push(reward.id)
      current.sources.add(reward.source)
      pendingByChest.set(reward.chestType, current)
    }
    for (const [chestType, grouped] of pendingByChest) {
      const chest = CHEST_DEFS[chestType]
      out.push({
        id: `pending:${chestType}`,
        kind: 'pending',
        icon: chest.icon,
        image: chest.image,
        title: chest.name,
        subtitle: `Inbox drops · ${grouped.sources.size > 1 ? 'mixed sources' : Array.from(grouped.sources)[0] ?? 'grind'}`,
        quantity: grouped.rewardIds.length,
        rewardIds: grouped.rewardIds,
        chestType,
      })
    }
    for (const chestType of Object.keys(CHEST_DEFS) as ChestType[]) {
      const qty = chests[chestType] ?? 0
      if (qty <= 0) continue
      const chest = CHEST_DEFS[chestType]
      out.push({
        id: `chest:${chestType}`,
        kind: 'chest',
        icon: chest.icon,
        image: chest.image,
        title: chest.name,
        subtitle: `${chest.rarity.toUpperCase()} bag`,
        quantity: qty,
        chestType,
      })
    }
    for (const item of LOOT_ITEMS) {
      const qty = items[item.id] ?? 0
      if (qty <= 0) continue
      out.push({
        id: `item:${item.id}`,
        kind: 'item',
        icon: item.icon,
        image: item.image,
        title: item.name,
        subtitle: getItemPerkDescription(item),
        quantity: qty,
        itemId: item.id,
        equipped: equippedBySlot[item.slot] === item.id,
      })
    }
    for (const seed of SEED_DEFS) {
      // Seeds from inventory (new flow) + seeds still in farmStore when cabinet not unlocked (backwards compat)
      const invQty = items[seed.id] ?? 0
      const farmQty = seedCabinetUnlocked ? 0 : (farmSeeds[seed.id] ?? 0)
      const qty = invQty + farmQty
      if (qty <= 0) continue
      out.push({
        id: `seed:${seed.id}`,
        kind: 'seed',
        icon: seed.icon,
        image: seed.image,
        title: seed.name + 's',
        subtitle: `${seed.rarity} · ${formatGrowTime(seed.growTimeSeconds)} · ${seed.yieldMin}–${seed.yieldMax} yield`,
        quantity: qty,
        seedId: seed.id,
      })
    }
    return out
  }, [pendingRewards, chests, items, equippedBySlot, farmSeeds, seedCabinetUnlocked])

  const filterCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = {}
    for (const f of FILTERS) {
      if (f.id === 'all') { counts[f.id] = slots.length; continue }
      counts[f.id] = slots.filter((s) => slotMatchesFilter(s, f.id)).length
    }
    return counts
  }, [slots])

  const sortedSlots = useMemo(() => {
    const kindOrder = (s: SlotEntry) => (s.kind === 'pending' ? 0 : s.kind === 'chest' ? 1 : 2)
    const q = searchQuery.trim().toLowerCase()
    return [...slots]
      .filter((s) => slotMatchesFilter(s, filterBy))
      .filter((s) => !q || s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q))
      .sort((a, b) => {
        const kd = kindOrder(a) - kindOrder(b)
        if (kd !== 0) return kd
        if (sortBy === 'rarity') return (RARITY_ORDER[getSlotRarity(b)] ?? 0) - (RARITY_ORDER[getSlotRarity(a)] ?? 0)
        if (sortBy === 'slot') {
          const aSlot = a.kind === 'item' ? (LOOT_ITEMS.find((x) => x.id === a.itemId)?.slot ?? '') : ''
          const bSlot = b.kind === 'item' ? (LOOT_ITEMS.find((x) => x.id === b.itemId)?.slot ?? '') : ''
          return (SLOT_SORT_ORDER[aSlot] ?? 99) - (SLOT_SORT_ORDER[bSlot] ?? 99)
        }
        return a.title.localeCompare(b.title)
      })
  }, [slots, sortBy, filterBy, searchQuery])

  const groupedSlots = useMemo(() => {
    if (filterBy !== 'all') return null
    const pending = sortedSlots.filter((s) => s.kind === 'pending')
    const bags = sortedSlots.filter((s) => s.kind === 'chest')
    const seeds = sortedSlots.filter((s) => s.kind === 'seed')
    const items = sortedSlots.filter((s) => s.kind === 'item')
    const gear = items.filter((s) => {
      const it = LOOT_ITEMS.find((x) => x.id === (s as Extract<SlotEntry, { kind: 'item' }>).itemId)
      return it && !['consumable', 'plant', 'material', 'food'].includes(it.slot)
    })
    const potions = items.filter((s) => {
      const it = LOOT_ITEMS.find((x) => x.id === (s as Extract<SlotEntry, { kind: 'item' }>).itemId)
      return it?.slot === 'consumable'
    })
    const food = items.filter((s) => {
      const it = LOOT_ITEMS.find((x) => x.id === (s as Extract<SlotEntry, { kind: 'item' }>).itemId)
      return it?.slot === 'food'
    })
    const plants = items.filter((s) => {
      const it = LOOT_ITEMS.find((x) => x.id === (s as Extract<SlotEntry, { kind: 'item' }>).itemId)
      return it?.slot === 'plant'
    })
    const materials = items.filter((s) => {
      const it = LOOT_ITEMS.find((x) => x.id === (s as Extract<SlotEntry, { kind: 'item' }>).itemId)
      return it?.slot === 'material'
    })
    const groups: { label: string; icon: string; slots: SlotEntry[] }[] = []
    if (pending.length > 0) groups.push({ label: 'Inbox', icon: '📥', slots: pending })
    if (bags.length > 0) groups.push({ label: 'Bags', icon: '📦', slots: bags })
    if (gear.length > 0) groups.push({ label: 'Gear', icon: '⚔️', slots: gear })
    if (potions.length > 0) groups.push({ label: 'Potions', icon: '⚗️', slots: potions })
    if (food.length > 0) groups.push({ label: 'Food', icon: '🍽️', slots: food })
    if (materials.length > 0) groups.push({ label: 'Materials', icon: '🪨', slots: materials })
    if (plants.length > 0) groups.push({ label: 'Plants', icon: '🌿', slots: plants })
    if (seeds.length > 0) groups.push({ label: 'Seeds', icon: '🌱', slots: seeds })
    return groups.length >= 2 ? groups : null
  }, [sortedSlots, filterBy])

  const inspectSlot = useMemo(
    () => slots.find((slot) => slot.id === inspectSlotId) ?? null,
    [slots, inspectSlotId],
  )
  const inspectItem = useMemo(
    () => (inspectSlot?.kind === 'item' ? (LOOT_ITEMS.find((x) => x.id === inspectSlot.itemId) ?? null) : null),
    [inspectSlot],
  )
  const inspectSeed = useMemo(
    () => (inspectSlot?.kind === 'seed' ? (SEED_DEFS.find((x) => x.id === inspectSlot.seedId) ?? null) : null),
    [inspectSlot],
  )
  const inspectRarity = useMemo(() => {
    if (inspectItem) return normalizeRarity(inspectItem.rarity)
    if (inspectSlot?.kind === 'chest' || inspectSlot?.kind === 'pending') {
      return normalizeRarity(CHEST_DEFS[inspectSlot.chestType].rarity)
    }
    if (inspectSeed) return normalizeRarity(inspectSeed.rarity)
    return 'common'
  }, [inspectItem, inspectSlot, inspectSeed])
  const inspectTheme = RARITY_THEME[inspectRarity]

  useEffect(() => {
    ensureInventoryHydrated()
  }, [])

  useEffect(() => {
    if (inspectSlotId && !slots.some((slot) => slot.id === inspectSlotId)) setInspectSlotId(null)
  }, [slots, inspectSlotId])

  useEffect(() => {
    if (!openChestModal) return
    const hasMore =
      pendingRewards.some((r) => !r.claimed && r.chestType === openChestModal.chestType) || (chests[openChestModal.chestType] ?? 0) > 0
    if (chestModalAnimSeed > 1 && !hasMore) {
      setChestChainMessage('Oops, your bags are over')
      return
    }
    setChestChainMessage(null)
  }, [openChestModal, chestModalAnimSeed, pendingRewards, chests])

  useEffect(() => {
    const closeContext = () => setContextMenu(null)
    window.addEventListener('click', closeContext)
    return () => window.removeEventListener('click', closeContext)
  }, [])

  const openChest = (chestType: ChestType) => {
    const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
    if (!result) return
    const seedZipTier = useFarmStore.getState().rollSeedDrop(chestType)
    setInspectSlotId(null)
    setContextMenu(null)
    setChestChainMessage(null)
    setChestModalAnimSeed((v) => v + 1)
    setOpenChestModal({ chestType, itemId: result.itemId, seedZipTier: seedZipTier ?? null, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
  }

  const isPotionMaxed = (itemId: string) => {
    if (itemId === 'atk_potion') return permanentStats.atk >= POTION_MAX
    if (itemId === 'hp_potion') return permanentStats.hp >= POTION_MAX
    if (itemId === 'regen_potion') return permanentStats.hpRegen >= POTION_MAX
    if (itemId === 'def_potion') return permanentStats.def >= POTION_MAX
    return false
  }

  const runPrimaryAction = (slot: SlotEntry) => {
    if (slot.kind === 'pending') {
      const rewardId = slot.rewardIds[0]
      if (!rewardId) return
      claimPendingReward(rewardId)
      return openChest(slot.chestType)
    }
    if (slot.kind === 'chest') return openChest(slot.chestType)
    if (slot.kind === 'item') {
      const item = LOOT_ITEMS.find((x) => x.id === slot.itemId)
      if (!item) return
      if (item.slot === 'plant' || item.slot === 'material') return
      if (item.slot === 'consumable') {
        if (isPotionMaxed(slot.itemId)) return
        const ok = consumePotion(slot.itemId)
        if (ok) playPotionSound()
        return
      }
      if (inBattle) {
        useNotificationStore.getState().push({ type: 'progression', icon: '⚔️', title: 'Combat active', body: 'Cannot change gear during a boss fight.' })
        return
      }
      if (inRaid) {
        useNotificationStore.getState().push({ type: 'progression', icon: '⚔️', title: 'Raid in progress', body: 'Gear is locked during an active raid.' })
        return
      }
      if (slot.equipped) return unequipSlot(item.slot)
      return equipItem(slot.itemId)
    }
  }

  const runDeleteAction = (slot: SlotEntry) => {
    if (slot.kind === 'pending') {
      const rewardId = slot.rewardIds[0]
      if (!rewardId) return
      return deletePendingReward(rewardId)
    }
    if (slot.kind === 'chest') return deleteChest(slot.chestType)
    if (slot.kind === 'item') return deleteItem(slot.itemId)
  }

  const getPrimaryActionLabel = (slot: SlotEntry) => {
    if (slot.kind === 'pending') return 'Open'
    if (slot.kind === 'chest') return 'Open'
    if (slot.kind === 'item') {
      const item = LOOT_ITEMS.find((x) => x.id === slot.itemId)
      if (item?.slot === 'plant' || item?.slot === 'material' || item?.slot === 'food') return '—'
      if (item?.slot === 'consumable') return isPotionMaxed(slot.itemId) ? 'Maxed' : 'Drink'
      if (inBattle) return '⚔ Locked'
      return slot.equipped ? 'Unequip' : 'Equip'
    }
    return 'Open'
  }

  const hasNextChestToOpen = (chestType: ChestType) =>
    pendingRewards.some((r) => !r.claimed && r.chestType === chestType) || (chests[chestType] ?? 0) > 0

  const getRemainingChestCount = (chestType: ChestType) =>
    pendingRewards.filter((r) => !r.claimed && r.chestType === chestType).length + (chests[chestType] ?? 0)

  const openNextChest = (chestType: ChestType) => {
    setChestChainMessage(null)
    const pending = pendingRewards.find((r) => !r.claimed && r.chestType === chestType)
    if (pending) claimPendingReward(pending.id)
    else if ((chests[chestType] ?? 0) <= 0) return false
    const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
    if (!result) return false
    const seedZipTier = useFarmStore.getState().rollSeedDrop(chestType)
    setChestModalAnimSeed((v) => v + 1)
    setOpenChestModal({ chestType, itemId: result.itemId, seedZipTier: seedZipTier ?? null, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
    return true
  }

  const openAllChests = (chestType: ChestType) => {
    // Count total available: pending rewards + chest count
    const pendingCount = pendingRewards.filter((r) => !r.claimed && r.chestType === chestType).length
    const chestCount = chests[chestType] ?? 0
    const total = pendingCount + chestCount
    if (total <= 0) return

    const itemMap = new Map<string, number>()
    const matMap = new Map<string, number>()
    const seedZipMap = new Map<string, number>()
    let totalGold = 0

    for (let i = 0; i < total; i++) {
      // Claim pending reward first if available
      const pending = useInventoryStore.getState().pendingRewards.find((r) => !r.claimed && r.chestType === chestType)
      if (pending) claimPendingReward(pending.id)
      else if ((useInventoryStore.getState().chests[chestType] ?? 0) <= 0) break

      const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
      if (!result) break

      if (result.itemId) itemMap.set(result.itemId, (itemMap.get(result.itemId) ?? 0) + 1)
      totalGold += result.goldDropped
      for (const mat of result.bonusMaterials) {
        matMap.set(mat.itemId, (matMap.get(mat.itemId) ?? 0) + mat.qty)
      }
      const seedZipTier = useFarmStore.getState().rollSeedDrop(chestType)
      if (seedZipTier) seedZipMap.set(seedZipTier, (seedZipMap.get(seedZipTier) ?? 0) + 1)
    }

    const items = Array.from(itemMap.entries()).map(([id, qty]) => ({
      def: LOOT_ITEMS.find((x) => x.id === id)!,
      qty,
    })).filter((x) => x.def)

    const materials = Array.from(matMap.entries()).map(([id, qty]) => ({
      def: LOOT_ITEMS.find((x) => x.id === id)!,
      qty,
    })).filter((x) => x.def)

    const seedZips = Array.from(seedZipMap.entries()).map(([tier, qty]) => ({
      tier: tier as import('../../lib/farming').SeedZipTier,
      qty,
    }))

    setInspectSlotId(null)
    setContextMenu(null)
    setBulkOpenModal({
      chestType,
      result: { items, totalGold, materials, seedZips, totalOpened: total },
    })

    // Immediately push opened state to Supabase with merge:false so the
    // periodic background sync (merge:true / Math.max) doesn't restore old counts
    const user = useAuthStore.getState().user
    if (supabase && user) {
      const { items: invItems, chests: invChests } = useInventoryStore.getState()
      const { seeds, seedZips: sz } = useFarmStore.getState()
      syncInventoryToSupabase(invItems, invChests, { merge: false, seeds, seedZips: sz }).catch(() => {})
    }
  }

  return (
    <motion.div
      initial={MOTION.subPage.initial}
      animate={MOTION.subPage.animate}
      exit={MOTION.subPage.exit}
      transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
      className="p-4 pb-20 space-y-3"
    >
      <PageHeader title="Inventory" icon={<Package className="w-4 h-4 text-gray-400" />} onBack={onBack} />

      {/* Character Card — collapsible */}
      <div>
        <button
          type="button"
          onClick={toggleCharacterCard}
          className="w-full flex items-center justify-between px-1 mb-1 text-micro font-mono uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors group"
        >
          <span>Character</span>
          <span className="text-gray-700 group-hover:text-gray-500 transition-colors">{showCharacterCard ? '▲ hide' : '▼ show'}</span>
        </button>
        {showCharacterCard && (
          <CharacterCard
            locked={inBattle}
            onSlotInspect={(itemId) => setInspectSlotId(`item:${itemId}`)}
          />
        )}
      </div>

      <div className="rounded-card border border-white/[0.08] bg-surface-2/80 p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption uppercase tracking-widest text-gray-400 font-mono font-semibold shrink-0">
            Inventory
            <span className="ml-1.5 text-gray-500 normal-case tracking-normal font-normal">
              {sortedSlots.length}{sortedSlots.length !== slots.length ? `\u00a0/\u00a0${slots.length}` : ''}
            </span>
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {/* View mode segmented control */}
            <div className="flex items-center rounded border border-white/[0.09] overflow-hidden">
              {(['list', 'grid', 'compact'] as const).map((mode, i) => {
                const labels = ['≡ List', '⊞ Grid', '⊟ Mini'] as const
                const active = viewMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`text-micro font-mono px-1.5 py-0.5 transition-colors ${i > 0 ? 'border-l border-white/[0.07]' : ''} ${
                      active ? 'text-accent bg-accent/10' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {labels[i]}
                  </button>
                )
              })}
            </div>
            {/* Sort cycle button */}
            <button
              type="button"
              onClick={() => setSortBy(sortBy === 'rarity' ? 'name' : sortBy === 'name' ? 'slot' : 'rarity')}
              className="text-micro font-mono px-2 py-0.5 rounded border border-white/[0.07] text-gray-500 hover:text-gray-300 hover:border-white/15 transition-colors"
            >
              {sortBy === 'rarity' ? '▼ Rarity' : sortBy === 'name' ? '▼ A–Z' : '▼ Slot'}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="w-full text-micro font-mono px-2.5 py-1.5 pl-7 rounded border border-white/[0.08] bg-surface-0/40 text-gray-200 placeholder-gray-500 outline-none focus:border-accent/40 focus:bg-surface-0/60 transition-colors"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-micro text-gray-500 pointer-events-none">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-micro text-gray-500 hover:text-gray-300 px-1"
            ><X className="w-3 h-3" /></button>
          )}
        </div>

        {/* Filter pills — horizontal scroll */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
          {FILTERS.map((f) => {
            const active = filterBy === f.id
            const count = filterCounts[f.id] ?? 0
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => { playClickSound(); setFilterBy(f.id) }}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md border text-micro font-medium transition-all ${
                  active
                    ? 'border-accent/50 bg-accent/20 text-accent'
                    : 'border-white/[0.08] bg-surface-0/30 text-gray-400 hover:text-gray-200 hover:border-white/20'
                }`}
              >
                <span className="text-micro leading-none">{f.icon}</span>
                <span>{f.label}</span>
                {!active && count > 0 && (
                  <span className="ml-0.5 text-micro font-mono opacity-50">{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.05]" />

        {/* Items */}
        <div>
        {slots.length === 0 ? (
          <p className="text-caption text-gray-500 py-2">No loot yet.</p>
        ) : sortedSlots.length === 0 ? (
          <p className="text-caption text-gray-500 py-2">Nothing here.</p>
        ) : (() => {
          const renderCard = (slot: SlotEntry) => {
            const slotRarity = getSlotRarity(slot)
            const slotTheme = RARITY_THEME[normalizeRarity(slotRarity)]
            const isEquipped = slot.kind === 'item' && slot.equipped
            const isPending = slot.kind === 'pending'
            const slotImage = slot.image
            const lootItem = slot.kind === 'item' ? LOOT_ITEMS.find((x) => x.id === slot.itemId) : null
            const perkChip = lootItem && lootItem.perkType !== 'cosmetic' && lootItem.slot !== 'consumable' && lootItem.slot !== 'plant'
              ? getItemPerkDescription(lootItem)
              : null
            const rarityNorm = normalizeRarity(slotRarity)
            const typeLabel = slot.kind === 'seed' ? 'SEED'
              : slot.kind === 'chest' || slot.kind === 'pending'
              ? (isPending ? 'INBOX' : 'BAG')
              : lootItem?.slot === 'consumable' ? 'POTION'
              : lootItem?.slot === 'plant' ? 'PLANT'
              : lootItem ? SLOT_LABEL[lootItem.slot]
              : '?'
            const onClickCard = () => { playClickSound(); setInspectSlotId(slot.id); setContextMenu(null) }
            const onRightClick = (e: React.MouseEvent) => {
              e.preventDefault()
              setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 216), y: Math.min(e.clientY, window.innerHeight - 270), slotId: slot.id })
            }

            if (viewMode === 'list') {
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={onClickCard}
                  onContextMenu={onRightClick}
                  className="relative w-full flex items-center gap-2 px-2 py-1.5 rounded border border-white/[0.06] bg-surface-0/50 hover:bg-surface-0/80 active:scale-[0.99] transition-all text-left"
                >
                  {isPending && <span className="absolute inset-0 rounded pointer-events-none animate-pulse border border-amber-400/30" />}
                  {/* Left rarity accent */}
                  <div className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: slotTheme.color }} />
                  {/* Icon */}
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ background: '#0a0a14', border: `1px solid ${slotTheme.color}30` }}>
                    <LootVisual icon={slot.icon} image={slotImage} className="w-5 h-5 object-contain" scale={lootItem?.renderScale ?? 1} />
                    {isEquipped && <span className="absolute bottom-0 right-0 text-[5px] font-bold font-mono px-0.5 rounded-tl leading-tight" style={{ background: slotTheme.color, color: '#000' }}>EQ</span>}
                  </div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-semibold text-gray-100 truncate">{slot.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-micro font-mono uppercase" style={{ color: slotTheme.color }}>{rarityNorm}</span>
                      {perkChip && <span className="text-micro text-gray-500 truncate">· {perkChip}</span>}
                    </div>
                  </div>
                  {/* Right */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {slot.quantity > 1 && <span className="text-micro font-mono font-semibold" style={{ color: slotTheme.color }}>×{slot.quantity}</span>}
                  </div>
                </button>
              )
            }

            if (viewMode === 'compact') {
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={onClickCard}
                  onContextMenu={onRightClick}
                  className="relative flex flex-col items-center p-1 rounded border border-white/[0.06] bg-surface-0/50 hover:bg-surface-0/80 active:scale-[0.97] transition-all overflow-hidden"
                >
                  {isPending && <span className="absolute inset-0 rounded pointer-events-none animate-pulse border border-amber-400/30" />}
                  {slot.quantity > 1 && (
                    <span className="absolute top-0.5 right-1 text-micro font-bold font-mono leading-none z-10" style={{ color: slotTheme.color }}>
                      {slot.quantity}
                    </span>
                  )}
                  <div className="w-9 h-9 rounded flex items-center justify-center overflow-hidden relative mt-0.5" style={{ background: '#0a0a14', border: `1px solid ${slotTheme.color}25` }}>
                    <LootVisual icon={slot.icon} image={slotImage} className="w-6 h-6 object-contain" scale={lootItem?.renderScale ?? 1} />
                    {isEquipped && <span className="absolute bottom-0 right-0 text-[5px] font-bold font-mono px-0.5 rounded-tl leading-tight" style={{ background: slotTheme.color, color: '#000' }}>EQ</span>}
                  </div>
                  <p className="text-micro font-medium text-gray-200 leading-tight w-full truncate text-center mt-1 mb-0.5">{slot.title}</p>
                  {/* Bottom rarity bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: slotTheme.color, opacity: rarityNorm === 'common' ? 0.4 : 0.8 }} />
                </button>
              )
            }

            // grid (2-col) mode
            return (
              <button
                key={slot.id}
                type="button"
                onClick={onClickCard}
                onContextMenu={onRightClick}
                className="relative flex items-center gap-2 p-2 rounded border border-white/[0.06] bg-surface-0/50 hover:bg-surface-0/80 active:scale-[0.98] transition-all text-left overflow-hidden"
              >
                {isPending && (
                  <span className="absolute inset-0 rounded pointer-events-none animate-pulse border border-amber-400/30" />
                )}
                {/* Icon box */}
                <div
                  className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                  style={{ background: '#0a0a14', border: `1px solid ${slotTheme.color}30` }}
                >
                  <LootVisual icon={slot.icon} image={slotImage} className="w-6 h-6 object-contain" scale={lootItem?.renderScale ?? 1} />
                  {isEquipped && (
                    <span className="absolute bottom-0 right-0 text-[6px] font-bold font-mono px-0.5 rounded-tl leading-tight" style={{ background: slotTheme.color, color: '#000' }}>EQ</span>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-micro font-semibold text-gray-100 leading-tight truncate">{slot.title}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-micro font-mono uppercase" style={{ color: slotTheme.color }}>{rarityNorm}</span>
                    {typeLabel && <span className="text-[7px] text-gray-600">·</span>}
                    {typeLabel && <span className="text-[7px] font-mono text-gray-500 uppercase">{typeLabel}</span>}
                  </div>
                  {perkChip && (
                    <p className="text-micro text-gray-500 truncate mt-0.5">{perkChip}</p>
                  )}
                </div>
                {/* Qty */}
                {slot.quantity > 1 && (
                  <span className="text-micro font-mono font-bold flex-shrink-0" style={{ color: slotTheme.color }}>×{slot.quantity}</span>
                )}
                {/* Left rarity accent */}
                <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full" style={{ background: slotTheme.color, opacity: rarityNorm === 'common' ? 0.3 : 0.7 }} />
              </button>
            )
          }

          const gridClass = viewMode === 'list' ? 'flex flex-col gap-0.5' : viewMode === 'compact' ? 'grid grid-cols-5 gap-1' : 'grid grid-cols-3 gap-1'
          const sectionHdrClass = `${viewMode !== 'list' ? 'col-span-full' : ''} text-micro font-mono uppercase tracking-widest text-gray-500 pt-1 pb-0.5 flex items-center gap-2`

          if (groupedSlots) {
            return (
              <div className={gridClass}>
                {groupedSlots.map(({ label, icon, slots: grpSlots }) => (
                  <React.Fragment key={label}>
                    <div className={sectionHdrClass}>
                      <span className="flex items-center gap-1.5">
                        {icon === '📥' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />}
                        {icon} {label}
                      </span>
                      <div className="flex-1 border-t border-white/[0.05]" />
                      <span>{grpSlots.length}</span>
                    </div>
                    {grpSlots.map(renderCard)}
                  </React.Fragment>
                ))}
              </div>
            )
          }

          return <div className={gridClass}>{sortedSlots.map(renderCard)}</div>
        })()}
        </div>
      </div>

      {inspectSlot &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[201] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => { setInspectSlotId(null) }}
            >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 6 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="w-full max-w-[480px] rounded border overflow-hidden relative flex"
              style={{
                borderColor: inspectTheme.border,
                background: 'rgba(8,8,16,0.98)',
                boxShadow: `0 0 40px ${inspectTheme.glow}55, 0 8px 32px rgba(0,0,0,0.7)`,
                minHeight: 220,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* LEFT — item art panel, full height */}
              <div
                className="relative flex-shrink-0 flex flex-col items-center justify-center"
                style={{
                  width: 130,
                  background: `radial-gradient(ellipse at 50% 44%, ${inspectTheme.glow}50 0%, ${inspectTheme.glow}18 42%, rgba(5,5,12,0.97) 75%)`,
                  borderRight: `1px solid ${inspectTheme.border}66`,
                }}
              >
                {/* Animated glow orb */}
                <motion.div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 45%, ${inspectTheme.glow}30 0%, transparent 65%)` }}
                  animate={{ opacity: [0.5, 0.85, 0.5] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* Large item visual */}
                <div className="relative z-10 flex items-center justify-center" style={{ width: 80, height: 80 }}>
                  <LootVisual
                    icon={inspectSlot.icon}
                    image={inspectSlot.image}
                    className="w-full h-full object-contain drop-shadow-lg"
                    scale={(inspectItem?.renderScale ?? 1) * 1.3}
                  />
                </div>
                {/* Rarity label */}
                <div className="relative z-10 mt-3 px-2.5 py-0.5 rounded-full border text-micro font-mono font-bold uppercase tracking-widest"
                  style={{ color: inspectTheme.color, borderColor: `${inspectTheme.border}99`, background: `${inspectTheme.color}18` }}>
                  {inspectRarity}
                </div>
                {/* Qty badge */}
                {inspectSlot.quantity > 1 && (
                  <div className="relative z-10 mt-1.5 text-micro font-mono" style={{ color: `${inspectTheme.color}99` }}>
                    ×{inspectSlot.quantity}
                  </div>
                )}
              </div>

              {/* RIGHT — item details panel */}
              <div className="flex-1 min-w-0 flex flex-col p-3.5 gap-0">
                {/* Close button */}
                <button
                  type="button"
                  onClick={() => setInspectSlotId(null)}
                  className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors text-sm leading-none z-20"
                >×</button>

                {/* Name + slot pill */}
                <div className="pr-6">
                  <p className="text-sm font-bold text-white leading-tight">{inspectSlot.title}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {inspectItem && (
                      <span className="text-micro px-1.5 py-0.5 rounded border border-white/15 text-gray-400 font-mono uppercase tracking-wide">
                        {SLOT_LABEL[inspectItem.slot]}
                      </span>
                    )}
                    {(inspectSlot.kind === 'chest' || inspectSlot.kind === 'pending') && (
                      <span className="text-micro px-1.5 py-0.5 rounded border border-white/15 text-gray-400 font-mono uppercase tracking-wide">
                        {inspectSlot.kind === 'pending' ? 'Inbox' : 'Bag'}
                      </span>
                    )}
                    {inspectSlot.kind === 'item' && inspectSlot.equipped && (
                      <span className="text-micro px-1.5 py-0.5 rounded border border-accent/50 text-accent font-mono tracking-wide"
                        style={{ background: 'rgba(88,101,242,0.07)' }}>
                        equipped
                      </span>
                    )}
                  </div>
                </div>

                {/* Flavor description */}
                {inspectItem?.description && (
                  <p className="text-micro text-gray-400 italic mt-1.5 leading-snug">{inspectItem.description}</p>
                )}

                {/* Perk stats — prominent */}
                {inspectItem && (() => {
                  const ip = getItemPower(inspectItem)
                  const baseWt = ITEM_POWER_BY_RARITY[inspectItem.rarity] ?? 100
                  const isPlant = inspectItem.slot === 'plant'
                  const isPotion = (POTION_IDS as readonly string[]).includes(inspectItem.id)
                  const rate = !isPotion && !isPlant ? estimateLootDropRate(inspectItem.id, { source: 'skill_grind', focusCategory: 'coding' }) : null
                  const consumed = isPotion
                    ? inspectItem.id === 'atk_potion' ? permanentStats.atk
                      : inspectItem.id === 'hp_potion' ? permanentStats.hp
                      : inspectItem.id === 'def_potion' ? (permanentStats.def ?? 0)
                      : permanentStats.hpRegen
                    : 0

                  type PerkDisplay = { value: string; unit: string; desc: string; color: string }
                  const perkDisplays: PerkDisplay[] = getItemPerks(inspectItem).flatMap((p): PerkDisplay[] => {
                    const v = typeof p.perkValue === 'number' ? p.perkValue : parseFloat(String(p.perkValue)) || 0
                    const pct = (n: number) => `+${Math.round((n - 1) * 100)}%`
                    switch (p.perkType) {
                      case 'atk_boost':        return [{ value: `+${v}`, unit: 'ATK/s',   desc: 'Attack',                color: '#f87171' }]
                      case 'hp_boost':         return [{ value: `+${v}`, unit: 'HP',      desc: 'Max health',            color: '#4ade80' }]
                      case 'hp_regen_boost':   return [{ value: `+${v}`, unit: 'HP/s',    desc: 'Health regen',          color: '#22d3ee' }]
                      case 'xp_skill_boost':   return [{ value: pct(v),  unit: 'XP',      desc: p.perkTarget ?? 'Skill', color: '#a78bfa' }]
                      case 'xp_global_boost':  return [{ value: pct(v),  unit: 'XP',      desc: 'All skills',            color: '#a78bfa' }]
                      case 'chest_drop_boost': return [{ value: `+${Math.round(v * 100)}%`, unit: 'Drop', desc: p.perkTarget ?? 'Chests', color: '#fbbf24' }]
                      case 'focus_boost':      return [{ value: pct(v),  unit: 'Focus',   desc: 'Focus sessions',        color: '#38bdf8' }]
                      case 'def_boost':        return [{ value: `+${v}`, unit: 'DEF',     desc: 'Defense',               color: '#a3a3a3' }]
                      case 'streak_shield':    return [{ value: '1×',    unit: 'Shield',  desc: 'Streak protect',        color: '#f97316' }]
                      case 'status_title':     return [{ value: '✦',     unit: String(p.perkValue || 'Title'), desc: 'Status title', color: inspectTheme.color }]
                      default: return []
                    }
                  })

                  return (
                    <div className="mt-2.5 space-y-2">
                      {perkDisplays.length > 0 && (
                        <div className={`grid gap-1.5 ${perkDisplays.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                          {perkDisplays.map((pd, i) => (
                            <div key={i} className="rounded px-2.5 py-2 border flex flex-col gap-0.5"
                              style={{ borderColor: `${pd.color}35`, background: `${pd.color}0e` }}>
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-bold font-mono tabular-nums leading-none"
                                  style={{ fontSize: perkDisplays.length === 1 ? 22 : 18, color: pd.color, textShadow: `0 0 14px ${pd.color}55` }}>
                                  {pd.value}
                                </span>
                                <span className="text-micro font-mono font-semibold" style={{ color: `${pd.color}cc` }}>{pd.unit}</span>
                              </div>
                              <span className="text-micro text-gray-400 capitalize leading-none">{pd.desc}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {isPlant && <p className="text-micro text-lime-400/80 font-mono">🌾 Farm harvest · sell on Marketplace</p>}
                      {inspectItem.slot === 'food' && (() => {
                        const foodDef = getFoodItemById(inspectItem.id)
                        if (!foodDef) return null
                        const fx = foodDef.effect
                        const stats: { value: string; unit: string; desc: string; color: string }[] = []
                        if (fx.heal) stats.push({ value: `+${fx.heal}`, unit: 'HP', desc: 'Heal', color: '#4ade80' })
                        if (fx.buffAtk) stats.push({ value: `+${fx.buffAtk}`, unit: 'ATK', desc: 'Attack buff', color: '#f87171' })
                        if (fx.buffDef) stats.push({ value: `+${fx.buffDef}`, unit: 'DEF', desc: 'Defense buff', color: '#a3a3a3' })
                        if (fx.buffRegen) stats.push({ value: `+${fx.buffRegen}`, unit: 'HP/s', desc: 'Regen buff', color: '#22d3ee' })
                        if (fx.buffDurationSec) stats.push({ value: `${fx.buffDurationSec}s`, unit: '', desc: 'Buff duration', color: '#fbbf24' })
                        return (
                          <div className={`grid gap-1.5 ${stats.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {stats.map((s, i) => (
                              <div key={i} className="rounded px-2.5 py-2 border flex flex-col gap-0.5"
                                style={{ borderColor: `${s.color}35`, background: `${s.color}0e` }}>
                                <div className="flex items-baseline gap-1">
                                  <span className="font-bold font-mono tabular-nums leading-none" style={{ fontSize: stats.length <= 2 ? 18 : 14, color: s.color, textShadow: `0 0 14px ${s.color}55` }}>{s.value}</span>
                                  {s.unit && <span className="text-micro font-mono font-semibold" style={{ color: `${s.color}cc` }}>{s.unit}</span>}
                                </div>
                                <span className="text-micro text-gray-400 capitalize leading-none">{s.desc}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                      {inspectItem.perkType === 'cosmetic' && inspectItem.slot !== 'food' && <p className="text-micro text-gray-400">Visual cosmetic — no gameplay effect.</p>}

                      {isPotion && (
                        <div>
                          <div className="flex items-center justify-between text-micro font-mono mb-1">
                            <span className="text-gray-500">Consumed</span>
                            <span className={consumed >= POTION_MAX ? 'text-amber-400' : 'text-gray-400'}>
                              {consumed}/{POTION_MAX}{consumed >= POTION_MAX ? ' · MAXED' : ''}
                            </span>
                          </div>
                          <div className="h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (consumed / POTION_MAX) * 100)}%`, background: consumed >= POTION_MAX ? '#f59e0b' : inspectTheme.color }} />
                          </div>
                        </div>
                      )}

                      {(['head', 'body', 'legs', 'ring', 'weapon'] as const).includes(inspectItem.slot as never) && (
                        <div className="flex items-center gap-2 text-micro font-mono pt-0.5 border-t border-white/[0.05]">
                          <span className="text-gray-500">IP</span>
                          <span style={{ color: inspectTheme.color }}>{ip}</span>
                          <span className="text-white/20">·</span>
                          <span className="text-gray-500">Wt</span>
                          <span className="text-gray-300">{baseWt}</span>
                          {rate !== null && <>
                            <span className="text-white/20">·</span>
                            <span className="text-gray-500">~{rate}% drop</span>
                          </>}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Seed stats */}
                {inspectSeed && (
                  <div className="mt-2.5 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded px-2.5 py-2 border flex flex-col gap-0.5" style={{ borderColor: `${inspectTheme.color}35`, background: `${inspectTheme.color}0e` }}>
                        <span className="text-caption font-mono font-bold" style={{ color: inspectTheme.color }}>{formatGrowTime(inspectSeed.growTimeSeconds)}</span>
                        <span className="text-micro text-gray-400">Grow time</span>
                      </div>
                      <div className="rounded px-2.5 py-2 border flex flex-col gap-0.5" style={{ borderColor: `${inspectTheme.color}35`, background: `${inspectTheme.color}0e` }}>
                        <span className="text-caption font-mono font-bold" style={{ color: inspectTheme.color }}>{inspectSeed.yieldMin}–{inspectSeed.yieldMax}</span>
                        <span className="text-micro text-gray-400">Yield</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chest / pending description */}
                <div className="mt-2 flex-1">
                  {inspectSlot.kind === 'chest' && (
                    <p className="text-micro text-gray-400">Open to roll a random item from this bag's loot pool.</p>
                  )}
                  {inspectSlot.kind === 'pending' && (
                    <p className="text-micro text-gray-400">Activity drop waiting in inbox. Claim to open.</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="mt-3 flex gap-1.5">
                  {inspectSlot.kind === 'seed' && inspectSeed ? (
                    <button
                      type="button"
                      onClick={() => { playClickSound(); setInspectSlotId(null); onNavigateFarm?.() }}
                      className="flex-1 text-micro py-1.5 rounded border font-semibold transition-all active:scale-[0.97] hover:brightness-110"
                      style={{ color: inspectTheme.color, borderColor: inspectTheme.border, backgroundColor: `${inspectTheme.color}1e` }}
                    >
                      Plant
                    </button>
                  ) : (
                    <>
                      {(() => {
                        const itemSlot = inspectSlot.kind === 'item' ? LOOT_ITEMS.find((x) => x.id === inspectSlot.itemId)?.slot : undefined
                        const isPlant = itemSlot === 'plant'
                        const isFood = itemSlot === 'food'
                        const isMaterial = itemSlot === 'material'
                        const isConsumable = itemSlot === 'consumable'
                        const isMaxed = isConsumable && isPotionMaxed(inspectSlot.kind === 'item' ? inspectSlot.itemId : '')
                        const isGearLocked = inBattle && inspectSlot.kind === 'item' && !isConsumable
                        const disabled = isMaxed
                        if (isPlant || isFood || isMaterial) return null
                        return (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => { playClickSound(); runPrimaryAction(inspectSlot) }}
                            className={`flex-1 text-micro py-1.5 rounded border font-semibold transition-all active:scale-[0.97] ${
                              disabled || isGearLocked ? 'border-white/[0.08] text-gray-600 cursor-not-allowed bg-transparent' : 'hover:brightness-110'
                            }`}
                            style={disabled || isGearLocked ? undefined : { color: inspectTheme.color, borderColor: inspectTheme.border, backgroundColor: `${inspectTheme.color}1e` }}
                          >
                            {getPrimaryActionLabel(inspectSlot)}
                          </button>
                        )
                      })()}
                      {inspectSlot.kind === 'item' && !MARKETPLACE_BLOCKED_ITEMS.includes(inspectSlot.itemId) && (!inspectSlot.equipped || inspectSlot.quantity > 1) && (
                        <button
                          type="button"
                          onClick={() => { playClickSound(); setListForSaleTarget(inspectSlot.itemId); setInspectSlotId(null) }}
                          className="flex-1 text-micro py-1.5 rounded border border-amber-500/35 text-amber-300 hover:bg-amber-500/12 font-semibold transition-all active:scale-[0.97]"
                        >
                          Sell{inspectSlot.equipped ? ` (${inspectSlot.quantity - 1})` : ''}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { playClickSound(); runDeleteAction(inspectSlot) }}
                        className="w-8 h-full flex items-center justify-center rounded border border-red-400/25 text-red-400/70 hover:text-red-300 hover:bg-red-400/10 transition-all active:scale-[0.97] text-xs"
                        title="Delete"
                      >🗑</button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
          </AnimatePresence>,
          document.body
        )}

      <AnimatePresence>
        {contextMenu && (() => {
          const slot = slots.find((x) => x.id === contextMenu.slotId)
          if (!slot) return null
          const ctxRarity = getSlotRarity(slot)
          const ctxTheme = RARITY_THEME[normalizeRarity(ctxRarity)]
          const ctxLootItem = slot.kind === 'item' ? LOOT_ITEMS.find((x) => x.id === slot.itemId) : null
          const ctxItemSlot = ctxLootItem?.slot
          const isPlant = ctxItemSlot === 'plant'
          const isFood = ctxItemSlot === 'food'
          const isMaterial = ctxItemSlot === 'material'
          const isConsumable = ctxItemSlot === 'consumable'
          const isMaxed = isConsumable && isPotionMaxed(slot.kind === 'item' ? slot.itemId : '')
          const isGearLocked = inBattle && slot.kind === 'item' && !isConsumable
          const isSeed = slot.kind === 'seed'
          const isChest = slot.kind === 'chest' || slot.kind === 'pending'
          const canSell = slot.kind === 'item' && !MARKETPLACE_BLOCKED_ITEMS.includes(slot.itemId) && (!slot.equipped || slot.quantity > 1)
          const chestTotal = isChest
            ? pendingRewards.filter((r) => !r.claimed && r.chestType === slot.chestType).length + (chests[slot.chestType] ?? 0)
            : 0

          const primaryLabel = getPrimaryActionLabel(slot)
          const showPrimary = !isPlant && !isFood && !isMaterial && !isSeed

          return (
            <motion.div
              key={contextMenu.slotId}
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="fixed z-[205] w-[200px] rounded-md overflow-hidden"
              style={{
                left: Math.min(contextMenu.x, window.innerWidth - 216),
                top: Math.min(contextMenu.y, window.innerHeight - 270),
                background: 'linear-gradient(160deg, #0d0d1c 0%, #10101e 100%)',
                border: `1px solid ${ctxTheme.color}30`,
                boxShadow: `0 0 28px ${ctxTheme.color}14, 0 12px 40px rgba(0,0,0,0.75)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Item header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: `1px solid ${ctxTheme.color}18` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: '#0a0a14', border: `1px solid ${ctxTheme.color}35` }}>
                  <LootVisual icon={slot.icon} image={slot.image} className="w-5 h-5 object-contain" scale={ctxLootItem?.renderScale ?? 1} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-semibold text-white leading-tight truncate">{slot.title}</p>
                  <p className="text-micro font-mono uppercase tracking-wide" style={{ color: `${ctxTheme.color}cc` }}>
                    {normalizeRarity(ctxRarity)}{ctxLootItem ? ` · ${SLOT_LABEL[ctxLootItem.slot] ?? ctxLootItem.slot}` : ''}
                    {slot.quantity > 1 ? ` · ×${slot.quantity}` : ''}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                {isSeed && (
                  <button type="button"
                    onClick={() => { playClickSound(); setContextMenu(null); onNavigateFarm?.() }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-caption font-medium text-accent hover:bg-accent/10 transition-colors">
                    Plant seed
                  </button>
                )}
                {showPrimary && (
                  <button type="button"
                    disabled={isMaxed || isGearLocked}
                    onClick={() => { playClickSound(); runPrimaryAction(slot); if (!isGearLocked) setContextMenu(null) }}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 text-caption font-medium transition-colors ${
                      isMaxed || isGearLocked ? 'text-gray-600 cursor-not-allowed' : 'text-accent hover:bg-accent/10'
                    }`}>
                    {primaryLabel}
                  </button>
                )}
                {isChest && chestTotal >= 2 && (
                  <button type="button"
                    onClick={() => { playClickSound(); setContextMenu(null); openAllChests(slot.chestType) }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-caption font-medium text-purple-300 hover:bg-purple-400/10 transition-colors">
                    Open all ({chestTotal})
                  </button>
                )}
                {canSell && (
                  <button type="button"
                    onClick={() => { playClickSound(); setListForSaleTarget(slot.itemId); setContextMenu(null) }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-caption font-medium text-amber-300 hover:bg-amber-500/10 transition-colors">
                    List for sale{slot.equipped ? ` (${slot.quantity - 1})` : ''}
                  </button>
                )}
              </div>

              {/* Delete — separated */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="py-1">
                <button type="button"
                  onClick={() => { playClickSound(); runDeleteAction(slot); setContextMenu(null) }}
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-caption font-medium text-red-400/70 hover:text-red-300 hover:bg-red-400/8 transition-colors">
                  Delete
                </button>
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {listForSaleTarget && (
          <ListForSaleModal
            itemId={listForSaleTarget}
            maxQty={(() => {
              const { items: inv, equippedBySlot: eq } = useInventoryStore.getState()
              const total = inv[listForSaleTarget] ?? 0
              const loot = LOOT_ITEMS.find((x) => x.id === listForSaleTarget)
              const isEquipped = loot && eq[loot.slot] === listForSaleTarget
              return isEquipped ? total - 1 : total
            })()}
            onClose={() => setListForSaleTarget(null)}
            onListed={async () => {
              const { items, chests } = useInventoryStore.getState()
              const { seeds, seedZips } = useFarmStore.getState()
              await syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips }).catch(() => {})
              setListForSaleTarget(null)
            }}
          />
        )}
      </AnimatePresence>

      <ChestOpenModal
        open={Boolean(openChestModal)}
        chestType={openChestModal?.chestType ?? null}
        item={openChestModal ? (LOOT_ITEMS.find((x) => x.id === openChestModal.itemId) ?? null) : null}
        goldDropped={openChestModal?.goldDropped}
        bonusMaterials={openChestModal?.bonusMaterials}
        seedZipTier={openChestModal?.seedZipTier}
        onClose={() => {
          setOpenChestModal(null)
          setChestChainMessage(null)
        }}
        nextAvailable={openChestModal ? hasNextChestToOpen(openChestModal.chestType) : false}
        chainMessage={chestChainMessage}
        animationSeed={chestModalAnimSeed}
        openAllCount={openChestModal ? getRemainingChestCount(openChestModal.chestType) : 0}
        onOpenAll={() => {
          if (!openChestModal) return
          setOpenChestModal(null)
          setChestChainMessage(null)
          openAllChests(openChestModal.chestType)
        }}
        onOpenNext={() => {
          if (!openChestModal) return
          const opened = openNextChest(openChestModal.chestType)
          if (!opened) {
            setChestChainMessage('Oops, your bags are over')
          }
        }}
      />

      <BulkChestOpenModal
        open={Boolean(bulkOpenModal)}
        chestType={bulkOpenModal?.chestType ?? null}
        result={bulkOpenModal?.result ?? null}
        onClose={() => setBulkOpenModal(null)}
      />
    </motion.div>
  )
}
