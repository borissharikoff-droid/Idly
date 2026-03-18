/**
 * Admin config — stored in localStorage so it's synchronous and fast.
 * Applied at app startup to patch LOOT_ITEMS and BOSSES in place.
 */
import { CHEST_DEFS, type LootItemDef, type LootItemPerk, type LootRarity, type LootSlot, type ChestType } from './loot'
import { SEED_DEFS, SEED_ZIP_LABELS, SEED_ZIP_ICONS, SEED_ZIP_IMAGES, type SeedZipTier } from './farming'
import type { BossDef, ZoneDef } from './combat'

const STORAGE_KEY = 'grindly_admin_config'

// Snapshot of original chest item weights taken at module load time.
// Used to restore defaults before applying admin overrides each call.
const ORIGINAL_CHEST_WEIGHTS: Partial<Record<ChestType, { itemId: string; weight: number }[]>> = {}
for (const [id, chest] of Object.entries(CHEST_DEFS)) {
  ORIGINAL_CHEST_WEIGHTS[id as ChestType] = chest.itemWeights.map((w) => ({ ...w }))
}

export interface ItemOverride {
  name?: string
  icon?: string
  image?: string
  rarity?: LootRarity
  description?: string
  perkType?: string
  perkValue?: number | string
  perkTarget?: string
  perkDescription?: string
  perks?: LootItemPerk[]
}

export interface CustomItem extends LootItemDef {
  _custom: true
}

export interface BossOverride {
  name?: string
  icon?: string
  image?: string
  hp?: number
  atk?: number
  rewards?: { gold?: number; lootChance?: number; lootTier?: string }
}

export interface ChestWeightEntry {
  itemId: string
  weight: number
}

export interface AdminConfig {
  itemOverrides?: Record<string, ItemOverride>
  hiddenItems?: string[]
  customItems?: Array<{
    id: string
    name: string
    slot: LootSlot
    rarity: LootRarity
    icon: string
    image?: string
    description: string
    perkType: string
    perkValue: number | string
    perkTarget?: string
    perkDescription: string
  }>
  bossOverrides?: Record<string, BossOverride>
  chestWeightOverrides?: Record<string, ChestWeightEntry[]>
  chestOverrides?: Record<string, { icon?: string; image?: string }>
  seedZipOverrides?: Record<string, { name?: string; icon?: string; image?: string }>
  seedOverrides?: Record<string, { name?: string; icon?: string; image?: string; rarity?: string; growTimeMinutes?: number; yieldPlantId?: string; yieldMin?: number; yieldMax?: number; xpOnPlant?: number; xpOnHarvest?: number }>
  zoneOverrides?: Record<string, {
    name?: string
    icon?: string
    image?: string
    mobs?: Record<string, {
      name?: string
      icon?: string
      image?: string
      hp?: number
      atk?: number
      xpReward?: number
      goldMin?: number
      goldMax?: number
      materialDropId?: string
      materialDropChance?: number
      materialDropQty?: number
    }>
  }>
  craftOverrides?: Record<string, {
    levelRequired?: number
    xpPerItem?: number
    craftTimeSeconds?: number
    ingredients?: Record<string, number>
  }>
  /** UI icon overrides — navbar tabs, gold display, page headers, etc. */
  uiIcons?: {
    /** Navbar primary tab icons keyed by TabId */
    navTabs?: Record<string, string>
    /** Navbar secondary (More menu) tab icons keyed by TabId */
    navSecondaryTabs?: Record<string, string>
    /** Gold currency icon (default 🪙) */
    gold?: string
    /** More button icon override (emoji, default ···) */
    moreButton?: string
  }
}

export function loadAdminConfig(): AdminConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as AdminConfig
  } catch {
    return {}
  }
}

function saveAdminConfig(cfg: AdminConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

/** Get UI icon overrides (navbar, gold, etc.). Reads from cached localStorage. */
export function getUIIcons(): NonNullable<AdminConfig['uiIcons']> {
  return loadAdminConfig().uiIcons ?? {}
}

/** Fetch admin config from Supabase and cache locally. Call once after auth. */
export async function syncAdminConfigFromSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: { from: (table: string) => any },
): Promise<void> {
  try {
    const { data } = await supabaseClient
      .from('admin_config')
      .select('config')
      .eq('id', 'singleton')
      .maybeSingle()
    if (data?.config && typeof data.config === 'object') {
      saveAdminConfig(data.config as AdminConfig)
    }
  } catch {
    // offline or table missing — use cached config
  }
}

