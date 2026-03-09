import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { computeTotalSkillLevel } from '../lib/skills'
import { getEquippedBadges, getEquippedFrame } from '../lib/cosmetics'
import { detectPersona } from '../lib/persona'
import { syncCosmeticsToSupabase, syncInventoryToSupabase, syncSkillsToSupabase } from '../services/supabaseSync'
import { useSkillSyncStore } from '../stores/skillSyncStore'
import { buildPresenceActivity } from '../lib/friendPresence'
import { ensureInventoryHydrated, useInventoryStore } from '../stores/inventoryStore'
import { useFarmStore } from '../stores/farmStore'
import { useGoldStore } from '../stores/goldStore'
import { getEquippedPerkRuntime } from '../lib/loot'

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
        totalSkillLevel = computeTotalSkillLevel(rows || [])
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
      // Never downsync profile totals: cloud keeps the best-known values.
      const { error: baseProfileError } = await supabase.from('profiles').update({
        level: Math.max(totalSkillLevel, currentProfileLevel),
        xp: Math.max(totalSkillXp, currentProfileXp),
        streak_count: streak,
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

      // Periodic safety sync for per-skill levels (keeps friends view correct even
      // if a previous sync failed due to temporary network/schema mismatch).
      if (api?.db?.getAllSkillXP) {
        const now = Date.now()
        const RETRY_EVERY_MS = 5 * 60 * 1000
        if (now - lastSkillSyncAttemptRef.current >= RETRY_EVERY_MS) {
          lastSkillSyncAttemptRef.current = now
          setSyncState({ status: 'syncing' })
          syncSkillsToSupabase(api, { maxAttempts: 3 })
            .then((result) => {
              if (result.ok) {
                setSyncState({ status: 'success', at: result.lastSkillSyncAt })
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
      syncSkillsToSupabase(api, { maxAttempts: 3 })
        .then((result) => {
          if (result.ok) {
            setSyncState({ status: 'success', at: result.lastSkillSyncAt })
            // Restore cloud skill XP to local SQLite if local was empty (e.g. fresh install)
            if (result.cloudSkillRows?.length && api.db.restoreSkillXP) {
              api.db.restoreSkillXP(result.cloudSkillRows).catch(() => {})
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
    const activity = buildPresenceActivity(presenceLabel, isSessionActive, appName, sessionStartTime)
    supabase.from('profiles').update({
      current_activity: activity,
      is_online: true,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id).then(() => {})
  }, [user, presenceLabel, isSessionActive, appName, sessionStartTime])
}
