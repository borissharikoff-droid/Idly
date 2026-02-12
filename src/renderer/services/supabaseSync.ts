/**
 * SupabaseSync — syncs session and skill data to Supabase using the singleton client.
 * user_skills is the source for per-skill breakdown; profiles.level is updated by useProfileSync.
 * Sync runs on session end AND on app load so existing local XP appears in user_skills.
 */

import { supabase } from '../lib/supabase'
import { skillLevelFromXP, SKILLS, normalizeSkillId } from '../lib/skills'

/** Sync skill XP data to Supabase user_skills table. */
export async function syncSkillsToSupabase(
  api: NonNullable<Window['electronAPI']>,
): Promise<void> {
  if (!supabase) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const allRows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
    const xpMap = new Map<string, number>()
    for (const row of allRows) {
      const id = normalizeSkillId(row.skill_id)
      xpMap.set(id, (xpMap.get(id) ?? 0) + (row.total_xp ?? 0))
    }
    // Sync ALL skills (including untracked ones at level 1 / 0 XP)
    for (const skill of SKILLS) {
      const total_xp = xpMap.get(skill.id) ?? 0
      const level = skillLevelFromXP(total_xp)
      await supabase.from('user_skills').upsert({
        user_id: user.id,
        skill_id: skill.id,
        level,
        total_xp,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,skill_id' })
    }
  } catch (err) {
    console.warn('[supabaseSync] Failed to sync skills:', err)
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
