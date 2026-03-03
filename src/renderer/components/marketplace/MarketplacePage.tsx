import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { LOOT_ITEMS, getRarityTheme, getItemPower, MARKETPLACE_BLOCKED_ITEMS, estimateLootDropRate, type LootRarity } from '../../lib/loot'
import { getFarmItemDisplay } from '../../lib/farming'
import { SKILLS } from '../../lib/skills'
import { fetchActiveListings, buyListing, cancelListing, expireOldListings, type ListingWithSeller } from '../../services/marketplaceService'
import { useGoldStore } from '../../stores/goldStore'
import { useAuthStore } from '../../stores/authStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { supabase } from '../../lib/supabase'
import { useFarmStore } from '../../stores/farmStore'
import { PageHeader } from '../shared/PageHeader'
import { GoldDisplay } from './GoldDisplay'
import { SkeletonBlock } from '../shared/PageLoading'
import { playClickSound } from '../../lib/sounds'
import { RARITY_THEME, SLOT_LABEL, LootVisual as LootVisualShared, normalizeRarity } from '../loot/LootUI'

const RARITY_ORDER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']

function ListingCard({
  listing,
  user,
  gold,
  buyingId,
  cancellingId,
  onBuy,
  onCancelClick,
}: {
  listing: ListingWithSeller
  user: { id: string } | null
  gold: number | null
  buyingId: string | null
  cancellingId: string | null
  onBuy: (l: ListingWithSeller) => void
  onCancelClick: (l: ListingWithSeller) => void
}) {
  const item = LOOT_ITEMS.find((x) => x.id === listing.item_id)
  const farmDisplay = !item ? getFarmItemDisplay(listing.item_id) : null
  const displayRarity = item?.rarity ?? farmDisplay?.rarity ?? 'common'
  const theme = getRarityTheme(displayRarity)
  const isOwn = user?.id === listing.seller_id
  const canAfford = (gold ?? 0) >= listing.price_gold

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="group rounded-2xl border p-4 flex items-center gap-4 transition-all duration-200 hover:border-white/15 hover:shadow-lg"
      style={{ borderColor: theme.border, backgroundColor: `${theme.color}08` }}
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 relative"
        style={{ borderColor: theme.border, borderWidth: 1, backgroundColor: `${theme.color}15` }}
      >
        <LootVisualShared
          icon={item?.icon ?? farmDisplay?.icon ?? '📦'}
          image={item?.image}
          className="w-9 h-9 object-contain"
          scale={item?.renderScale ?? 1}
        />
        {listing.quantity > 1 && (
          <span
            className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
            style={{ color: theme.color, backgroundColor: '#11111b', borderColor: theme.border }}
          >
            ×{listing.quantity}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{item?.name ?? farmDisplay?.name ?? listing.item_id}</p>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{item?.perkDescription ?? ''}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-md capitalize"
            style={{ color: theme.color, backgroundColor: `${theme.color}18` }}
          >
            {displayRarity}
          </span>
          {item && <span className="text-[10px] text-gray-500">IP {getItemPower(item.rarity)}</span>}
          <span className="text-[10px] text-gray-500 truncate">
            by {listing.seller_username ?? 'Anonymous'}
          </span>
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-500/25">
          <span className="text-amber-400" aria-hidden>🪙</span>
          <span className="text-amber-400 font-bold tabular-nums text-sm">{listing.price_gold}</span>
        </div>
        {isOwn ? (
          <button
            type="button"
            onClick={() => onCancelClick(listing)}
            disabled={cancellingId === listing.id}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {cancellingId === listing.id ? '...' : 'Remove'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onBuy(listing)}
            disabled={buyingId === listing.id}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              canAfford
                ? 'bg-cyber-neon/20 border-cyber-neon/40 text-cyber-neon hover:bg-cyber-neon/30'
                : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
            }`}
          >
            {buyingId === listing.id ? '...' : 'Buy'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

interface MarketplacePageProps {
  onBack?: () => void
}


export function MarketplacePage({ onBack }: MarketplacePageProps) {
  const [listings, setListings] = useState<ListingWithSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [buyConfirmTarget, setBuyConfirmTarget] = useState<ListingWithSeller | null>(null)
  const [noGoldAlert, setNoGoldAlert] = useState<ListingWithSeller | null>(null)
  const [noGoldTimer, setNoGoldTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelConfirmTarget, setCancelConfirmTarget] = useState<ListingWithSeller | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const infoRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [perkFilter, setPerkFilter] = useState<'' | 'combat' | 'xp' | 'drops' | 'cosmetic'>('')
  const [skillFilter, setSkillFilter] = useState<string>('')
  const [rarityFilter, setRarityFilter] = useState<string>('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'newest'>('newest')
  const [myListingsOpen, setMyListingsOpen] = useState(true)
  const gold = useGoldStore((s) => s.gold)
  const syncFromSupabase = useGoldStore((s) => s.syncFromSupabase)
  const user = useAuthStore((s) => s.user)

  const filteredListings = useMemo(() => {
    let result = listings.filter((l) => !MARKETPLACE_BLOCKED_ITEMS.includes(l.item_id))
    const searchLower = search.trim().toLowerCase()
    if (searchLower) {
      result = result.filter((l) => {
        const item = LOOT_ITEMS.find((x) => x.id === l.item_id)
        const name = item?.name ?? getFarmItemDisplay(l.item_id)?.name ?? l.item_id
        return name.toLowerCase().includes(searchLower)
      })
    }
    if (perkFilter) {
      result = result.filter((l) => {
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
        const item = LOOT_ITEMS.find((x) => x.id === l.item_id)
        const rarity = item?.rarity ?? getFarmItemDisplay(l.item_id)?.rarity ?? 'common'
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

  const loadListings = async (withExpiry = false) => {
    setLoading(true)
    if (withExpiry) await expireOldListings()
    const data = await fetchActiveListings()
    setListings(data)
    setLoading(false)
  }

  useEffect(() => {
    loadListings(true)
  }, [])

  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel('marketplace-listings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_listings' }, () => {
        loadListings(false) // no expiry — avoids triggering another UPDATE → infinite loop
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (user) syncFromSupabase(user.id)
  }, [user, syncFromSupabase])

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowInfo(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showInfo])

  const showNoGoldAlert = (listing: ListingWithSeller) => {
    if (noGoldTimer) clearTimeout(noGoldTimer)
    setNoGoldAlert(listing)
    const t = setTimeout(() => setNoGoldAlert(null), 4000)
    setNoGoldTimer(t)
  }

  const handleBuyClick = (listing: ListingWithSeller) => {
    if (!user) return
    if ((gold ?? 0) < listing.price_gold) {
      showNoGoldAlert(listing)
      return
    }
    setBuyConfirmTarget(listing)
  }

  const handleBuy = async (listing: ListingWithSeller) => {
    setBuyConfirmTarget(null)
    if (!user) return
    setBuyingId(listing.id)
    const res = await buyListing(listing.id)
    setBuyingId(null)
    if (res.ok) {
      playClickSound()
      syncFromSupabase(user.id)
      const { items, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      const merged = await syncInventoryToSupabase(items, chests, { merge: true, seeds, seedZips })
      if (merged.ok && merged.mergedChests) {
        if (merged.mergedItems) useInventoryStore.getState().mergeFromCloud(merged.mergedItems, merged.mergedChests)
        if (merged.mergedSeeds) useFarmStore.getState().mergeSeedsFromCloud(merged.mergedSeeds)
        if (merged.mergedSeedZips) useFarmStore.getState().mergeSeedZipsFromCloud(merged.mergedSeedZips)
      }
      loadListings()
    }
  }

  const handleCancel = async (listing: ListingWithSeller) => {
    if (!user || listing.seller_id !== user.id) return
    setCancellingId(listing.id)
    setCancelError(null)
    const res = await cancelListing(listing.id)
    setCancellingId(null)
    if (res.ok) {
      playClickSound()
      setCancelConfirmTarget(null)
      const { items, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      const merged = await syncInventoryToSupabase(items, chests, { merge: true, seeds, seedZips })
      if (merged.ok && merged.mergedChests) {
        if (merged.mergedItems) useInventoryStore.getState().mergeFromCloud(merged.mergedItems, merged.mergedChests)
        if (merged.mergedSeeds) useFarmStore.getState().mergeSeedsFromCloud(merged.mergedSeeds)
        if (merged.mergedSeedZips) useFarmStore.getState().mergeSeedZipsFromCloud(merged.mergedSeedZips)
      }
      loadListings()
    } else {
      setCancelError(res.error ?? 'Failed to remove listing')
    }
  }

  const activeFiltersCount = [search, perkFilter, skillFilter, rarityFilter, priceMin, priceMax].filter(Boolean).length
  const clearFilters = () => {
    setSearch('')
    setPerkFilter('')
    setSkillFilter('')
    setRarityFilter('')
    setPriceMin('')
    setPriceMax('')
    setSortBy('newest')
  }

  const myListings = filteredListings.filter((l) => user?.id === l.seller_id)
  const otherListings = filteredListings.filter((l) => user?.id !== l.seller_id)
  const totalVisible = listings.filter((l) => !MARKETPLACE_BLOCKED_ITEMS.includes(l.item_id)).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-4 pb-20 space-y-4"
    >
      <PageHeader
        title="Marketplace"
        onBack={onBack}
        rightSlot={<GoldDisplay />}
        titleSlot={
          <div className="relative" ref={infoRef}>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className={`w-[18px] h-[18px] rounded-full border text-[10px] font-bold flex items-center justify-center transition-colors ${
                showInfo
                  ? 'border-cyber-neon/50 text-cyber-neon bg-cyber-neon/10'
                  : 'border-white/20 text-gray-500 hover:text-gray-300 hover:border-white/35'
              }`}
            >
              ?
            </button>
            {showInfo && (
              <div className="absolute left-0 top-6 z-50 w-60 rounded-xl border border-white/10 bg-[#1a1a2e]/95 p-3 shadow-2xl backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-2">How it works</p>
                <ul className="space-y-1.5">
                  {[
                    'Buy and sell gear with other players.',
                    'List items from the Inventory tab.',
                    'Listings expire after 7 days — items return to your inventory.',
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-1.5">
                      <span className="text-cyber-neon/60 mt-px text-[9px] leading-tight shrink-0">▸</span>
                      <span className="text-[11px] text-gray-300 leading-snug">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="space-y-2">
        {/* Search + sort */}
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${totalVisible} listing${totalVisible !== 1 ? 's' : ''}…`}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-xs placeholder-gray-500 focus:border-cyber-neon/40 outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => setSortBy((s) => s === 'price_asc' ? 'price_desc' : s === 'price_desc' ? 'newest' : 'price_asc')}
            className="px-2.5 py-1.5 rounded-lg bg-[#11111b] border border-white/[0.08] text-gray-400 text-xs hover:text-white transition-colors whitespace-nowrap"
          >
            {sortBy === 'newest' ? '🕒 New' : `🪙 ${sortBy === 'price_asc' ? '↑' : '↓'}`}
          </button>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-2.5 py-1.5 rounded-lg bg-[#11111b] border border-cyber-neon/30 text-cyber-neon text-xs hover:bg-cyber-neon/10 transition-colors whitespace-nowrap"
            >
              Clear ({activeFiltersCount})
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: '', label: 'All' },
            { id: 'combat', label: '⚔ Combat' },
            { id: 'xp', label: '📈 XP' },
            { id: 'drops', label: '🎁 Drops' },
            { id: 'cosmetic', label: '✨ Cosmetic' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setPerkFilter(f.id); setSkillFilter('') }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                perkFilter === f.id
                  ? 'border-cyber-neon/50 bg-cyber-neon/12 text-cyber-neon'
                  : 'border-white/[0.07] bg-[#11111b] text-gray-500 hover:text-gray-300 hover:border-white/15'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Skill sub-chips — only when XP selected */}
        {perkFilter === 'xp' && (
          <div className="flex flex-wrap gap-1">
            {SKILLS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSkillFilter((prev) => prev === s.id ? '' : s.id)}
                className={`px-2 py-0.5 rounded-md border text-[10px] transition-all ${
                  skillFilter === s.id
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/[0.06] text-gray-600 hover:text-gray-400 hover:border-white/12'
                }`}
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Rarity + price */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {RARITY_ORDER.map((r) => {
            const t = RARITY_THEME[normalizeRarity(r)]
            const active = rarityFilter === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRarityFilter((prev) => prev === r ? '' : r)}
                className="px-2.5 py-1 rounded-lg border text-[11px] font-medium capitalize transition-all"
                style={active
                  ? { borderColor: t.border, background: `${t.glow}18`, color: t.color }
                  : { borderColor: 'rgba(255,255,255,0.07)', background: '#11111b', color: '#6b7280' }}
              >
                {r}
              </button>
            )
          })}
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="number" min={0} value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="Min"
              className="grindly-no-spinner w-14 px-2 py-1 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-[11px] placeholder-gray-600 focus:border-cyber-neon/40 outline-none text-center"
            />
            <span className="text-gray-600 text-xs">–</span>
            <input
              type="number" min={0} value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="Max"
              className="grindly-no-spinner w-14 px-2 py-1 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-[11px] placeholder-gray-600 focus:border-cyber-neon/40 outline-none text-center"
            />
            <span className="text-amber-400/70 text-xs">🪙</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-[#1e1e2e]/50 p-4 flex items-center gap-4">
              <SkeletonBlock className="w-14 h-14 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-3 w-48" />
                <div className="flex gap-2 flex-wrap">
                  <SkeletonBlock className="h-5 w-14 rounded-md" />
                  <SkeletonBlock className="h-5 w-12 rounded" />
                  <SkeletonBlock className="h-5 w-16 rounded" />
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <SkeletonBlock className="h-8 w-16 rounded-xl" />
                <SkeletonBlock className="h-9 w-16 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : totalVisible === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-white/[0.06] bg-[#1e1e2e]/50">
          <span className="text-5xl mb-4 block opacity-60">🛒</span>
          <p className="text-sm font-medium text-gray-300">Marketplace is empty</p>
          <p className="text-xs text-gray-500 mt-1.5">List items from your inventory to get started.</p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-white/[0.06] bg-[#1e1e2e]/50">
          <span className="text-5xl mb-4 block opacity-60">🔍</span>
          <p className="text-sm font-medium text-gray-300">No listings match your filters</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 px-4 py-1.5 rounded-lg border border-cyber-neon/30 text-cyber-neon text-xs hover:bg-cyber-neon/10 transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* My Listings section */}
          {myListings.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#1e1e2e]/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setMyListingsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">My Listings</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyber-neon/15 text-cyber-neon font-bold">{myListings.length}</span>
                </div>
                <span className="text-gray-500 text-[10px]">{myListingsOpen ? '▾' : '▸'}</span>
              </button>
              {myListingsOpen && (
                <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                  {myListings.map((listing) => <ListingCard key={listing.id} listing={listing} user={user} gold={gold} buyingId={buyingId} cancellingId={cancellingId} onBuy={handleBuyClick} onCancelClick={(l) => { setCancelError(null); setCancelConfirmTarget(l) }} />)}
                </div>
              )}
            </div>
          )}

          {/* Other listings */}
          {otherListings.length > 0 && (
            <div className="space-y-3">
              {otherListings.map((listing) => <ListingCard key={listing.id} listing={listing} user={user} gold={gold} buyingId={buyingId} cancellingId={cancellingId} onBuy={handleBuyClick} onCancelClick={(l) => { setCancelError(null); setCancelConfirmTarget(l) }} />)}
            </div>
          )}
        </div>
      )}

      {/* No gold toast — top right */}
      {noGoldAlert &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const alertItem = LOOT_ITEMS.find((x) => x.id === noGoldAlert.item_id)
            const alertFarm = !alertItem ? getFarmItemDisplay(noGoldAlert.item_id) : null
            const alertRarity = normalizeRarity(alertItem?.rarity ?? alertFarm?.rarity)
            const alertTheme = RARITY_THEME[alertRarity]
            const deficit = noGoldAlert.price_gold - (gold ?? 0)
            const dropRate = alertItem ? estimateLootDropRate(alertItem.id, { source: 'skill_grind', focusCategory: 'coding' }) : 0
            return (
              <motion.div
                key="no-gold-alert"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="fixed top-16 right-4 z-[200] w-[300px] rounded-xl border overflow-hidden shadow-2xl"
                style={{
                  borderColor: alertTheme.border,
                  background: alertTheme.panel,
                  boxShadow: `0 0 28px ${alertTheme.glow}`,
                }}
              >
                {/* animated radial glow */}
                <motion.div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 18%, ${alertTheme.glow} 0%, transparent 58%)` }}
                  animate={{ opacity: [0.3, 0.55, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />

                <div className="relative p-4">
                  {/* close */}
                  <button
                    type="button"
                    onClick={() => setNoGoldAlert(null)}
                    className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 text-xs leading-none transition-colors z-10"
                  >
                    ✕
                  </button>

                  {/* large centered item visual */}
                  <div className="flex flex-col items-center mb-3">
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center mb-2.5"
                      style={{ backgroundColor: `${alertTheme.color}18`, border: `1px solid ${alertTheme.border}`, boxShadow: `0 0 20px ${alertTheme.glow}` }}
                    >
                      <LootVisualShared
                        icon={alertItem?.icon ?? alertFarm?.icon ?? '📦'}
                        image={alertItem?.image}
                        className="w-14 h-14 object-contain"
                        scale={alertItem?.renderScale ?? 1}
                      />
                    </div>
                    <p className="text-sm font-semibold text-white text-center leading-tight">{alertItem?.name ?? alertFarm?.name ?? noGoldAlert.item_id}</p>
                    <span
                      className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded border font-mono uppercase tracking-wide"
                      style={{ color: alertTheme.color, borderColor: alertTheme.border, backgroundColor: `${alertTheme.color}1A` }}
                    >
                      {alertRarity}
                    </span>
                  </div>

                  {/* stats block */}
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 space-y-1 mb-3">
                    {alertItem && (
                      <>
                        <p className="text-[10px] text-gray-300"><span className="text-gray-500">Slot:</span> {SLOT_LABEL[alertItem.slot]}</p>
                        <p className="text-[10px]" style={{ color: alertTheme.color }}><span className="text-gray-500">Effect:</span> {alertItem.perkDescription}</p>
                        <p className="text-[10px] text-gray-300"><span className="text-gray-500">Drop rate:</span> ~{dropRate}%</p>
                      </>
                    )}
                    <p className="text-[10px] text-gray-300"><span className="text-gray-500">Seller:</span> {noGoldAlert.seller_username ?? 'Anonymous'}</p>
                  </div>

                  {/* price row */}
                  <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl bg-black/30">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🪙</span>
                      <span className="text-amber-400 font-bold text-sm tabular-nums">{noGoldAlert.price_gold}</span>
                    </div>
                    <span className="text-[11px] text-red-400 font-medium">−{deficit} short</span>
                  </div>

                  {/* disabled buy */}
                  <button
                    type="button"
                    disabled
                    className="w-full py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
                  >
                    Need {deficit} more 🪙 to buy
                  </button>
                </div>
              </motion.div>
            )
          })(),
          document.body,
        )}

      {/* Buy confirmation modal */}
      {buyConfirmTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setBuyConfirmTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-[320px] rounded-xl bg-discord-card border border-white/10 p-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const item = LOOT_ITEMS.find((x) => x.id === buyConfirmTarget.item_id)
                const confirmFarm = !item ? getFarmItemDisplay(buyConfirmTarget.item_id) : null
                const confirmRarity = normalizeRarity(item?.rarity ?? confirmFarm?.rarity)
                const confirmTheme = RARITY_THEME[confirmRarity]
                return (
                  <>
                    {/* large centered item visual */}
                    <div className="flex flex-col items-center mb-4">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-2.5"
                        style={{ backgroundColor: `${confirmTheme.color}18`, border: `1px solid ${confirmTheme.border}`, boxShadow: `0 0 20px ${confirmTheme.glow}` }}
                      >
                        <LootVisualShared
                          icon={item?.icon ?? confirmFarm?.icon ?? '📦'}
                          image={item?.image}
                          className="w-14 h-14 object-contain"
                          scale={item?.renderScale ?? 1}
                        />
                      </div>
                      <p className="text-sm font-semibold text-white text-center">{item?.name ?? confirmFarm?.name ?? buyConfirmTarget.item_id}</p>
                      <span
                        className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded border font-mono uppercase tracking-wide"
                        style={{ color: confirmTheme.color, borderColor: confirmTheme.border, backgroundColor: `${confirmTheme.color}1A` }}
                      >
                        {confirmRarity}
                      </span>
                      {item?.perkDescription && (
                        <p className="text-[11px] text-gray-400 text-center mt-1.5 leading-snug">{item.perkDescription}</p>
                      )}
                    </div>

                    {/* price */}
                    <div className="flex items-center justify-center gap-1.5 mb-4 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/20">
                      <span className="text-amber-400">🪙</span>
                      <span className="text-amber-400 font-bold tabular-nums">{buyConfirmTarget.price_gold}</span>
                      <span className="text-gray-500 text-xs">gold</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setBuyConfirmTarget(null)}
                        className="flex-1 py-2 rounded-lg border border-white/15 text-gray-400 text-xs hover:bg-white/5"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBuy(buyConfirmTarget)}
                        className="flex-1 py-2 rounded-lg bg-cyber-neon/20 border border-cyber-neon/40 text-cyber-neon text-xs font-semibold hover:bg-cyber-neon/30"
                      >
                        Buy
                      </button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </div>,
          document.body,
        )}

      {/* Remove confirmation modal */}
      {cancelConfirmTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              setCancelConfirmTarget(null)
              setCancelError(null)
            }}
          >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-[320px] rounded-xl bg-discord-card border border-white/10 p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-white mb-1">Remove listing?</p>
            <p className="text-[11px] text-gray-400 mb-4">
              {LOOT_ITEMS.find((x) => x.id === cancelConfirmTarget.item_id)?.name ?? getFarmItemDisplay(cancelConfirmTarget.item_id)?.name ?? cancelConfirmTarget.item_id} will return to your inventory.
            </p>
            {cancelError && (
              <p className="text-[11px] text-red-400 mb-3">{cancelError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelConfirmTarget(null)
                  setCancelError(null)
                }}
                className="flex-1 py-2 rounded-lg border border-white/15 text-gray-400 text-xs hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCancel(cancelConfirmTarget)}
                disabled={cancellingId === cancelConfirmTarget.id}
                className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-semibold hover:bg-red-500/30 disabled:opacity-50"
              >
                {cancellingId === cancelConfirmTarget.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </motion.div>
        </div>
        , document.body
      )}
    </motion.div>
  )
}
