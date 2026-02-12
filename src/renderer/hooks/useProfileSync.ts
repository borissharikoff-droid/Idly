import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { computeTotalSkillLevel } from '../lib/skills'
import { getEquippedBadges, getEquippedFrame } from '../lib/cosmetics'
import { detectPersona } from '../lib/persona'
import { syncSkillsToSupabase } from '../services/supabaseSync'

export function useProfileSync() {
  const { user } = useAuthStore()
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (!supabase || !user) return

    const sync = async () => {
      if (!supabase || !user) return
      if (!window.electronAPI?.db?.getStreak) return
      const api = window.electronAPI
      let totalSkillLevel = 0
      if (api?.db?.getAllSkillXP) {
        const rows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
        totalSkillLevel = computeTotalSkillLevel(rows || [])
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

      // Sync total skill level, streak, persona
      await supabase.from('profiles').update({
        level: totalSkillLevel,
        streak_count: streak,
        ...(personaId != null && { persona_id: personaId }),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)

      // Cosmetics sync — columns may not exist yet in Supabase, so try separately
      try {
        await supabase.from('profiles').update({
          equipped_badges: equippedBadges,
          equipped_frame: equippedFrame,
        }).eq('id', user.id)
      } catch {
        // Columns may not exist yet — safe to ignore
      }
    }

    sync()
    // Sync local skill XP to user_skills so friends/leaderboard show real levels
    if (window.electronAPI?.db?.getAllSkillXP) {
      syncSkillsToSupabase(window.electronAPI).catch(() => {})
    }
    intervalRef.current = setInterval(sync, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [user])
}

export function usePresenceSync(presenceLabel: string | null, isSessionActive: boolean, appName: string | null) {
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

  // Update current activity: "Leveling X" or "Leveling X · AppName" or just "AppName"
  useEffect(() => {
    if (!supabase || !user) return
    let activity: string | null = null
    if (isSessionActive) {
      if (presenceLabel) {
        activity = appName ? `${presenceLabel} · ${appName}` : presenceLabel
      } else if (appName) {
        activity = appName
      }
    }
    supabase.from('profiles').update({
      current_activity: activity,
      is_online: true,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id).then(() => {})
  }, [user, presenceLabel, isSessionActive, appName])
}
