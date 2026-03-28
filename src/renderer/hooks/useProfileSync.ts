import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { computeTotalSkillLevelWithPrestige } from '../lib/skills'
import { getEquippedBadges, getEquippedFrame } from '../lib/cosmetics'
import { detectPersona } from '../lib/persona'
import { syncCosmeticsToSupabase, syncInventoryToSupabase, syncSkillsToSupabase } from '../services/supabaseSync'
import { useSkillSyncStore } from '../stores/skillSyncStore'
import { buildPresenceActivity } from '../lib/friendPresence'
import { ensureInventoryHydrated, useInventoryStore } from '../stores/inventoryStore'
import { useFarmStore } from '../stores/farmStore'
import { useGoldStore } from '../stores/goldStore'
import { getEquippedPerkRuntime } from '../lib/loot'
import { useCookingStore } from '../stores/cookingStore'

/** Force-set admin overrides to both SQLite and localStorage (can reduce XP). */
async function applyAdminOverrides(
  api: typeof window.electronAPI,
  overrides: { skill_id: string; total_xp: number }[],
) {
  // Force-set in SQLite first, then notify UI
  try {
    if (api?.db?.forceSetSkillXP) {
      await api.db.forceSetSkillXP(overrides)
    }
  } catch { /* ignore */ }
  // Force-set in localStorage
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    for (const row of overrides) {
      stored[row.skill_id] = row.total_xp
    }
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
    // Also set a flag so next app launch applies overrides before React mounts
    const pending: Record<string, number> = {}
    for (const row of overrides) pending[row.skill_id] = row.total_xp
    localStorage.setItem('grindly_admin_skill_overrides', JSON.stringify(pending))
  } catch { /* ignore */ }

  // Chef skill has a separate store (cookingStore.cookXp) — sync it too
  const chefOverride = overrides.find((r) => r.skill_id === 'chef')
  if (chefOverride) {
    try {
      const cookSnap = JSON.parse(localStorage.getItem('grindly_cooking_v1') || '{}')
      cookSnap.cookXp = chefOverride.total_xp
      localStorage.setItem('grindly_cooking_v1', JSON.stringify(cookSnap))
      useCookingStore.setState({ cookXp: chefOverride.total_xp })
    } catch { /* ignore */ }
  }

  // Notify UI after both stores are updated
  window.dispatchEvent(new CustomEvent('grindly-skill-xp-updated'))
  console.log('[profileSync] Applied admin skill overrides:', overrides)
}

/** Merge cloud skill XP into localStorage so secondary skills (farmer, chef, warrior, crafter)
 *  reflect admin grants or cross-device progress. Takes MAX of local vs cloud. */