/** Apply overrides to LOOT_ITEMS, BOSSES, ZONES, and CRAFT_RECIPES in-place. Call once at app startup. */
export function applyAdminConfig(items: LootItemDef[], bosses: BossDef[], zones?: ZoneDef[], craftRecipes?: { id: string; levelRequired: number; xpPerItem: number; secPerItem: number; ingredients: { id: string; qty: number }[] }[]): void {
  const cfg = loadAdminConfig()

  // Patch existing items
  for (const [id, overrides] of Object.entries(cfg.itemOverrides ?? {})) {
    const item = items.find((x) => x.id === id)
    if (item) Object.assign(item, overrides)
  }

  // Remove hidden items
  const hidden = new Set(cfg.hiddenItems ?? [])
  if (hidden.size > 0) {
    const toRemove: number[] = []
    items.forEach((x, i) => { if (hidden.has(x.id)) toRemove.push(i) })
    for (let i = toRemove.length - 1; i >= 0; i--) items.splice(toRemove[i], 1)
  }

  // Append or update custom items
  const existingIds = new Set(items.map((x) => x.id))
  for (const custom of cfg.customItems ?? []) {
    if (existingIds.has(custom.id)) {
      // Update existing entry so dashboard edits take effect without restart
      const idx = items.findIndex((x) => x.id === custom.id)
      if (idx !== -1) Object.assign(items[idx], custom)
    } else {
      items.push(custom as unknown as LootItemDef)
      existingIds.add(custom.id)
    }
  }

  // Patch existing bosses
  for (const [id, overrides] of Object.entries(cfg.bossOverrides ?? {})) {
    const boss = bosses.find((x) => x.id === id)
    if (boss) {
      if (overrides.name !== undefined) boss.name = overrides.name
      if (overrides.icon !== undefined) boss.icon = overrides.icon
      if (overrides.image !== undefined) boss.image = overrides.image
      if (overrides.hp !== undefined) boss.hp = overrides.hp
      if (overrides.atk !== undefined) boss.atk = overrides.atk
      if (overrides.rewards) Object.assign(boss.rewards, overrides.rewards)
    }
  }

  // Apply seed zip overrides (name/icon/image per tier)
  const ZIP_TIERS: SeedZipTier[] = ['common', 'rare', 'epic', 'legendary']
  // Reset to defaults first so stale overrides don't linger
  for (const tier of ZIP_TIERS) {
    SEED_ZIP_LABELS[tier] = tier.charAt(0).toUpperCase() + tier.slice(1)
    SEED_ZIP_ICONS[tier]  = '🎒'
    SEED_ZIP_IMAGES[tier] = ''
  }
  for (const [tier, ov] of Object.entries(cfg.seedZipOverrides ?? {})) {
    if (!ZIP_TIERS.includes(tier as SeedZipTier)) continue
    const t = tier as SeedZipTier
    if (ov.name)  SEED_ZIP_LABELS[t] = ov.name
    if (ov.icon)  SEED_ZIP_ICONS[t]  = ov.icon
    if (ov.image) SEED_ZIP_IMAGES[t] = ov.image
  }

  // Apply seed overrides (name/icon/image per seed)
  for (const [id, ov] of Object.entries(cfg.seedOverrides ?? {})) {
    const seed = SEED_DEFS.find((s) => s.id === id)
    if (!seed) continue
    if (ov.name) seed.name = ov.name
    if (ov.icon) seed.icon = ov.icon
    if (ov.image) seed.image = ov.image
    if (ov.growTimeMinutes) seed.growTimeSeconds = ov.growTimeMinutes * 60
    if (ov.yieldMin !== undefined) seed.yieldMin = ov.yieldMin
    if (ov.yieldMax !== undefined) seed.yieldMax = ov.yieldMax
    if (ov.xpOnPlant !== undefined) seed.xpOnPlant = ov.xpOnPlant
    if (ov.xpOnHarvest !== undefined) seed.xpOnHarvest = ov.xpOnHarvest
    if (ov.rarity) seed.rarity = ov.rarity as LootRarity
  }

  // Apply chest weight overrides (custom item drop tables from dashboard)
  // First restore originals so removing an override takes effect without restart
  for (const [id, orig] of Object.entries(ORIGINAL_CHEST_WEIGHTS)) {
    const chest = CHEST_DEFS[id as ChestType]
    if (chest && orig) chest.itemWeights = orig.map((w) => ({ ...w }))
  }
  for (const [id, weights] of Object.entries(cfg.chestWeightOverrides ?? {})) {
    const chest = CHEST_DEFS[id as ChestType]
    if (chest) chest.itemWeights = weights
  }

  // Patch chest icon/image
  for (const [id, ov] of Object.entries(cfg.chestOverrides ?? {})) {
    const chest = CHEST_DEFS[id as ChestType]
    if (chest) {
      if (ov.icon) chest.icon = ov.icon
      if (ov.image) chest.image = ov.image
    }
  }

  // Apply zone & mob overrides
  if (zones) {
    for (const [zoneId, zOv] of Object.entries(cfg.zoneOverrides ?? {})) {
      const zone = zones.find((z) => z.id === zoneId)
      if (!zone) continue
      if (zOv.name) zone.name = zOv.name
      if (zOv.icon) zone.icon = zOv.icon
      if (zOv.image) zone.image = zOv.image
      for (const [mobId, mOv] of Object.entries(zOv.mobs ?? {})) {
        const mob = zone.mobs.find((m) => m.id === mobId)
        if (mob) Object.assign(mob, mOv)
      }
    }
  }

  // Apply craft recipe overrides
  if (craftRecipes) {
    for (const [recipeId, rOv] of Object.entries(cfg.craftOverrides ?? {})) {
      const recipe = craftRecipes.find((r) => r.id === recipeId)
      if (!recipe) continue
      if (rOv.levelRequired !== undefined) recipe.levelRequired = rOv.levelRequired
      if (rOv.xpPerItem !== undefined) recipe.xpPerItem = rOv.xpPerItem
      if (rOv.craftTimeSeconds !== undefined) recipe.secPerItem = rOv.craftTimeSeconds
      if (rOv.ingredients) {
        for (const ing of recipe.ingredients) {
          if (rOv.ingredients[ing.id] !== undefined) ing.qty = rOv.ingredients[ing.id]
        }
      }
    }
  }
}
