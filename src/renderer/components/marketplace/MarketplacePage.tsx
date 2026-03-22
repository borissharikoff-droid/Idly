import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LOOT_ITEMS, CHEST_DEFS, getRarityTheme, getItemPower, MARKETPLACE_BLOCKED_ITEMS, getItemPerkDescription, isValidItemId, type LootRarity } from '../../lib/loot'
import { getFarmItemDisplay, isSeedId, isSeedZipId, seedZipTierFromItemId } from '../../lib/farming'
import { SKILLS } from '../../lib/skills'
import { fetchActiveListings, partialBuyListing, cancelListing, expireOldListings, fetchTradeHistory, fetchPriceHistory, type ListingWithSeller, type CancelListingResult, type TradeHistoryEntry, type PriceHistoryEntry } from '../../services/marketplaceService'
import { PriceSparkline } from './PriceSparkline'
import { useGoldStore } from '../../stores/goldStore'
import { fmt } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useNavBadgeStore } from '../../stores/navBadgeStore'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { useFarmStore } from '../../stores/farmStore'
import { PageHeader } from '../shared/PageHeader'
import { ShoppingCart, RefreshCw, X } from '../../lib/icons'
import { BackpackButton } from '../shared/BackpackButton'
import { InventoryPage } from '../inventory/InventoryPage'
import { ListForSaleModal } from '../inventory/ListForSaleModal'
import { GoldDisplay } from './GoldDisplay'
import { SkeletonBlock } from '../shared/PageLoading'
import { playClickSound } from '../../lib/sounds'
import { RARITY_THEME, LootVisual as LootVisualShared, normalizeRarity } from '../loot/LootUI'
import { useToastStore } from '../../stores/toastStore'

const RARITY_ORDER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']
type TabId = 'listings' | 'sell' | 'my_listings' | 'history'

const MODAL_OVERLAY = { initial: { opacity: 0, pointerEvents: 'none' as const }, animate: { opacity: 1, pointerEvents: 'auto' as const }, exit: { opacity: 0, pointerEvents: 'none' as const }, transition: { duration: 0.15 } }
const MODAL_CARD = { initial: { opacity: 0, scale: 0.95, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 8 }, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }
const LIST_ITEM = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getItemName(itemId: string) {
  const item = LOOT_ITEMS.find((x) => x.id === itemId)
  return item?.name ?? getFarmItemDisplay(itemId)?.name ?? itemId
}

