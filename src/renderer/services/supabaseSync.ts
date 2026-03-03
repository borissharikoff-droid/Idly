/**
 * SupabaseSync — syncs session and skill data to Supabase using the singleton client.
 * user_skills is the source for per-skill breakdown; profiles.level is updated by useProfileSync.
 * Sync runs on session end AND on app load so existing local XP appears in user_skills.
 */

import { supabase } from '../lib/supabase'
import { skillLevelFromXP, SKILLS, normalizeSkillId } from '../lib/skills'
import { isSeedId, isSeedZipId, seedZipTierFromItemId, SEED_ZIP_ITEM_IDS, type SeedZipTier } from '../lib/farming'
import type { ChestType } from '../lib/loot'

export interface SkillSyncResult {
  ok: boolean
  attempts: number
  syncedSkills: number
  lastSkillSyncAt: string | null
  error?: string
  /** Non-empty when local SQLite was all-zeros but cloud had XP — caller should restore to SQLite */
  cloudSkillRows?: { skill_id: string; total_xp: number }[]
}

export interface AchievementSyncResult {
  ok: boolean
  synced: number
  error?: string
}

export interface SkillXpEventSyncInput {
  skillId: string
  xpDelta: number
  source: string
  happenedAt?: string
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

type SkillPayloadFull = {
  user_id: string
  skill_id: string
  level: number
  total_xp: number
  updated_at: string
}

type SkillPayloadLevelOnly = {
  user_id: string
  skill_id: string
  level: number
  updated_at: string
}

type ExistingSkillRow = {
  id: string
  skill_id: string
  level?: number | null
  total_xp?: number | null
}

function mergeSkillPayload(
  local: SkillPayloadFull,
  existing?: ExistingSkillRow,
): SkillPayloadFull {
  const existingLevel = Math.max(0, Math.floor(existing?.level ?? 0))
  const existingXp = Math.max(0, Math.floor(existing?.total_xp ?? 0))
  const mergedXp = Math.max(local.total_xp, existingXp)
  return {
    ...local,
    total_xp: mergedXp,
    level: Math.max(local.level, existingLevel, skillLevelFromXP(mergedXp)),
  }
}

async function manualSyncWithoutConflict(
  userId: string,
  fullPayload: SkillPayloadFull[],
  levelOnlyPayload: SkillPayloadLevelOnly[],
): Promise<void> {
  if (!supabase) return

  const existingRes = await withTimeout(
    supabase
      .from('user_skills')
      .select('id, skill_id, level, total_xp')
      .eq('user_id', userId),
    10000,
    'user_skills select existing',
  )
  if (existingRes.error) throw existingRes.error

  const existingBySkill = new Map<string, ExistingSkillRow>()
  for (const row of existingRes.data || []) {
    const skillId = normalizeSkillId((row as { skill_id: string }).skill_id)
    const typed = row as ExistingSkillRow
    if (typed.id) existingBySkill.set(skillId, typed)
  }

  for (const row of fullPayload) {
    const existing = existingBySkill.get(row.skill_id)
    const merged = mergeSkillPayload(row, existing)
    if (existing?.id) {
      const updateRes = await withTimeout(
        supabase
          .from('user_skills')
          .update({
            level: merged.level,
            total_xp: merged.total_xp,
            updated_at: merged.updated_at,
          })
          .eq('id', existing.id),
        10000,
        'user_skills update full',
      )
      if (updateRes.error) {
        // Fallback for schemas without total_xp.
        const updateLevelOnlyRes = await withTimeout(
          supabase
            .from('user_skills')
            .update({
              level: merged.level,
              updated_at: merged.updated_at,
            })
            .eq('id', existing.id),
          10000,
          'user_skills update level-only',
        )
        if (updateLevelOnlyRes.error) throw updateLevelOnlyRes.error
      }
      continue
    }

    const insertRes = await withTimeout(
      supabase.from('user_skills').insert(merged),
      10000,
      'user_skills insert full',
    )
    if (insertRes.error) {
      const fallbackInsert = levelOnlyPayload.find((x) => x.skill_id === row.skill_id)
      if (!fallbackInsert) throw insertRes.error
      const insertLevelOnlyRes = await withTimeout(
        supabase.from('user_skills').insert(fallbackInsert),
        10000,
        'user_skills insert level-only',
      )
      if (insertLevelOnlyRes.error) throw insertLevelOnlyRes.error
    }
  }
}

/** Sync skill XP data to Supabase user_skills table. */
export async function syncSkillsToSupabase(
  api: NonNullable<Window['electronAPI']>,
  options: { maxAttempts?: number } = {},
): Promise<SkillSyncResult> {
  if (!supabase) {
    return {
      ok: false,
      attempts: 1,
      syncedSkills: 0,
      lastSkillSyncAt: null,
      error: 'Supabase not configured',
    }
  }

  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  let attempts = 0
  let lastError = 'Unknown sync failure'

  while (attempts < maxAttempts) {
    attempts += 1
    try {
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 10000, 'auth.getUser')
      if (!user) {
        return {
          ok: false,
          attempts,
          syncedSkills: 0,
          lastSkillSyncAt: null,
          error: 'No authenticated user',
        }
      }

      const allRows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
      const xpMap = new Map<string, number>()
      for (const row of allRows) {
        const id = normalizeSkillId(row.skill_id)
        xpMap.set(id, (xpMap.get(id) ?? 0) + (row.total_xp ?? 0))
      }

      const syncAt = new Date().toISOString()
      const localPayload = SKILLS.map((skill) => {
        const total_xp = xpMap.get(skill.id) ?? 0
        const level = skillLevelFromXP(total_xp)
        return {
          user_id: user.id,
          skill_id: skill.id,
          level,
          total_xp,
          updated_at: syncAt,
        }
      })
      const existingRes = await withTimeout(
        supabase
          .from('user_skills')
          .select('id, skill_id, level, total_xp')
          .eq('user_id', user.id),
        10000,
        'user_skills select existing before upsert',
      )
      if (existingRes.error) throw existingRes.error
      const existingBySkill = new Map<string, ExistingSkillRow>()
      for (const row of existingRes.data || []) {
        const typed = row as ExistingSkillRow
        existingBySkill.set(normalizeSkillId(typed.skill_id), typed)
      }
      const payload = localPayload.map((entry) => mergeSkillPayload(entry, existingBySkill.get(entry.skill_id)))

      // Detect skills where cloud has MORE XP than local → restore to SQLite so local is never behind cloud.
      // This handles: fresh installs, reinstalls, account logins on new machines, admin corrections.
      // restoreSkillXPFromCloud uses MAX() in SQL so it never reduces existing local XP.
      const cloudHigherRows = [...existingBySkill.values()]
        .filter((r) => {
          const cloudXp = r.total_xp ?? 0
          const localXp = xpMap.get(normalizeSkillId(r.skill_id)) ?? 0
          return cloudXp > localXp
        })
        .map((r) => ({ skill_id: normalizeSkillId(r.skill_id), total_xp: r.total_xp ?? 0 }))
      const cloudSkillRows = cloudHigherRows.length > 0 ? cloudHigherRows : undefined

      const primaryRes = await withTimeout(
        supabase
          .from('user_skills')
          .upsert(payload, { onConflict: 'user_id,skill_id' }),
        10000,
        'user_skills upsert',
      )
      if (primaryRes.error) {
        // Backward-compatible fallback: some deployments may not have total_xp yet.
        const levelOnlyPayload = payload.map(({ user_id, skill_id, level, updated_at }) => ({
          user_id,
          skill_id,
          level,
          updated_at,
        }))
        const fallbackRes = await withTimeout(
          supabase
            .from('user_skills')
            .upsert(levelOnlyPayload, { onConflict: 'user_id,skill_id' }),
          10000,
          'user_skills upsert level-only',
        )
        if (fallbackRes.error) {
          // Last-resort compatibility path for schemas without unique constraint
          // on (user_id, skill_id) or with partial migrations.
          await manualSyncWithoutConflict(user.id, payload, levelOnlyPayload)
        }
      }

      return {
        ok: true,
        attempts,
        syncedSkills: payload.length,
        lastSkillSyncAt: syncAt,
        cloudSkillRows,
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempts < maxAttempts) {
        const backoffMs = 400 * Math.pow(2, attempts - 1)
        await wait(backoffMs)
      }
    }
  }