function restoreCloudSkillsToLocalStorage(cloudRows: { skill_id: string; total_xp: number }[]) {
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    let changed = false
    for (const row of cloudRows) {
      const localXp = stored[row.skill_id] ?? 0
      if (row.total_xp > localXp) {
        stored[row.skill_id] = row.total_xp
        changed = true
      }
    }
    if (changed) {
      localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
      window.dispatchEvent(new CustomEvent('grindly-skill-xp-updated'))

      // Chef skill has a separate store — sync if cloud had higher XP
      const chefRow = cloudRows.find((r) => r.skill_id === 'chef')
      if (chefRow) {
        const cookXp = useCookingStore.getState().cookXp
        if (chefRow.total_xp > cookXp) {
          try {
            const cookSnap = JSON.parse(localStorage.getItem('grindly_cooking_v1') || '{}')
            cookSnap.cookXp = chefRow.total_xp
            localStorage.setItem('grindly_cooking_v1', JSON.stringify(cookSnap))
            useCookingStore.setState({ cookXp: chefRow.total_xp })
          } catch { /* ignore */ }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

export function useProfileSync() {
  const { user } = useAuthStore()
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const lastSkillSyncAttemptRef = useRef(0)
  const setSyncState = useSkillSyncStore((s) => s.setSyncState)

  useEffect(() => {
    if (!supabase || !user) return

    const sync = async () => {
      if (!supabase || !user) return
      await useGoldStore.getState().syncFromSupabase(user.id)

      // Apply admin inventory grants (additive, bypasses local-authoritative logic)
      if (supabase && user) {
        supabase.from('admin_inventory_grants').select('id, item_id, quantity').eq('user_id', user.id)
          .then(({ data: grants }) => {
            if (!grants?.length) return
            ensureInventoryHydrated()
            const store = useInventoryStore.getState()
            for (const g of grants) {
              store.addItem(g.item_id, g.quantity)
            }
            // Delete applied grants
            const ids = grants.map((g) => g.id)
            supabase!.from('admin_inventory_grants').delete().in('id', ids).then(() => {})
          })
          .catch(() => {})
      }

      // Inventory + seeds + seed zips sync — merge cloud → local so admin grants appear
      ensureInventoryHydrated()
      const { items, chests } = useInventoryStore.getState()
      const { seeds, seedZips } = useFarmStore.getState()
      syncInventoryToSupabase(items, chests, { merge: true, seeds, seedZips })
        .then((result) => {
          if (result.ok && result.mergedItems) {
            useInventoryStore.getState().mergeFromCloud(result.mergedItems, result.mergedChests ?? chests)
          }
        })
        .catch(() => {})

      if (!window.electronAPI?.db?.getStreak) return
      const api = window.electronAPI
      let totalSkillLevel = 0
      let totalSkillXp = 0
      if (api?.db?.getAllSkillXP) {
        const rows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
        totalSkillLevel = computeTotalSkillLevelWithPrestige(rows || [])
        totalSkillXp = (rows || []).reduce((sum, row) => sum + Math.max(0, row.total_xp ?? 0), 0)
      }
      const [streak] = await Promise.all([
        api.db.getStreak(),
      ])
      const equippedBadges = getEquippedBadges()
      const equippedFrame = getEquippedFrame()

      // Persona from category stats (so friends see your status: Developer, Gamer, Scholar, etc.)
      let personaId: string | null = null
      if (api?.db?.getCategoryStats) {
        const cats = (await api.db.getCategoryStats()) as { category: string; total_ms: number }[] | undefined
        personaId = detectPersona(cats || []).id
      }

      const profileRes = await supabase
        .from('profiles')
        .select('level, xp')
        .eq('id', user.id)
        .single()
      const currentProfileLevel = Math.max(0, Number(profileRes.data?.level ?? 0))
      const currentProfileXp = Math.max(0, Number(profileRes.data?.xp ?? 0))
      // Permanent stats (potion boosts) — sync so friends can see correct combat stats
      ensureInventoryHydrated()
      const permStats = useInventoryStore.getState().permanentStats

      // Never downsync profile totals: cloud keeps the best-known values.
      const { error: baseProfileError } = await supabase.from('profiles').update({
        level: Math.max(totalSkillLevel, currentProfileLevel),
        xp: Math.max(totalSkillXp, currentProfileXp),
        streak_count: streak,
        permanent_stats: permStats,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)
      if (baseProfileError) {
        console.warn('[useProfileSync] profiles base sync failed:', baseProfileError.message)
      }

      // Optional persona sync (column may not exist in older schema)
      if (personaId != null) {
        const { error: personaError } = await supabase
          .from('profiles')
          .update({ persona_id: personaId, updated_at: new Date().toISOString() })
          .eq('id', user.id)
        if (personaError) {
          // Optional field in some deployments
        }
      }

      // Cosmetics sync — columns may not exist yet in Supabase, so try separately
      ensureInventoryHydrated()
      const equippedLoot = useInventoryStore.getState().equippedBySlot
      const perk = getEquippedPerkRuntime(equippedLoot)
      syncCosmeticsToSupabase(equippedBadges, equippedFrame, {
        equippedLoot: (equippedLoot ?? {}) as Record<string, string>,
        statusTitle: perk.statusTitle,
      }).catch(() => {})

      // Periodic skill re-sync (initial mount sync is handled separately below)
      if (api?.db) {
        const now = Date.now()
        const RETRY_EVERY_MS = 5 * 60 * 1000
        if (now - lastSkillSyncAttemptRef.current >= RETRY_EVERY_MS) {
          lastSkillSyncAttemptRef.current = now
          setSyncState({ status: 'syncing' })
          syncSkillsToSupabase(api, { maxAttempts: 3 })
            .then((result) => {
              if (result.ok) {
                setSyncState({ status: 'success', at: result.lastSkillSyncAt })
                if (result.adminOverrides?.length) {
                  applyAdminOverrides(api, result.adminOverrides)
                }
                const periodicOverriddenIds = new Set((result.adminOverrides ?? []).map((o) => o.skill_id))
                const periodicSafeRows = (result.cloudSkillRows ?? []).filter((r) => !periodicOverriddenIds.has(r.skill_id))
                if (periodicSafeRows.length) {
                  restoreCloudSkillsToLocalStorage(periodicSafeRows)
                }
                return
              }
              setSyncState({ status: 'error', error: result.error ?? 'Skill sync failed' })
            })
            .catch((err) => {
              setSyncState({
                status: 'error',
                error: err instanceof Error ? err.message : String(err),
              })
            })
        }
      }
    }

    sync()
    // Sync local skill XP to user_skills so friends/leaderboard show real levels
    if (window.electronAPI?.db?.getAllSkillXP) {
      const api = window.electronAPI
      setSyncState({ status: 'syncing' })
      lastSkillSyncAttemptRef.current = Date.now()
      syncSkillsToSupabase(api, { maxAttempts: 3 })
        .then((result) => {
          if (result.ok) {
            setSyncState({ status: 'success', at: result.lastSkillSyncAt })
            // Apply admin overrides first (force-set, can reduce XP)
            if (result.adminOverrides?.length) {
              applyAdminOverrides(api, result.adminOverrides)
            }
            // Restore cloud skill XP to local SQLite if local was empty (e.g. fresh install)
            // Exclude admin-overridden skills so cloud restore doesn't revert them
            const overriddenIds = new Set((result.adminOverrides ?? []).map((o) => o.skill_id))
            const safeCloudRows = (result.cloudSkillRows ?? []).filter((r) => !overriddenIds.has(r.skill_id))
            if (safeCloudRows.length && api.db.restoreSkillXP) {
              api.db.restoreSkillXP(safeCloudRows).catch(() => {})
            }
            // Also restore cloud XP to localStorage (secondary skills like farmer/chef/warrior/crafter read from here)
            if (safeCloudRows.length) {
              restoreCloudSkillsToLocalStorage(safeCloudRows)
            }
            return
          }
          setSyncState({ status: 'error', error: result.error ?? 'Skill sync failed' })
        })
        .catch((err) => {
          setSyncState({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
    intervalRef.current = setInterval(sync, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [user, setSyncState])

  // Sync cosmetics immediately when equipped loot changes (so friends see loadout right away)
  const prevEquippedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!supabase || !user) return
    ensureInventoryHydrated()
    prevEquippedRef.current = JSON.stringify(useInventoryStore.getState().equippedBySlot)
    const syncCosmeticsNow = () => {
      ensureInventoryHydrated()
      const equippedLoot = useInventoryStore.getState().equippedBySlot
      const perk = getEquippedPerkRuntime(equippedLoot)
      syncCosmeticsToSupabase(getEquippedBadges(), getEquippedFrame(), {
        equippedLoot: (equippedLoot ?? {}) as Record<string, string>,
        statusTitle: perk.statusTitle,
      }).catch(() => {})
    }
    const unsub = useInventoryStore.subscribe(() => {
      const nextStr = JSON.stringify(useInventoryStore.getState().equippedBySlot)
      if (prevEquippedRef.current !== nextStr) {
        prevEquippedRef.current = nextStr
        syncCosmeticsNow()
      }
    })
    return unsub
  }, [user])
}

export function usePresenceSync(
  presenceLabel: string | null,
  isSessionActive: boolean,
  appName: string | null,
  sessionStartTime: number | null,
  isIdle?: boolean,
) {
  const { user } = useAuthStore()

  // Set online on mount, offline on unmount
  useEffect(() => {
    if (!supabase || !user) return
    supabase.from('profiles').update({ is_online: true, updated_at: new Date().toISOString() }).eq('id', user.id).then(() => {})

    const handleBeforeUnload = () => {
      if (supabase && user) {
        // Use sendBeacon-style: can't await but fire it
        supabase.from('profiles').update({ is_online: false, current_activity: null, updated_at: new Date().toISOString() }).eq('id', user.id).then(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      handleBeforeUnload()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user])

  // Update current activity with optional session start metadata.
  useEffect(() => {
    if (!supabase || !user) return
    const activity = isIdle ? 'AFK' : buildPresenceActivity(presenceLabel, isSessionActive, appName, sessionStartTime)
    supabase.from('profiles').update({
      current_activity: activity,
      is_online: true,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id).then(() => {})
  }, [user, presenceLabel, isSessionActive, appName, sessionStartTime, isIdle])

  // Heartbeat: keep updated_at fresh so others see us as online
  useEffect(() => {
    if (!supabase || !user) return
    const id = setInterval(() => {
      supabase!.from('profiles').update({ is_online: true, updated_at: new Date().toISOString() }).eq('id', user.id).then(() => {})
    }, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [user])
}