function getItemMeta(itemId: string) {
  const item = LOOT_ITEMS.find((x) => x.id === itemId)
  const farm = !item ? getFarmItemDisplay(itemId) : null
  const chest = !item && !farm ? CHEST_DEFS[itemId as keyof typeof CHEST_DEFS] : null
  return {
    item, farm,
    name: item?.name ?? farm?.name ?? chest?.name ?? itemId,
    rarity: (item?.rarity ?? farm?.rarity ?? chest?.rarity ?? 'common') as LootRarity,
    icon: item?.icon ?? farm?.icon ?? chest?.icon ?? '📦',
    image: item?.image ?? farm?.image ?? chest?.image,
    scale: item?.renderScale ?? 1,
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Get sellable quantity, subtracting 1 if item is currently equipped */
function getSellableQty(itemId: string, rawQty: number): number {
  const loot = LOOT_ITEMS.find((x) => x.id === itemId)
  if (!loot) return rawQty
  const { equippedBySlot } = useInventoryStore.getState()
  const isEquipped = equippedBySlot[loot.slot] === itemId
  return isEquipped ? Math.max(0, rawQty - 1) : rawQty
}

// ─── Order-book: one row per item, multiple price-level offers inside ─────────

interface OrderBookOffer {
  pricePerUnit: number
  totalQty: number
  listings: ListingWithSeller[]
  sellers: string[]
}

interface OrderBookRow {
  itemId: string
  floorPrice: number
  totalQty: number
  offers: OrderBookOffer[]  // sorted cheapest first
}

function buildOrderBook(listings: ListingWithSeller[]): OrderBookRow[] {
  // Step 1: group by itemId → pricePerUnit
  const byItem = new Map<string, Map<number, OrderBookOffer>>()
  for (const l of listings) {
    if (!byItem.has(l.item_id)) byItem.set(l.item_id, new Map())
    const byPrice = byItem.get(l.item_id)!
    const existing = byPrice.get(l.price_gold)
    if (existing) {
      existing.totalQty += l.quantity
      existing.listings.push(l)
      if (!existing.sellers.includes(l.seller_username ?? 'Anon'))
        existing.sellers.push(l.seller_username ?? 'Anon')
    } else {
      byPrice.set(l.price_gold, {
        pricePerUnit: l.price_gold,
        totalQty: l.quantity,
        listings: [l],
        sellers: [l.seller_username ?? 'Anon'],
      })
    }
  }
  // Step 2: build rows sorted by floor price (cheapest first per item)
  const rows: OrderBookRow[] = []
  for (const [itemId, byPrice] of byItem) {
    const offers = Array.from(byPrice.values()).sort((a, b) => a.pricePerUnit - b.pricePerUnit)
    const totalQty = offers.reduce((s, o) => s + o.totalQty, 0)
    rows.push({ itemId, floorPrice: offers[0].pricePerUnit, totalQty, offers })
  }
  return rows
}

// ─── Compact listing tile (one row per item) ─────────────────────────────────

function OrderBookTile({ row, onOpenOffers, index }: { row: OrderBookRow; onOpenOffers: (row: OrderBookRow) => void; index: number }) {
  const meta = getItemMeta(row.itemId)
  const theme = getRarityTheme(meta.rarity)
  const allSellers = Array.from(new Set(row.offers.flatMap((o) => o.sellers)))
  return (
    <motion.button
      {...LIST_ITEM}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      layout
      type="button"
      onClick={() => onOpenOffers(row)}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded border transition-colors hover:border-white/20 text-left group"
      style={{ borderColor: theme.border, backgroundColor: `${theme.color}06` }}
    >
      {/* icon */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center shrink-0 relative transition-transform group-hover:scale-105"
        style={{ borderColor: theme.border, borderWidth: 1, backgroundColor: `${theme.color}15` }}
      >
        <LootVisualShared icon={meta.icon} image={meta.image} className="w-6 h-6 object-contain" scale={meta.scale} />
        {row.totalQty > 1 && (
          <span
            className="absolute -top-1.5 -right-1.5 text-micro font-bold px-1 py-px rounded-full border leading-none"
            style={{ color: theme.color, backgroundColor: '#111214', borderColor: theme.border }}
          >
            ×{row.totalQty}
          </span>
        )}
      </div>
      {/* name + info */}
      <div className="flex-1 min-w-0">
        <p className="text-caption font-semibold text-white truncate">{meta.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="text-micro font-medium px-1.5 py-px rounded capitalize"
            style={{ color: theme.color, backgroundColor: `${theme.color}18` }}
          >
            {meta.rarity}
          </span>
          {meta.item && !['consumable', 'plant', 'material'].includes(meta.item.slot) && (
            <span className="text-micro text-gray-500">IP {getItemPower(meta.item)}</span>
          )}
          <span className="text-micro text-gray-600 truncate">
            {row.offers.length > 1
              ? `${row.offers.length} offers · ${allSellers.length === 1 ? allSellers[0] : `${allSellers.length} sellers`}`
              : (allSellers[0] ?? 'Unknown')}
          </span>
        </div>
      </div>
      {/* floor price chip (always green since it's the cheapest offer) */}
      <div className="shrink-0">
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded border transition-colors bg-green-500/10 border-green-500/25 group-hover:bg-green-500/16">
          <span className="text-micro text-green-400">🪙</span>
          <span className="font-bold text-caption tabular-nums text-green-400">{fmt(row.floorPrice)}</span>
          <span className="text-[7px] font-mono text-green-400/55 ml-0.5 tracking-wide">floor</span>
        </div>
      </div>
    </motion.button>
  )
}

// ─── My listing row ──────────────────────────────────────────────────────────

interface MergedMyListing {
  rep: ListingWithSeller
  ids: string[]
  totalQty: number
  pricePerUnit: number
}

function MyListingRow({ group, cancellingId, onCancel, index }: {
  group: MergedMyListing
  cancellingId: string | null
  onCancel: (group: MergedMyListing) => void
  index: number
}) {
  const meta = getItemMeta(group.rep.item_id)
  const theme = getRarityTheme(meta.rarity)
  const isCancelling = group.ids.some((id) => cancellingId === id)
  return (
    <motion.div
      {...LIST_ITEM}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      layout
      className="flex items-center gap-2.5 px-3 py-2.5 rounded border transition-all"
      style={{ borderColor: theme.border, backgroundColor: `${theme.color}08` }}
    >
      <div
        className="w-10 h-10 rounded flex items-center justify-center shrink-0 relative"
        style={{ borderColor: theme.border, borderWidth: 1, backgroundColor: `${theme.color}15` }}
      >
        <LootVisualShared icon={meta.icon} image={meta.image} className="w-6 h-6 object-contain" scale={meta.scale} />
        {group.totalQty > 1 && (
          <span
            className="absolute -top-1.5 -right-1.5 text-micro font-bold px-1 py-px rounded-full border leading-none"
            style={{ color: theme.color, backgroundColor: '#111214', borderColor: theme.border }}
          >
            ×{group.totalQty}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-caption font-semibold text-white truncate">{meta.name}</p>
        <p className="text-micro text-gray-500 mt-0.5">
          {group.ids.length > 1 ? `${group.ids.length} orders · ` : ''}{group.pricePerUnit}🪙{group.totalQty > 1 ? '/ea' : ''}
        </p>
      </div>
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
        <span className="text-amber-400 text-micro">🪙</span>
        <span className="text-amber-400 font-bold text-caption tabular-nums">{group.pricePerUnit * group.totalQty}</span>
      </div>
      <button
        type="button"
        disabled={isCancelling}
        onClick={() => { playClickSound(); onCancel(group) }}
        className="px-2.5 py-1.5 rounded text-micro font-semibold bg-red-500/12 border border-red-500/25 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
      >
        {isCancelling ? '...' : group.ids.length > 1 ? `Cancel ×${group.ids.length}` : 'Cancel'}
      </button>
    </motion.div>
  )
}

// ─── History row ─────────────────────────────────────────────────────────────

function HistoryRow({ entry, userId, index }: { entry: TradeHistoryEntry; userId: string; index: number }) {
  const meta = getItemMeta(entry.item_id)
  const theme = getRarityTheme(meta.rarity)
  const isSeller = entry.seller_id === userId
  const isBuyer = entry.buyer_id === userId
  const totalGold = entry.price_gold * entry.quantity

  let statusLabel: string
  let statusColor: string
  if (entry.status === 'sold' && isSeller) {
    statusLabel = 'Sold'
    statusColor = '#22c55e'
  } else if (entry.status === 'sold' && isBuyer) {
    statusLabel = 'Bought'
    statusColor = '#3b82f6'
  } else if (entry.status === 'cancelled') {
    statusLabel = 'Cancelled'
    statusColor = '#6b7280'
  } else if (entry.status === 'expired') {
    statusLabel = 'Expired'
    statusColor = '#f59e0b'
  } else {
    statusLabel = entry.status
    statusColor = '#6b7280'
  }

  const otherUser = isSeller
    ? (entry.buyer_username ?? (entry.status === 'sold' ? 'Someone' : '—'))
    : (entry.seller_username ?? 'Unknown')

  return (
    <motion.div
      {...LIST_ITEM}
      transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.3) }}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded border"
      style={{ borderColor: `${theme.border}40`, backgroundColor: `${theme.color}04` }}
    >
      <div
        className="w-9 h-9 rounded flex items-center justify-center shrink-0"
        style={{ borderColor: theme.border, borderWidth: 1, backgroundColor: `${theme.color}12` }}
      >
        <LootVisualShared icon={meta.icon} image={meta.image} className="w-5 h-5 object-contain" scale={meta.scale} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-caption font-semibold text-white truncate">
          {meta.name}{entry.quantity > 1 ? ` ×${entry.quantity}` : ''}
        </p>
        <p className="text-micro text-gray-500 truncate mt-0.5">
          {isSeller ? `→ ${otherUser}` : `← ${otherUser}`} · {timeAgo(entry.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {entry.status === 'sold' && (
          <span className="text-micro tabular-nums font-semibold" style={{ color: isSeller ? '#22c55e' : '#3b82f6' }}>
            {isSeller ? '+' : '−'}{fmt(totalGold)}🪙
          </span>
        )}
        <span
          className="text-micro font-medium px-1.5 py-0.5 rounded-md border"
          style={{ color: statusColor, borderColor: `${statusColor}30`, backgroundColor: `${statusColor}12` }}
        >
          {statusLabel}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Sell tab (inventory-style picker with category filters) ──────────────────

const SELL_FILTERS = [
  { id: 'all',       label: 'All',       icon: '🎒' },
  { id: 'gear',      label: 'Gear',      icon: '⚔️' },
  { id: 'food',      label: 'Food',      icon: '🍽️' },
  { id: 'materials', label: 'Materials', icon: '🪨' },
  { id: 'plants',    label: 'Plants',    icon: '🌿' },
  { id: 'seeds',     label: 'Seeds',     icon: '🌱' },
] as const

type SellFilterId = typeof SELL_FILTERS[number]['id']

function sellItemCategory(id: string): SellFilterId {
  if (isSeedId(id) || isSeedZipId(id)) return 'seeds'
  const item = LOOT_ITEMS.find((x) => x.id === id)
  if (!item) return 'materials'
  if (item.slot === 'food') return 'food'
  if (item.slot === 'plant') return 'plants'
  if (item.slot === 'material') return 'materials'
  if (['head', 'body', 'legs', 'ring', 'weapon'].includes(item.slot)) return 'gear'
  return 'materials'
}

function SellTab({ onListed, onToast, floorPriceMap }: { onListed: () => void; onToast: (message: string, type: 'success' | 'error') => void; floorPriceMap: Map<string, number> }) {
  const items = useInventoryStore((s) => s.items)
  const seeds = useFarmStore((s) => s.seeds)
  const seedZips = useFarmStore((s) => s.seedZips)
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [quickListPrice, setQuickListPrice] = useState<number | undefined>(undefined)
  useEscapeHandler(() => setSelectedItem(null), selectedItem !== null)
  const [sellSearch, setSellSearch] = useState('')
  const [filterBy, setFilterBy] = useState<SellFilterId>('all')

  const sellable = useMemo(() => {
    const result: { id: string; qty: number }[] = []
    for (const [id, rawQty] of Object.entries(items)) {
      if (rawQty <= 0 || MARKETPLACE_BLOCKED_ITEMS.includes(id) || !isValidItemId(id)) continue
      const qty = getSellableQty(id, rawQty)
      if (qty > 0) result.push({ id, qty })
    }
    for (const [id, qty] of Object.entries(seeds)) {
      if (qty > 0 && !MARKETPLACE_BLOCKED_ITEMS.includes(id)) {
        result.push({ id, qty })
      }
    }
    const zipMap: Record<string, string> = {
      common: 'seed_zip_common', rare: 'seed_zip_rare',
      epic: 'seed_zip_epic', legendary: 'seed_zip_legendary',
    }
    for (const [tier, qty] of Object.entries(seedZips)) {
      if (qty > 0) result.push({ id: zipMap[tier] ?? `seed_zip_${tier}`, qty })
    }
    // Sort by rarity (highest first)
    const rarityVal: Record<string, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 }
    result.sort((a, b) => {
      const ra = getItemMeta(a.id).rarity
      const rb = getItemMeta(b.id).rarity
      return (rarityVal[rb] ?? 0) - (rarityVal[ra] ?? 0)
    })
    return result
  }, [items, seeds, seedZips])

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const f of SELL_FILTERS) {
      counts[f.id] = f.id === 'all' ? sellable.length : sellable.filter((s) => sellItemCategory(s.id) === f.id).length
    }
    return counts
  }, [sellable])

  const filtered = useMemo(() => {
    let result = sellable
    if (filterBy !== 'all') result = result.filter((s) => sellItemCategory(s.id) === filterBy)
    if (sellSearch.trim()) {
      const q = sellSearch.toLowerCase()
      result = result.filter(({ id }) => {
        const meta = getItemMeta(id)
        return meta.name.toLowerCase().includes(q) || meta.rarity.toLowerCase().includes(q) || id.toLowerCase().includes(q)
      })
    }
    return result
  }, [sellable, sellSearch, filterBy])

  // Group items by category when showing "all"
  const grouped = useMemo(() => {
    if (filterBy !== 'all' || sellSearch.trim()) return null
    const cats: { key: SellFilterId; label: string; icon: string; items: { id: string; qty: number }[] }[] = [
      { key: 'gear', label: 'Gear', icon: '⚔️', items: [] },
      { key: 'food', label: 'Food', icon: '🍽️', items: [] },
      { key: 'materials', label: 'Materials', icon: '🪨', items: [] },
      { key: 'plants', label: 'Plants', icon: '🌿', items: [] },
      { key: 'seeds', label: 'Seeds', icon: '🌱', items: [] },
    ]
    for (const entry of filtered) {
      const cat = sellItemCategory(entry.id)
      const group = cats.find((c) => c.key === cat)
      if (group) group.items.push(entry)
    }
    const nonEmpty = cats.filter((c) => c.items.length > 0)
    return nonEmpty.length >= 2 ? nonEmpty : null
  }, [filtered, filterBy, sellSearch])

  // Stable refs so ListForSaleModal callback doesn't cause remount
  const onListedRef = useRef(onListed)
  onListedRef.current = onListed
  const onToastRef = useRef(onToast)
  onToastRef.current = onToast
  // Snapshot maxQty at modal open so it doesn't change mid-listing
  const [modalMaxQty, setModalMaxQty] = useState(1)
  useEffect(() => {
    if (selectedItem) {
      const entry = sellable.find((s) => s.id === selectedItem)
      setModalMaxQty(entry?.qty ?? 1)
    }
  }, [selectedItem]) // eslint-disable-line react-hooks/exhaustive-deps -- snapshot qty at open, not when sellable changes

  const handleQuickList = (e: React.MouseEvent, entry: { id: string; qty: number }) => {
    e.stopPropagation()
    playClickSound()
    // Use active listing floor (undercut by 1g) — no async needed
    const activeFloor = floorPriceMap.get(entry.id)
    setQuickListPrice(activeFloor !== undefined ? Math.max(1, activeFloor - 1) : undefined)
    setSelectedItem(entry.id)
  }

  const renderSellCard = (entry: { id: string; qty: number }, i: number) => {
    const meta = getItemMeta(entry.id)
    const theme = RARITY_THEME[normalizeRarity(meta.rarity)] ?? RARITY_THEME.common
    const lootItem = LOOT_ITEMS.find((x) => x.id === entry.id)
    const perkChip = lootItem && lootItem.perkType !== 'cosmetic' && lootItem.slot !== 'consumable' && lootItem.slot !== 'plant'
      ? getItemPerkDescription(lootItem) : null
    const activeFloor = floorPriceMap.get(entry.id)
    return (
      <motion.div
        key={entry.id}
        {...LIST_ITEM}
        transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.25) }}
        className="relative"
      >
        <button
          type="button"
          onClick={() => { playClickSound(); setQuickListPrice(undefined); setSelectedItem(entry.id) }}
          className="relative w-full flex items-center gap-2 p-2 rounded border border-white/[0.06] bg-surface-0/50 hover:bg-surface-0/80 active:scale-[0.98] transition-all text-left overflow-hidden group"
        >
          {/* Left rarity accent */}
          <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full" style={{ background: theme.color, opacity: normalizeRarity(meta.rarity) === 'common' ? 0.3 : 0.7 }} />
          {/* Icon box */}
          <div
            className="w-10 h-10 rounded flex items-center justify-center shrink-0 overflow-hidden transition-transform group-hover:scale-105"
            style={{ background: '#0a0a14', border: `1px solid ${theme.color}30` }}
          >
            <LootVisualShared icon={meta.icon} image={meta.image} className="w-6 h-6 object-contain" scale={meta.scale} />
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-micro font-semibold text-gray-100 leading-tight truncate">{meta.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-micro font-mono uppercase" style={{ color: theme.color }}>{meta.rarity}</span>
            </div>
            {perkChip && <p className="text-micro text-gray-500 truncate mt-0.5">{perkChip}</p>}
          </div>
          {/* Qty + Sell label */}
          {entry.qty > 1 && <span className="text-micro font-mono font-bold shrink-0" style={{ color: theme.color }}>×{entry.qty}</span>}
          <span className="text-micro text-amber-400/70 font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Sell</span>
        </button>
        {/* Quick List button — only shown when active floor exists */}
        {activeFloor !== undefined && (
          <button
            type="button"
            onClick={(e) => handleQuickList(e, entry)}
            title={`Quick list at ${activeFloor - 1}g (floor − 1)`}
            className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-micro font-bold border text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors leading-none z-10"
          >
            ⚡
          </button>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      key="tab-sell"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2 }}
      className="space-y-2"
    >
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={sellSearch}
          onChange={(e) => setSellSearch(e.target.value)}
          placeholder={`Search ${sellable.length} item${sellable.length !== 1 ? 's' : ''} in inventory...`}
          className="w-full text-micro font-mono px-2.5 py-1.5 pl-7 rounded border border-white/[0.08] bg-surface-0 text-gray-200 placeholder-gray-500 outline-none focus:border-amber-500/40 transition-colors"
        />
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-micro text-gray-500 pointer-events-none">🔍</span>
        {sellSearch && (
          <button type="button" onClick={() => setSellSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 px-1"><X className="w-3 h-3" /></button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1">
        {SELL_FILTERS.map((f) => {
          const active = filterBy === f.id
          const count = filterCounts[f.id] ?? 0
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => { playClickSound(); setFilterBy(f.id) }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-micro font-medium transition-all ${
                active
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-white/[0.08] bg-surface-0/30 text-gray-400 hover:text-gray-200 hover:border-white/20'
              }`}
            >
              <span className="text-micro leading-none">{f.icon}</span>
              <span>{f.label}</span>
              {!active && count > 0 && <span className="ml-0.5 text-micro font-mono opacity-50">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.05]" />

      {/* Items */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-14 text-center rounded-card border border-white/[0.06] bg-surface-1/40"
        >
          <span className="text-4xl mb-3 block opacity-40">📦</span>
          <p className="text-xs text-gray-400 font-medium">
            {sellable.length === 0 ? 'No sellable items in inventory' : 'No items match your filters'}
          </p>
        </motion.div>
      ) : grouped ? (
        <div className="grid grid-cols-3 gap-1">
          {grouped.map(({ key, label, icon, items: grpItems }) => (
            <React.Fragment key={key}>
              <div className="col-span-full text-micro font-mono uppercase tracking-widest text-gray-500 pt-1 pb-0.5 flex items-center gap-2">
                <span className="flex items-center gap-1.5">{icon} {label}</span>
                <div className="flex-1 border-t border-white/[0.05]" />
                <span>{grpItems.length}</span>
              </div>
              {grpItems.map((entry, i) => renderSellCard(entry, i))}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {filtered.map((entry, i) => renderSellCard(entry, i))}
        </div>
      )}

      {selectedItem && (
        <ListForSaleModal
          key={selectedItem}
          itemId={selectedItem}
          maxQty={modalMaxQty}
          suggestedPrice={quickListPrice}
          activeFloorPrice={floorPriceMap.get(selectedItem)}
          onClose={() => { setSelectedItem(null); setQuickListPrice(undefined) }}
          onListed={() => {
            setSelectedItem(null)
            setQuickListPrice(undefined)
            onListedRef.current()
          }}
          onDeductItem={isSeedId(selectedItem) ? (qty) => useFarmStore.getState().removeSeed(selectedItem, qty)
            : isSeedZipId(selectedItem) ? (qty) => {
              const tier = seedZipTierFromItemId(selectedItem)
              if (tier) useFarmStore.getState().removeSeedZip(tier, qty)
            } : undefined}
          onRollbackDeduct={isSeedId(selectedItem) ? (qty) => useFarmStore.getState().addSeed(selectedItem, qty)
            : isSeedZipId(selectedItem) ? (qty) => {
              const tier = seedZipTierFromItemId(selectedItem)
              if (tier) useFarmStore.getState().addSeedZip(tier, qty)
            } : undefined}
        />
      )}
    </motion.div>
  )
}



// ─── Main page ───────────────────────────────────────────────────────────────

interface MarketplacePageProps {
  onBack?: () => void
}

export function MarketplacePage({ onBack }: MarketplacePageProps) {
  const [listings, setListings] = useState<ListingWithSeller[]>([])
  const [history, setHistory] = useState<TradeHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('listings')
  const [offersTarget, setOffersTarget] = useState<OrderBookRow | null>(null)
  const [buyTarget, setBuyTarget] = useState<{ itemId: string; offer: OrderBookOffer } | null>(null)
  const [buyQty, setBuyQty] = useState(1)
  const [buying, setBuying] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([])
  const [cancelTarget, setCancelTarget] = useState<MergedMyListing | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [showBackpack, setShowBackpack] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const pushToast = useToastStore((s) => s.push)

  // Filters
  const [search, setSearch] = useState('')
  const [perkFilter, setPerkFilter] = useState<'' | 'combat' | 'xp' | 'drops' | 'cosmetic' | 'seeds'>('')
  const [skillFilter, setSkillFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'newest'>('price_asc')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showFloorBoard, setShowFloorBoard] = useState(false)
  const infoRef = useRef<HTMLDivElement>(null)

  const gold = useGoldStore((s) => s.gold)
  const syncFromSupabase = useGoldStore((s) => s.syncFromSupabase)
  const user = useAuthStore((s) => s.user)

  const exitingRef = useRef(false)

  useEffect(() => { return () => { exitingRef.current = true } }, [])
  useEffect(() => {
    setBuyQty(1)
    setPriceHistory([])
    const itemId = buyTarget?.itemId ?? offersTarget?.itemId
    if (itemId) {
      fetchPriceHistory(itemId, 10).then(setPriceHistory).catch(() => {})
    }
  }, [buyTarget, offersTarget])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && offersTarget) { e.stopImmediatePropagation(); setOffersTarget(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [offersTarget])
  useEffect(() => { useNavBadgeStore.getState().clearMarketplaceSale() }, [])

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    pushToast({ kind: 'generic', message, type })
  }, [pushToast])

  const loadListings = useCallback(async (withExpiry = false) => {
    if (exitingRef.current) return
    setLoading(true)
    try {
      if (withExpiry) await expireOldListings()
      const data = await fetchActiveListings()
      if (!exitingRef.current) setListings(data)
    } catch { /* ignore */ } finally {
      if (!exitingRef.current) setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    if (!user || exitingRef.current) return
    setHistoryLoading(true)
    try {
      const data = await fetchTradeHistory(user.id)
      if (!exitingRef.current) setHistory(data)
    } catch { /* ignore */ } finally {
      if (!exitingRef.current) setHistoryLoading(false)
    }
  }, [user])

  useEffect(() => { loadListings(true) }, [loadListings])
  useEffect(() => { if (user) syncFromSupabase(user.id).catch(() => {}) }, [user, syncFromSupabase])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab, loadHistory])

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showInfo])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (buyTarget) { e.stopImmediatePropagation(); setBuyTarget(null); return }
      if (cancelTarget) { e.stopImmediatePropagation(); setCancelTarget(null); setCancelError(null); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [buyTarget, cancelTarget])  // offersTarget escape is handled by its own effect above

  // ─── Filtering ──────────────────────────────────────────────────────────────

  /** Filtered listings for the Listings tab (applies all filters) */
  const filteredListings = useMemo(() => {
    let result = listings.filter((l) => !MARKETPLACE_BLOCKED_ITEMS.includes(l.item_id) && isValidItemId(l.item_id))
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((l) => getItemName(l.item_id).toLowerCase().includes(q))
    }
    if (perkFilter) {
      result = result.filter((l) => {
        if (perkFilter === 'seeds') return isSeedId(l.item_id) || isSeedZipId(l.item_id)
        const item = LOOT_ITEMS.find((x) => x.id === l.item_id)
        if (!item) return false
        if (perkFilter === 'combat') return ['atk_boost', 'hp_boost', 'hp_regen_boost'].includes(item.perkType as string)
        if (perkFilter === 'xp') return ['xp_skill_boost', 'xp_global_boost', 'focus_boost'].includes(item.perkType as string)
        if (perkFilter === 'drops') return item.perkType === 'chest_drop_boost'
        if (perkFilter === 'cosmetic') return ['cosmetic', 'status_title', 'streak_shield'].includes(item.perkType as string)
        return true
      })
    }
    if (perkFilter === 'xp' && skillFilter) {
      const skill = SKILLS.find((s) => s.id === skillFilter)
      const matchTargets = skill ? [skill.id, skill.category] : []
      result = result.filter((l) => {
        const item = LOOT_ITEMS.find((x) => x.id === l.item_id)
        if (!item) return false
        if (item.perkType === 'xp_global_boost') return true
        return matchTargets.includes(item.perkTarget ?? '')
      })
    }
    if (rarityFilter) {
      result = result.filter((l) => {
        const rarity = LOOT_ITEMS.find((x) => x.id === l.item_id)?.rarity ?? getFarmItemDisplay(l.item_id)?.rarity ?? 'common'
        return rarity === rarityFilter
      })
    }
    const min = priceMin.trim() ? Math.max(0, Math.floor(Number(priceMin) || 0)) : 0
    const max = priceMax.trim() ? Math.max(0, Math.floor(Number(priceMax) || 0)) : Infinity
    if (min > 0 || max < Infinity) {
      result = result.filter((l) => l.price_gold >= min && l.price_gold <= max)
    }
    result.sort((a, b) => {
      if (sortBy === 'price_asc') return a.price_gold - b.price_gold
      if (sortBy === 'price_desc') return b.price_gold - a.price_gold
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return result
  }, [listings, search, perkFilter, skillFilter, rarityFilter, priceMin, priceMax, sortBy])

  const activeFiltersCount = [search, perkFilter, skillFilter, rarityFilter, priceMin, priceMax].filter(Boolean).length
  const clearFilters = () => {
    setSearch(''); setPerkFilter(''); setSkillFilter(''); setRarityFilter(''); setPriceMin(''); setPriceMax(''); setSortBy('price_asc')
  }

  // Listings tab: only show other people's listings
  const otherListings = filteredListings.filter((l) => user?.id !== l.seller_id)
  const otherCount = listings.filter((l) => !MARKETPLACE_BLOCKED_ITEMS.includes(l.item_id) && isValidItemId(l.item_id) && user?.id !== l.seller_id).length

  // My Listings tab: NOT affected by filters — always shows all your active listings
  const myListingsUnfiltered = useMemo(
    () => listings.filter((l) => !MARKETPLACE_BLOCKED_ITEMS.includes(l.item_id) && isValidItemId(l.item_id) && user?.id === l.seller_id),
    [listings, user?.id],
  )

  // Order-book: stack other listings by item+price
  const orderBook = useMemo(() => buildOrderBook(otherListings), [otherListings])

  // Floor price per item (minimum active listing price, from all listings including own)
  const floorPriceMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of listings) {
      if (MARKETPLACE_BLOCKED_ITEMS.includes(l.item_id) || !isValidItemId(l.item_id)) continue
      const cur = map.get(l.item_id)
      if (cur === undefined || l.price_gold < cur) map.set(l.item_id, l.price_gold)
    }
    return map
  }, [listings])

  // Merged my listings (group same item+price) — from unfiltered
  const mergedMyListings = useMemo(() => {
    const groups = new Map<string, MergedMyListing>()
    for (const l of myListingsUnfiltered) {
      const key = `${l.item_id}::${l.price_gold}`
      const g = groups.get(key)
      if (g) { g.ids.push(l.id); g.totalQty += l.quantity }
      else groups.set(key, { rep: l, ids: [l.id], totalQty: l.quantity, pricePerUnit: l.price_gold })
    }
    return Array.from(groups.values())
  }, [myListingsUnfiltered])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    if (refreshing || exitingRef.current) return
    setRefreshing(true)
    await loadListings(false)
    if (activeTab === 'history') await loadHistory()
    if (!exitingRef.current) {
      if (user) syncFromSupabase(user.id).catch(() => {})
      setRefreshing(false)
    }
  }

  const handleBuyClick = (itemId: string, offer: OrderBookOffer) => {
    if (!user) return
    if ((gold ?? 0) < offer.pricePerUnit) {
      const deficit = offer.pricePerUnit - (gold ?? 0)
      showToast(`Need ${deficit} more gold`, 'error')
      return
    }
    setBuyQty(1)
    setBuyTarget({ itemId, offer })
  }

  const handleBuy = async (qty: number) => {
    if (!buyTarget) return
    setBuying(true)
    if (!user) { setBuying(false); return }
    const { itemId, offer } = buyTarget

    let remaining = qty
    let totalBought = 0
    const sorted = [...offer.listings].sort((a, b) => a.price_gold - b.price_gold)

    for (const listing of sorted) {
      if (remaining <= 0) break
      const take = Math.min(remaining, listing.quantity)
      try {
        const res = await partialBuyListing(listing.id, take)
        if (exitingRef.current) return
        if (res.ok) {
          syncFromSupabase(user.id).catch(() => {})
          if (res.item_id && res.quantity) {
            if (isSeedId(res.item_id)) {
              useFarmStore.getState().addSeed(res.item_id, res.quantity)
            } else if (isSeedZipId(res.item_id)) {
              const tier = seedZipTierFromItemId(res.item_id)
              if (tier) useFarmStore.getState().addSeedZip(tier, res.quantity)
            } else {
              useInventoryStore.getState().addItem(res.item_id, res.quantity)
            }
            totalBought += res.quantity
          }
          remaining -= take
        } else {
          // listing sold out or error — skip to next
        }
      } catch { /* network — continue to next listing */ }
    }

    // Sync inventory
    try {
      const { items, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      await syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips })
    } catch { /* non-fatal */ }

    if (!exitingRef.current) {
      setBuying(false)
      setBuyTarget(null)
      if (totalBought > 0) {
        playClickSound()
        showToast(`Bought ${totalBought}× ${getItemName(itemId)}`, 'success')
      } else {
        showToast('Purchase failed — listing may have sold out', 'error')
      }
      loadListings().catch(() => {})
    }
  }

  const handleCancelConfirm = async (group: MergedMyListing) => {
    if (!user) return
    setCancellingId(group.ids[0] ?? null)
    setCancelTarget(null)
    const results = await Promise.all(
      group.ids.map((id) => cancelListing(id).catch(() => ({ ok: false } as CancelListingResult)))
    )
    if (exitingRef.current) return
    let returned = 0
    for (const res of results) {
      if (res.ok && res.item_id && res.quantity) {
        if (isSeedId(res.item_id)) {
          useFarmStore.getState().addSeed(res.item_id, res.quantity)
        } else if (isSeedZipId(res.item_id)) {
          const tier = seedZipTierFromItemId(res.item_id)
          if (tier) useFarmStore.getState().addSeedZip(tier, res.quantity)
        } else {
          useInventoryStore.getState().addItem(res.item_id, res.quantity)
        }
        returned += res.quantity
      }
    }
    setCancellingId(null)
    playClickSound()
    if (returned > 0) {
      showToast(`${returned}× ${getItemName(group.rep.item_id)} returned`, 'success')
    }
    try {
      const { items, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      await syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips })
    } catch { /* non-fatal */ }
    if (!exitingRef.current) loadListings().catch(() => {})
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (showBackpack) return <InventoryPage onBack={() => setShowBackpack(false)} />

  return (
    <div className="p-4 pb-20 space-y-3">
      <PageHeader
        title="Marketplace"
        icon={<ShoppingCart className="w-4 h-4 text-yellow-400" />}
        onBack={onBack}
        rightSlot={
          <div className="flex items-center gap-1.5">
            <BackpackButton onClick={() => setShowBackpack(true)} />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-7 h-7 flex items-center justify-center rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40 active:scale-95"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <GoldDisplay />
          </div>
        }
        titleSlot={
          <div className="relative" ref={infoRef}>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className={`w-[18px] h-[18px] rounded-full border text-micro font-bold flex items-center justify-center transition-colors ${
                showInfo
                  ? 'border-accent/50 text-accent bg-accent/10'
                  : 'border-white/20 text-gray-500 hover:text-gray-300 hover:border-white/35'
              }`}
            >
              ?
            </button>
            <AnimatePresence>
              {showInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 top-6 z-50 w-60 rounded-card border border-white/10 bg-surface-1/95 p-3 shadow-2xl backdrop-blur-md"
                >
                  <p className="text-micro uppercase tracking-wider text-gray-500 font-mono mb-2">How it works</p>
                  <ul className="space-y-1.5">
                    {[
                      'Buy and sell items with other players.',
                      'Each item shows the floor price — tap to see all offers.',
                      '5% commission charged on listing.',
                      'Listings expire after 7 days.',
                    ].map((tip) => (
                      <li key={tip} className="flex items-start gap-1.5">
                        <span className="text-accent/60 mt-px text-micro leading-tight shrink-0">▸</span>
                        <span className="text-caption text-gray-300 leading-snug">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex rounded bg-surface-0/80 border border-white/[0.06] p-1 gap-1">
        {([
          { id: 'listings' as TabId, label: 'Browse', count: otherCount },
          { id: 'sell' as TabId, label: 'Sell' },
          { id: 'my_listings' as TabId, label: 'My Listings', count: myListingsUnfiltered.length },
          { id: 'history' as TabId, label: 'History' },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 py-1.5 rounded text-caption font-medium transition-all active:scale-[0.97] ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="marketplace-tab-bg"
                className="absolute inset-0 rounded bg-white/10 border border-white/[0.06]"
                transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10">
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="ml-1 text-micro opacity-50">{tab.count}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Filters — only on listings tab */}
      <AnimatePresence>
        {activeTab === 'listings' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1.5 overflow-hidden"
          >
            <div className="flex gap-1.5">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${otherCount} listing${otherCount !== 1 ? 's' : ''}...`}
                className="flex-1 min-w-0 px-3 py-1.5 rounded bg-surface-0 border border-white/[0.08] text-white text-xs placeholder-gray-500 focus:border-accent/40 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setSortBy((s) => s === 'price_asc' ? 'price_desc' : s === 'price_desc' ? 'newest' : 'price_asc')}
                className="px-2.5 py-1.5 rounded bg-surface-0 border border-white/[0.08] text-gray-400 text-xs hover:text-white transition-colors whitespace-nowrap shrink-0 active:scale-95"
                title="Sort order"
              >
                {sortBy === 'newest' ? '🕒 New' : sortBy === 'price_asc' ? '🪙 ↑' : '🪙 ↓'}
              </button>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-2.5 py-1.5 rounded bg-surface-0 border border-accent/30 text-accent text-xs hover:bg-accent/10 transition-colors whitespace-nowrap shrink-0 active:scale-95"
                >
                  ×{activeFiltersCount}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {([
                { id: '', label: 'All' },
                { id: 'combat', label: '⚔ Combat' },
                { id: 'xp', label: '📈 XP' },
                { id: 'drops', label: '🎁 Drops' },
                { id: 'cosmetic', label: '✨ Cosmetic' },
                { id: 'seeds', label: '🌱 Seeds' },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setPerkFilter(f.id); setSkillFilter('') }}
                  className={`px-2 py-0.5 rounded-md border text-caption font-medium transition-all active:scale-95 ${
                    perkFilter === f.id
                      ? 'border-accent/50 bg-accent/12 text-accent'
                      : 'border-white/[0.08] bg-surface-0 text-gray-400 hover:text-gray-200 hover:border-white/20'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFiltersExpanded((v) => !v)}
                title={filtersExpanded ? 'Hide filters' : 'More filters'}
                className={`px-2 py-0.5 rounded-md border text-caption transition-all active:scale-95 ${
                  filtersExpanded
                    ? 'border-white/20 bg-white/8 text-gray-300'
                    : 'border-white/[0.08] bg-surface-0 text-gray-500 hover:text-gray-300 hover:border-white/20'
                }`}
              >
                {filtersExpanded ? '▲' : '▼'}
              </button>
            </div>

            <AnimatePresence>
              {perkFilter === 'xp' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-1 overflow-hidden"
                >
                  {SKILLS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSkillFilter((prev) => prev === s.id ? '' : s.id)}
                      className={`px-2 py-0.5 rounded-md border text-micro transition-all ${
                        skillFilter === s.id
                          ? 'border-white/30 bg-white/10 text-white'
                          : 'border-white/[0.06] bg-surface-0 text-gray-500 hover:text-gray-300 hover:border-white/15'
                      }`}
                    >
                      {s.icon} {s.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {filtersExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-card border border-white/[0.07] bg-surface-0/60 p-2 space-y-1.5 overflow-hidden"
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-micro font-mono uppercase tracking-wider text-gray-600 mr-1">Rarity</span>
                    {RARITY_ORDER.map((r) => {
                      const t = RARITY_THEME[normalizeRarity(r)]
                      const active = rarityFilter === r
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRarityFilter((prev) => prev === r ? '' : r)}
                          className="px-2 py-0.5 rounded-md border text-micro font-medium capitalize transition-all"
                          style={active
                            ? { borderColor: t.border, background: `${t.glow}18`, color: t.color }
                            : { borderColor: 'rgba(255,255,255,0.07)', background: 'transparent', color: '#9ca3af' }}
                        >
                          {r}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-micro font-mono uppercase tracking-wider text-gray-600 mr-1">Price 🪙</span>
                    <input
                      type="number" min={0} value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      placeholder="Min"
                      className="grindly-no-spinner w-14 px-1.5 py-0.5 rounded-md bg-[#0d0d1a] border border-white/[0.08] text-white text-caption placeholder-gray-600 focus:border-accent/40 outline-none text-center"
                    />
                    <span className="text-gray-600 text-micro">–</span>
                    <input
                      type="number" min={0} value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      placeholder="Max"
                      className="grindly-no-spinner w-14 px-1.5 py-0.5 rounded-md bg-[#0d0d1a] border border-white/[0.08] text-white text-caption placeholder-gray-600 focus:border-accent/40 outline-none text-center"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Tab content ─────────────────────────────────────────────────────── */}

      <AnimatePresence mode="wait">
        {activeTab === 'listings' && (
          <motion.div
            key="tab-listings"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded border border-white/[0.06] bg-surface-1/50 p-3 flex items-center gap-2.5">
                    <SkeletonBlock className="w-10 h-10 rounded shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <SkeletonBlock className="h-3 w-24" />
                      <SkeletonBlock className="h-2.5 w-16" />
                    </div>
                    <SkeletonBlock className="h-8 w-16 rounded" />
                  </div>
                ))}
              </div>
            ) : orderBook.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-14 text-center rounded-card border border-white/[0.06] bg-surface-1/40"
              >
                <span className="text-4xl mb-3 block opacity-40">🛒</span>
                <p className="text-xs text-gray-400 font-medium">
                  {otherCount === 0 ? 'No listings from other players' : 'No listings match your filters'}
                </p>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 px-4 py-1.5 rounded border border-accent/30 text-accent text-micro hover:bg-accent/10 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="space-y-1.5">
                {/* Floor Board toggle */}
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-micro text-gray-600 font-mono">{orderBook.length} item{orderBook.length !== 1 ? 's' : ''}</span>
                  <button
                    type="button"
                    onClick={() => { playClickSound(); setShowFloorBoard((v) => !v) }}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-micro font-mono transition-colors ${showFloorBoard ? 'bg-green-500/15 border-green-500/35 text-green-400' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400'}`}
                  >
                    🏷 {showFloorBoard ? 'List' : 'Floors'}
                  </button>
                </div>

                {showFloorBoard ? (
                  /* ── Compact floor board ── */
                  <div className="rounded-card border border-white/[0.07] bg-surface-0/60 overflow-hidden">
                    <div className="flex items-center px-3 py-1.5 border-b border-white/[0.05]">
                      <span className="text-micro uppercase tracking-widest text-gray-600 font-mono flex-1">Item</span>
                      <span className="text-micro uppercase tracking-widest text-gray-600 font-mono w-12 text-right">Floor</span>
                      <span className="text-micro uppercase tracking-widest text-gray-600 font-mono w-10 text-right">Qty</span>
                    </div>
                    {orderBook.map((row) => {
                      const m = getItemMeta(row.itemId)
                      const theme = getRarityTheme(m.rarity)
                      return (
                        <button
                          key={row.itemId}
                          type="button"
                          onClick={() => { playClickSound(); setOffersTarget(row) }}
                          className="w-full flex items-center px-3 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors gap-2"
                        >
                          <span className="text-sm shrink-0">{m.icon}</span>
                          <span className="flex-1 text-micro text-gray-300 truncate text-left">{m.name}</span>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.color }} />
                          <span className="w-12 text-right text-caption font-bold font-mono text-green-400">{fmt(row.floorPrice)}</span>
                          <span className="w-10 text-right text-micro text-gray-600 font-mono">×{row.totalQty}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  orderBook.map((row, i) => (
                    <OrderBookTile key={row.itemId} row={row} onOpenOffers={(r) => { playClickSound(); setOffersTarget(r) }} index={i} />
                  ))
                )}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'sell' && (
          <SellTab onListed={loadListings} onToast={showToast} floorPriceMap={floorPriceMap} />
        )}

        {activeTab === 'my_listings' && (
          <motion.div
            key="tab-my"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded border border-white/[0.06] bg-surface-1/50 p-3 flex items-center gap-2.5">
                    <SkeletonBlock className="w-10 h-10 rounded shrink-0" />
                    <div className="flex-1 space-y-2"><SkeletonBlock className="h-3 w-24" /></div>
                    <SkeletonBlock className="h-8 w-16 rounded" />
                  </div>
                ))}
              </div>
            ) : mergedMyListings.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-14 text-center rounded-card border border-white/[0.06] bg-surface-1/40"
              >
                <span className="text-4xl mb-3 block opacity-40">📦</span>
                <p className="text-xs text-gray-400 font-medium">You have no active listings</p>
                <button
                  type="button"
                  onClick={() => { playClickSound(); setActiveTab('sell') }}
                  className="mt-3 px-4 py-1.5 rounded bg-gradient-to-r from-amber-500/20 to-amber-600/15 border border-amber-500/30 text-amber-300 text-caption font-semibold hover:from-amber-500/30 hover:to-amber-600/25 transition-all active:scale-95"
                >
                  + Sell an item
                </button>
              </motion.div>
            ) : (
              <div className="space-y-1.5">
                {mergedMyListings.map((group, i) => (
                  <MyListingRow
                    key={group.ids.join(',')}
                    group={group}
                    cancellingId={cancellingId}
                    onCancel={(g) => setCancelTarget(g)}
                    index={i}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="tab-history"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded border border-white/[0.06] bg-surface-1/50 p-3 flex items-center gap-2.5">
                    <SkeletonBlock className="w-9 h-9 rounded shrink-0" />
                    <div className="flex-1 space-y-2"><SkeletonBlock className="h-3 w-28" /></div>
                    <SkeletonBlock className="h-5 w-12 rounded-md" />
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-14 text-center rounded-card border border-white/[0.06] bg-surface-1/40"
              >
                <span className="text-4xl mb-3 block opacity-40">📜</span>
                <p className="text-xs text-gray-400 font-medium">No trade history yet</p>
              </motion.div>
            ) : (
              <div className="space-y-1.5">
                {history.map((entry, i) => (
                  <HistoryRow key={entry.id} entry={entry} userId={user?.id ?? ''} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Offers modal (all price tiers for an item) ─────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {offersTarget && (
            <motion.div
              key="offers-overlay"
              {...MODAL_OVERLAY}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
              onClick={() => setOffersTarget(null)}
            >
              <motion.div
                {...MODAL_CARD}
                className="w-[320px] rounded-card bg-surface-1 border border-white/10 p-4 flex flex-col shadow-2xl max-h-[80vh] overflow-y-auto"
                style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const meta = getItemMeta(offersTarget.itemId)
                  const theme = RARITY_THEME[normalizeRarity(meta.rarity)] ?? RARITY_THEME.common
                  return (
                    <>
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-11 h-11 rounded flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${theme.color}18`, border: `1px solid ${theme.border}`, boxShadow: `0 0 16px ${theme.glow}` }}
                        >
                          <LootVisualShared icon={meta.icon} image={meta.image} className="w-7 h-7 object-contain" scale={meta.scale} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{meta.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span
                              className="text-micro font-medium px-1.5 py-px rounded capitalize"
                              style={{ color: theme.color, backgroundColor: `${theme.color}18` }}
                            >{meta.rarity}</span>
                            <span className="text-micro text-gray-500">{offersTarget.offers.length} offer{offersTarget.offers.length !== 1 ? 's' : ''} · {offersTarget.totalQty} total</span>
                            <span className="flex items-center gap-0.5 px-1.5 py-px rounded bg-green-500/12 border border-green-500/25 text-micro font-bold text-green-400 font-mono">
                              🏷 {fmt(offersTarget.floorPrice)}g
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOffersTarget(null)}
                          className="w-6 h-6 flex items-center justify-center rounded-md border border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 text-xs shrink-0 transition-colors"
                        >✕</button>
                      </div>

                      {/* Price history sparkline */}
                      {priceHistory.length >= 2 && (
                        <div className="flex flex-col items-center gap-1 mb-3 pb-3 border-b border-white/[0.06]">
                          <PriceSparkline prices={priceHistory.map((p) => p.price_gold)} width={120} height={28} />
                          <p className="text-micro text-gray-600 font-mono">last {priceHistory.length} sales</p>
                        </div>
                      )}

                      {/* Offer rows */}
                      <div className="space-y-1.5">
                        {offersTarget.offers.map((offer, i) => {
                          const canAfford = (gold ?? 0) >= offer.pricePerUnit
                          const isFloor = i === 0
                          const aboveFloor = !isFloor ? offer.pricePerUnit - offersTarget.floorPrice : 0
                          const abovePct = !isFloor && offersTarget.floorPrice > 0 ? Math.round((aboveFloor / offersTarget.floorPrice) * 100) : 0
                          return (
                            <div
                              key={offer.pricePerUnit}
                              className={`flex items-center gap-2.5 px-2.5 py-2 rounded border transition-colors ${isFloor ? 'border-green-500/20 bg-green-500/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}
                            >
                              {/* Price */}
                              <div className="shrink-0 flex flex-col items-center gap-0.5">
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-md border ${isFloor ? 'bg-green-500/10 border-green-500/25' : 'bg-amber-500/8 border-amber-500/15'}`}>
                                  <span className={`text-micro ${isFloor ? 'text-green-400' : 'text-amber-400'}`}>🪙</span>
                                  <span className={`font-bold text-caption tabular-nums ${isFloor ? 'text-green-400' : 'text-amber-400'}`}>{fmt(offer.pricePerUnit)}</span>
                                </div>
                                {isFloor
                                  ? <span className="text-micro font-mono text-green-400/70 tracking-wide">floor</span>
                                  : <span className="text-micro font-mono text-gray-600">+{aboveFloor}g ({abovePct}%)</span>
                                }
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-micro text-gray-300 truncate">
                                  {offer.sellers.length === 1 ? offer.sellers[0] : `${offer.sellers.length} sellers`}
                                </p>
                                <p className="text-micro text-gray-600">×{offer.totalQty} available</p>
                              </div>
                              {/* Buy button */}
                              <button
                                type="button"
                                onClick={() => { setOffersTarget(null); handleBuyClick(offersTarget.itemId, offer) }}
                                disabled={!canAfford}
                                className="px-2.5 py-1.5 rounded border text-micro font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 bg-accent/15 border-accent/35 text-accent hover:bg-accent/25"
                              >
                                {canAfford ? 'Buy' : 'Can\'t afford'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ─── Buy confirmation modal ────────────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {buyTarget && (
            <motion.div
              key="buy-overlay"
              {...MODAL_OVERLAY}
              className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
              onClick={() => { if (!buying) setBuyTarget(null) }}
            >
              <motion.div
                {...MODAL_CARD}
                className="w-[320px] rounded-card bg-surface-1 border border-white/10 p-5 flex flex-col shadow-2xl"
                style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const { itemId, offer } = buyTarget
                  const meta = getItemMeta(itemId)
                  const theme = RARITY_THEME[normalizeRarity(meta.rarity)] ?? RARITY_THEME.common
                  const maxQty = offer.totalQty
                  const clampedBuyQty = Math.max(1, Math.min(maxQty, buyQty))
                  const buyCost = offer.pricePerUnit * clampedBuyQty
                  const canAfford = (gold ?? 0) >= buyCost
                  return (
                    <>
                      <div className="flex flex-col items-center mb-4">
                        <div
                          className="w-16 h-16 rounded flex items-center justify-center mb-2.5 relative"
                          style={{ backgroundColor: `${theme.color}18`, border: `1px solid ${theme.border}`, boxShadow: `0 0 24px ${theme.glow}` }}
                        >
                          <LootVisualShared icon={meta.icon} image={meta.image} className="w-11 h-11 object-contain" scale={meta.scale} />
                        </div>
                        <p className="text-sm font-semibold text-white text-center">{meta.name}</p>
                        <span
                          className="inline-flex mt-1 text-micro px-2 py-0.5 rounded-md border font-mono uppercase tracking-wide"
                          style={{ color: theme.color, borderColor: theme.border, backgroundColor: `${theme.color}1A` }}
                        >
                          {meta.rarity}
                        </span>
                        {meta.item && getItemPerkDescription(meta.item) && (
                          <p className="text-micro text-gray-400 text-center mt-1.5 leading-snug max-w-[220px]">{getItemPerkDescription(meta.item)}</p>
                        )}
                        {/* Price history sparkline */}
                        {priceHistory.length >= 2 && (
                          <div className="flex flex-col items-center gap-1 mt-2">
                            <PriceSparkline prices={priceHistory.map((p) => p.price_gold)} width={120} height={28} />
                            <p className="text-micro text-gray-600 font-mono">last {priceHistory.length} sales</p>
                          </div>
                        )}
                      </div>

                      {maxQty > 1 && (
                        <div className="mb-3 rounded bg-black/20 border border-white/[0.06] p-3">
                          <p className="text-micro text-gray-500 font-mono mb-2.5 text-center">
                            Available: {maxQty} · {offer.pricePerUnit} 🪙 each
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setBuyQty((q) => Math.max(1, q - 1))}
                              disabled={buying}
                              className="w-8 h-8 rounded border border-white/15 text-gray-300 hover:bg-white/10 text-sm font-bold transition-colors active:scale-90 disabled:opacity-40"
                            >−</button>
                            <input
                              type="number"
                              min={1} max={maxQty} value={buyQty}
                              disabled={buying}
                              onChange={(e) => setBuyQty(Math.max(1, Math.min(maxQty, Math.floor(Number(e.target.value) || 1))))}
                              className="grindly-no-spinner w-16 text-center bg-surface-0 border border-white/10 rounded text-white text-sm font-bold py-1.5 outline-none focus:border-accent/40 disabled:opacity-40"
                            />
                            <button
                              type="button"
                              onClick={() => setBuyQty((q) => Math.min(maxQty, q + 1))}
                              disabled={buying}
                              className="w-8 h-8 rounded border border-white/15 text-gray-300 hover:bg-white/10 text-sm font-bold transition-colors active:scale-90 disabled:opacity-40"
                            >+</button>
                            <button
                              type="button"
                              onClick={() => setBuyQty(maxQty)}
                              disabled={buying}
                              className="px-2.5 py-1 rounded border border-white/15 text-gray-400 text-micro hover:bg-white/10 transition-colors disabled:opacity-40"
                            >Max</button>
                          </div>
                        </div>
                      )}

                      <div className={`flex flex-col items-center gap-1 mb-4 px-3 py-2.5 rounded border ${canAfford ? 'bg-amber-500/8 border-amber-500/20' : 'bg-red-500/8 border-red-500/20'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-400">🪙</span>
                          <span className={`font-bold text-base tabular-nums ${canAfford ? 'text-amber-400' : 'text-red-400'}`}>{buyCost}</span>
                          <span className="text-gray-500 text-xs">gold</span>
                          {!canAfford && <span className="text-red-400 text-micro ml-1">({buyCost - (gold ?? 0)} short)</span>}
                        </div>
                        {clampedBuyQty > 1 && (
                          <p className="text-micro text-gray-500 font-mono">
                            {clampedBuyQty} × {offer.pricePerUnit} 🪙
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setBuyTarget(null)}
                          disabled={buying}
                          className="flex-1 py-2.5 rounded border border-white/15 text-gray-400 text-xs hover:bg-white/5 transition-colors disabled:opacity-40 active:scale-[0.97]"
                        >Cancel</button>
                        <button
                          type="button"
                          onClick={() => handleBuy(clampedBuyQty)}
                          disabled={!canAfford || buying}
                          className="flex-1 py-2.5 rounded bg-accent/20 border border-accent/40 text-accent text-xs font-semibold hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                        >
                          {buying ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                              Buying...
                            </span>
                          ) : maxQty > 1 ? `Buy ×${clampedBuyQty}` : 'Buy'}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ─── Cancel confirmation modal ─────────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {cancelTarget && (
            <motion.div
              key="cancel-overlay"
              {...MODAL_OVERLAY}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
              onClick={() => { setCancelTarget(null); setCancelError(null) }}
            >
              <motion.div
                {...MODAL_CARD}
                className="w-[300px] rounded-card bg-surface-1 border border-white/10 p-5 flex flex-col shadow-2xl"
                style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const meta = getItemMeta(cancelTarget.rep.item_id)
                  const theme = getRarityTheme(meta.rarity)
                  return (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${theme.color}15`, border: `1px solid ${theme.border}` }}
                        >
                          <LootVisualShared icon={meta.icon} image={meta.image} className="w-6 h-6 object-contain" scale={meta.scale} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Cancel {cancelTarget.ids.length > 1 ? `${cancelTarget.ids.length} listings` : 'listing'}?
                          </p>
                          <p className="text-micro text-gray-500 mt-0.5">
                            {meta.name}{cancelTarget.totalQty > 1 ? ` ×${cancelTarget.totalQty}` : ''} → inventory
                          </p>
                        </div>
                      </div>
                      {cancelError && <p className="text-caption text-red-400 mb-3">{cancelError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setCancelTarget(null); setCancelError(null) }}
                          className="flex-1 py-2.5 rounded border border-white/15 text-gray-400 text-xs hover:bg-white/5 transition-colors active:scale-[0.97]"
                        >Keep</button>
                        <button
                          type="button"
                          disabled={cancelTarget.ids.some((id) => cancellingId === id)}
                          onClick={() => handleCancelConfirm(cancelTarget)}
                          className="flex-1 py-2.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 disabled:opacity-50 transition-all active:scale-[0.97]"
                        >
                          {cancelTarget.ids.some((id) => cancellingId === id) ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                              Cancelling...
                            </span>
                          ) : cancelTarget.ids.length > 1 ? `Cancel all` : 'Cancel listing'}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}



      {/* showBackpack handled above */}
    </div>
  )
}