  console.warn('[supabaseSync] Failed to sync skills:', lastError)
  return {
    ok: false,
    attempts,
    syncedSkills: 0,
    lastSkillSyncAt: null,
    error: lastError,
  }
}

/** Sync a session summary to Supabase session_summaries table. */
export async function syncSessionToSupabase(
  sessionStartTime: number,
  endTime: number,
  elapsedSeconds: number,
): Promise<void> {
  if (!supabase) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('session_summaries').insert({
      user_id: user.id,
      start_time: new Date(sessionStartTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      duration_seconds: elapsedSeconds,
    })
  } catch (err) {
    console.warn('[supabaseSync] Failed to sync session:', err)
  }
}

export async function syncAchievementsToSupabase(achievementIds: string[]): Promise<AchievementSyncResult> {
  if (!supabase || achievementIds.length === 0) return { ok: false, synced: 0, error: 'Supabase not configured or no achievements' }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, synced: 0, error: 'No authenticated user' }
    const payload = achievementIds.map((achievementId) => ({
      user_id: user.id,
      achievement_id: achievementId,
      unlocked_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('user_achievements')
      .upsert(payload, { onConflict: 'user_id,achievement_id' })
    if (error) return { ok: false, synced: 0, error: error.message }
    return { ok: true, synced: payload.length }
  } catch (err) {
    return { ok: false, synced: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Build a safe jsonb payload for equipped_loot (never send number or invalid JSON) */
function sanitizeEquippedLoot(raw: unknown): Record<string, string> {
  if (raw == null) return {}
  if (typeof raw === 'number') return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && typeof v === 'string' && v.length > 0) out[k] = v
  }
  return out
}

export async function syncCosmeticsToSupabase(
  equippedBadges: string[],
  equippedFrame: string | null,
  options: {
    equippedLoot?: Record<string, string>
    statusTitle?: string | null
  } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No authenticated user' }
    const ts = new Date().toISOString()
    const basePayload = {
      equipped_badges: equippedBadges,
      equipped_frame: equippedFrame,
      updated_at: ts,
    }
    const equippedLootObj = sanitizeEquippedLoot(options.equippedLoot)
    const lootPayload: Record<string, unknown> = {
      updated_at: ts,
      equipped_loot: equippedLootObj,
    }
    if (options.statusTitle !== undefined) lootPayload.status_title = options.statusTitle

    const fullPayload = { ...basePayload, ...lootPayload }
    const { error } = await supabase.from('profiles').update(fullPayload).eq('id', user.id)
    if (error) {
      const fallback = await supabase.from('profiles').update(basePayload).eq('id', user.id)
      if (fallback.error) return { ok: false, error: fallback.error.message }
      const { error: lootError } = await supabase.from('profiles').update(lootPayload).eq('id', user.id)
      if (lootError) return { ok: false, error: lootError.message }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function syncSkillXpEventsToSupabase(
  entries: SkillXpEventSyncInput[],
): Promise<{ ok: boolean; synced: number; error?: string }> {
  if (!supabase) return { ok: false, synced: 0, error: 'Supabase not configured' }
  const valid = entries.filter((entry) => entry.skillId && entry.xpDelta > 0)
  if (valid.length === 0) return { ok: true, synced: 0 }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, synced: 0, error: 'No authenticated user' }

    const payload = valid.map((entry) => ({
      user_id: user.id,
      skill_id: entry.skillId,
      xp_delta: Math.floor(entry.xpDelta),
      source: entry.source,
      happened_at: entry.happenedAt ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('skill_xp_events').insert(payload)
    if (error) return { ok: false, synced: 0, error: error.message }
    return { ok: true, synced: payload.length }
  } catch (err) {
    return { ok: false, synced: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface InventorySyncResult {
  ok: boolean
  itemsSynced: number
  chestsSynced: number
  /** Merged items (local max with cloud) for store update — excludes seeds */
  mergedItems?: Record<string, number>
  /** Merged chests for store update */
  mergedChests?: Record<ChestType, number>
  /** Merged seeds from cloud for farmStore */
  mergedSeeds?: Record<string, number>
  /** Merged seed zips from cloud for farmStore */
  mergedSeedZips?: Record<SeedZipTier, number>
  error?: string
}

/** Fetch only seeds + seed zips from cloud (for Farm). Returns null if not authenticated. */
export async function fetchFarmFromCloud(): Promise<{
  seeds: Record<string, number>
  seedZips: Record<SeedZipTier, number>
  error?: string
} | null> {
  if (!supabase) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: rows, error } = await supabase
      .from('user_inventory')
      .select('item_id, quantity')
      .eq('user_id', user.id)

    if (error) return { seeds: {}, seedZips: { common: 0, rare: 0, epic: 0, legendary: 0 }, error: error.message }

    const seeds: Record<string, number> = {}
    const seedZips: Record<SeedZipTier, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }

    for (const row of rows || []) {
      const r = row as { item_id: string; quantity: number }
      const qty = r.quantity ?? 0
      if (isSeedId(r.item_id)) seeds[r.item_id] = qty
      else if (isSeedZipId(r.item_id)) {
        const tier = seedZipTierFromItemId(r.item_id)
        if (tier) seedZips[tier] = qty
      }
    }

    return { seeds, seedZips }
  } catch (err) {
    return {
      seeds: {},
      seedZips: { common: 0, rare: 0, epic: 0, legendary: 0 },
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Sync inventory, chests, and seeds to Supabase. Merges with cloud (takes max). */
export async function syncInventoryToSupabase(
  items: Record<string, number>,
  chests: Record<ChestType, number>,
  options: { merge?: boolean; seeds?: Record<string, number>; seedZips?: Record<SeedZipTier, number> } = {},
): Promise<InventorySyncResult> {
  if (!supabase) return { ok: false, itemsSynced: 0, chestsSynced: 0, error: 'Supabase not configured' }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, itemsSynced: 0, chestsSynced: 0, error: 'No authenticated user' }

    const merge = options.merge !== false

    let itemsToSync = items
    let chestsToSync = chests

    if (merge) {
      const [invRes, chestRes] = await Promise.all([
        supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id),
        supabase.from('user_chests').select('chest_type, quantity').eq('user_id', user.id),
      ])

      const cloudItems = new Map<string, number>()
      for (const row of invRes.data || []) {
        const r = row as { item_id: string; quantity: number }
        cloudItems.set(r.item_id, (cloudItems.get(r.item_id) ?? 0) + (r.quantity ?? 0))
      }
      const seeds = options.seeds ?? {}
      const seedZips = options.seedZips ?? { common: 0, rare: 0, epic: 0, legendary: 0 }
      itemsToSync = { ...items }
      for (const [itemId, cloudQty] of cloudItems) {
        let localQty: number
        if (isSeedId(itemId)) localQty = seeds[itemId] ?? 0
        else if (isSeedZipId(itemId)) {
          const tier = seedZipTierFromItemId(itemId)
          localQty = tier ? (seedZips[tier] ?? 0) : 0
        } else localQty = items[itemId] ?? 0
        itemsToSync[itemId] = Math.max(localQty, cloudQty)
      }

      const cloudChests: Record<string, number> = {
        common_chest: 0,
        rare_chest: 0,
        epic_chest: 0,
        legendary_chest: 0,
      }
      for (const row of chestRes.data || []) {
        const r = row as { chest_type: string; quantity: number }
        if (r.chest_type in cloudChests) cloudChests[r.chest_type] = r.quantity ?? 0
      }
      chestsToSync = {
        common_chest: Math.max(chests.common_chest ?? 0, cloudChests.common_chest),
        rare_chest: Math.max(chests.rare_chest ?? 0, cloudChests.rare_chest),
        epic_chest: Math.max(chests.epic_chest ?? 0, cloudChests.epic_chest),
        legendary_chest: Math.max(chests.legendary_chest ?? 0, cloudChests.legendary_chest),
      }
    }

    const now = new Date().toISOString()
    const seeds = options.seeds ?? {}
    const seedZips = options.seedZips ?? { common: 0, rare: 0, epic: 0, legendary: 0 }
    const allItems = { ...itemsToSync }
    for (const [seedId, qty] of Object.entries(seeds)) {
      if (isSeedId(seedId) && (qty ?? 0) > 0) {
        allItems[seedId] = Math.max(allItems[seedId] ?? 0, qty)
      }
    }
    for (const [tier, qty] of Object.entries(seedZips) as [SeedZipTier, number][]) {
      const itemId = SEED_ZIP_ITEM_IDS[tier]
      if ((qty ?? 0) > 0) {
        allItems[itemId] = Math.max(allItems[itemId] ?? 0, qty)
      }
    }
    const itemPayload = Object.entries(allItems)
      .filter(([, qty]) => qty > 0)
      .map(([item_id, quantity]) => ({
        user_id: user.id,
        item_id,
        quantity,
        updated_at: now,
      }))

    const chestPayload = (['common_chest', 'rare_chest', 'epic_chest', 'legendary_chest'] as ChestType[])
      .filter((ct) => (chestsToSync[ct] ?? 0) > 0)
      .map((chest_type) => ({
        user_id: user.id,
        chest_type,
        quantity: chestsToSync[chest_type] ?? 0,
        updated_at: now,
      }))

    if (itemPayload.length > 0) {
      const { error: invErr } = await supabase
        .from('user_inventory')
        .upsert(itemPayload, { onConflict: 'user_id,item_id' })
      if (invErr) return { ok: false, itemsSynced: 0, chestsSynced: 0, error: invErr.message }
    }

    if (chestPayload.length > 0) {
      const { error: chestErr } = await supabase
        .from('user_chests')
        .upsert(chestPayload, { onConflict: 'user_id,chest_type' })
      // Don't abort the whole sync if user_chests table is missing — items still sync correctly
      if (chestErr) console.warn('[supabaseSync] user_chests sync skipped:', chestErr.message)
    }

    const mergedItems: Record<string, number> = {}
    const mergedSeeds: Record<string, number> = {}
    const mergedSeedZips: Record<SeedZipTier, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
    for (const [id, qty] of Object.entries(allItems)) {
      if (isSeedId(id)) mergedSeeds[id] = qty
      else if (isSeedZipId(id)) {
        const tier = seedZipTierFromItemId(id)
        if (tier) mergedSeedZips[tier] = qty
      } else mergedItems[id] = qty
    }

    const hasSeedZips = Object.values(mergedSeedZips).some((v) => v > 0)

    return {
      ok: true,
      itemsSynced: itemPayload.length,
      chestsSynced: chestPayload.length,
      mergedItems,
      mergedChests: chestsToSync,
      mergedSeeds: Object.keys(mergedSeeds).length > 0 ? mergedSeeds : undefined,
      mergedSeedZips: hasSeedZips ? mergedSeedZips : undefined,
    }
  } catch (err) {
    return {
      ok: false,
      itemsSynced: 0,
      chestsSynced: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
