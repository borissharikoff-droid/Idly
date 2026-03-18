import { supabase } from '../lib/supabase'
import type { LootRarity } from '../lib/loot'
import { skillLevelFromXP } from '../lib/skills'

export type RaidTierId = 'ancient' | 'mythic' | 'eternal'
export type RaidStatus = 'forming' | 'active' | 'won' | 'failed'

export interface TributeItem {
  item_id: string
  item_name: string
  rarity: LootRarity
  sacrificed_by: string
}

export interface DailyAttack {
  date: string         // UTC date string yyyy-mm-dd
  damage_dealt: number // contribution HP damage
  won_fight: boolean
}

export interface Raid {
  id: string
  tier: RaidTierId
  leader_id: string
  status: RaidStatus
  boss_hp_remaining: number
  boss_hp_max: number
  started_at: string | null
  ends_at: string | null
  tribute_items: TributeItem[]
  created_at: string
  current_phase: number
  party_hp: number | null
  party_hp_max: number | null
  last_tick_date: string | null
}

export interface CharacterSnapshot {
  atk: number
  hp: number
  hp_regen: number
  def: number
  equipped: Array<{ slot: string; item_id: string; name: string; icon: string; rarity: string }>
  updated_at: string
}

export interface RaidParticipant {
  raid_id: string
  user_id: string
  username: string | null
  avatar_url?: string | null
  joined_at: string
  tribute_paid: boolean
  daily_attacks: DailyAttack[]
  role: 'tank' | 'healer' | 'dps'
  heal_actions: HealAction[]
  defend_actions: DefendAction[]
  character_snapshot?: CharacterSnapshot | null
}

export interface Friend {
  id: string
  username: string | null
  avatar_url: string | null
}

// ── Raid tier config ──────────────────────────────────────────────────────────

export const RAID_TIER_CONFIGS = {
  ancient: {
    name: 'Ancient Raid',
    duration_days: 2,
    color: '#22d3ee',
    icon: '🗿',
    boss_hp: 1_000_000,
    contribution_per_win: 150_000,
    warrior_level_req: 20,
    skill_level_req: 20,
    zones_required: 6,
    party_min: 2,
    /** The combat encounter boss for daily attack sessions */
    encounter: {
      id: 'ancient_golem',
      name: 'Ancient Golem',
      icon: '🗿',
      hp: 2000,
      atk: 14,
      def: 8,
      atkSpread: 0.3,
      rewards: { chestTier: 'epic_chest' as const },
    },
    tribute_min_rarity: 'epic' as LootRarity,
    tribute_count: 3,
    reward_chest: 'epic_chest' as const,
    legendary_bonus_chance: 0.15,
    description: 'A 2-day battle against a guardian of old. Demands epic tribute.',
    lore: 'The Ancient Golem stirs from centuries of slumber.',
  },
  mythic: {
    name: 'Mythic Raid',
    duration_days: 4,
    color: '#a855f7',
    icon: '🐲',
    boss_hp: 5_000_000,
    contribution_per_win: 400_000,
    warrior_level_req: 65,
    skill_level_req: 55,
    zones_required: 8,
    party_min: 2,
    encounter: {
      id: 'mythic_hydra',
      name: 'Mythic Hydra',
      icon: '🐲',
      hp: 3500,
      atk: 22,
      def: 13,
      atkSpread: 0.3,
      rewards: { chestTier: 'legendary_chest' as const },
    },
    tribute_min_rarity: 'legendary' as LootRarity,
    tribute_count: 3,
    reward_chest: 'legendary_chest' as const,
    legendary_bonus_chance: 1.0,
    description: 'A 4-day hunt for the mythic hydra. Demands legendary tribute.',
    lore: 'Seven heads. Seven deaths. A prize unlike any other.',
  },
  eternal: {
    name: 'Eternal Raid',
    duration_days: 7,
    color: '#f59e0b',
    icon: '⚡',
    boss_hp: 20_000_000,
    contribution_per_win: 800_000,
    warrior_level_req: 80,
    skill_level_req: 70,
    zones_required: 8,
    party_min: 3,
    encounter: {
      id: 'eternal_titan',
      name: 'Eternal Titan',
      icon: '⚡',
      hp: 6000,
      atk: 32,
      def: 20,
      atkSpread: 0.35,
      rewards: { chestTier: 'legendary_chest' as const },
    },
    tribute_min_rarity: 'mythic' as LootRarity,
    tribute_count: 2,
    reward_chest: 'legendary_chest' as const,
    legendary_bonus_chance: 1.0,
    description: 'A 7-day clash with an eternal titan. Demands mythic tribute.',
    lore: 'Before the world was named, the Titan ruled. It still does.',
  },
} as const satisfies Record<RaidTierId, {
  name: string
  duration_days: number
  color: string
  icon: string
  boss_hp: number
  contribution_per_win: number
  warrior_level_req: number
  skill_level_req: number
  zones_required: number
  party_min: number
  encounter: {
    id: string; name: string; icon: string
    hp: number; atk: number; def: number; atkSpread: number
    rewards: { chestTier: 'epic_chest' | 'legendary_chest' }
  }
  tribute_min_rarity: LootRarity
  tribute_count: number
  reward_chest: 'epic_chest' | 'legendary_chest'
  legendary_bonus_chance: number
  description: string
  lore: string
}>

export const RAID_PHASE_ATK_MULT: Record<1 | 2 | 3, number> = { 1: 1.0, 2: 1.4, 3: 1.8 }

// ── Party HP ──────────────────────────────────────────────────────────────────

/** Starting party HP per tier */
export const PARTY_HP_MAX: Record<RaidTierId, number> = {
  ancient: 300,
  mythic: 500,
  eternal: 800,
}

/** Daily boss damage to party HP per tier per phase */
export const PARTY_DAILY_DAMAGE: Record<RaidTierId, Record<1 | 2 | 3, number>> = {
  ancient: { 1: 20, 2: 35, 3: 50 },
  mythic:  { 1: 40, 2: 65, 3: 90 },
  eternal: { 1: 60, 2: 100, 3: 140 },
}

export interface HealAction {
  date: string            // yyyy-mm-dd
  heal_amount: number
  items_used: { item_id: string; quantity: number }[]
}

export interface DefendAction {
  date: string
}

export function getRaidPhase(hpRemaining: number, hpMax: number): 1 | 2 | 3 {
  const pct = hpRemaining / hpMax
  if (pct > 0.66) return 1
  if (pct > 0.33) return 2
  return 3
}

export const RAID_EXCLUSIVE_ITEM_IDS = ['raid_ancient_ring', 'raid_void_blade', 'raid_eternal_crown'] as const

export interface RaidInvite {
  id: string
  from_user_id: string
  to_user_id: string
  tier: RaidTierId
  raid_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  from_username?: string | null
}

const RARITY_ORDER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']
export function rarityMeetsMin(rarity: LootRarity, minRarity: LootRarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minRarity)
}

export function checkRaidGates(
  tier: RaidTierId,
  clearedZoneIds: string[],
  warriorLevel: number,
  skillXp: Record<string, number>,
  participantCount: number,
): { ok: boolean; reason?: string } {
  const cfg = RAID_TIER_CONFIGS[tier]

  const zonesNeeded = cfg.zones_required
  if (clearedZoneIds.length < zonesNeeded) {
    return { ok: false, reason: `Clear ${zonesNeeded} zones first (${clearedZoneIds.length}/${zonesNeeded})` }
  }

  if (warriorLevel < cfg.warrior_level_req) {
    return { ok: false, reason: `Warrior level ${warriorLevel}/${cfg.warrior_level_req} required` }
  }

  const qualifiedSkills = Object.values(skillXp).filter(
    (xp) => skillLevelFromXP(xp) >= cfg.skill_level_req,
  ).length
  if (qualifiedSkills < 4) {
    return { ok: false, reason: `Need 4+ skills at level ${cfg.skill_level_req} (${qualifiedSkills}/4)` }
  }

  if (participantCount < cfg.party_min) {
    return { ok: false, reason: `Need ${cfg.party_min} party members (${participantCount}/${cfg.party_min})` }
  }

  return { ok: true }
}

export async function grantRaidVictoryLoot(tier: RaidTierId): Promise<string | null> {
  const chances: Record<RaidTierId, { itemId: string; chance: number }> = {
    ancient: { itemId: 'raid_ancient_ring', chance: 0.08 },
    mythic: { itemId: 'raid_void_blade', chance: 0.12 },
    eternal: { itemId: 'raid_eternal_crown', chance: 0.20 },
  }
  const entry = chances[tier]
  if (Math.random() < entry.chance) return entry.itemId
  return null
}

export async function createRaidInvite(
  fromUserId: string,
  toUserId: string,
  tier: RaidTierId,
  raidId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { error } = await supabase.from('raid_invites').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
    tier,
    raid_id: raidId,
    status: 'pending',
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function fetchPendingInvites(userId: string): Promise<RaidInvite[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('raid_invites')
    .select('*, profiles!from_user_id(username)')
    .eq('to_user_id', userId)
    .eq('status', 'pending')
  if (!data) return []
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    from_user_id: row.from_user_id as string,
    to_user_id: row.to_user_id as string,
    tier: row.tier as RaidTierId,
    raid_id: row.raid_id as string,
    status: row.status as 'pending' | 'accepted' | 'declined',
    created_at: row.created_at as string,
    from_username: (row.profiles as { username?: string } | null)?.username ?? null,
  }))
}

export async function acceptRaidInvite(
  inviteId: string,
  userId: string,
  role: 'tank' | 'healer' | 'dps' = 'dps',
  snapshot?: CharacterSnapshot | null,
): Promise<{ ok: boolean; raidId?: string; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const { data: invite, error: fetchErr } = await supabase
    .from('raid_invites')
    .select('raid_id, tier')
    .eq('id', inviteId)
    .single()
  if (fetchErr || !invite) return { ok: false, error: fetchErr?.message ?? 'Invite not found' }

  await supabase.from('raid_invites').update({ status: 'accepted' }).eq('id', inviteId)

  // Fetch the user's profile to store their username in raid_participants
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', userId).single()
  const username = (profile as { username?: string | null } | null)?.username ?? null

  const raidId = (invite as { raid_id: string }).raid_id
  const joinResult = await joinRaid(raidId, userId, username, role, snapshot)
  if (!joinResult.ok) return { ok: false, error: joinResult.error }

  return { ok: true, raidId }
}

export async function declineRaidInvite(inviteId: string): Promise<{ ok: boolean }> {
  if (!supabase) return { ok: false }
  await supabase.from('raid_invites').update({ status: 'declined' }).eq('id', inviteId)
  return { ok: true }
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

export async function updateRaidParticipantRole(
  raidId: string,
  userId: string,
  role: 'tank' | 'healer' | 'dps',
): Promise<void> {
  if (!supabase) return
  await supabase
    .from('raid_participants')
    .update({ role })
    .eq('raid_id', raidId)
    .eq('user_id', userId)
}

export async function createRaid(
  leaderId: string,
  tier: RaidTierId,
  tributeItems: TributeItem[],
  leaderRole: 'tank' | 'healer' | 'dps' = 'dps',
  leaderSnapshot?: CharacterSnapshot | null,
): Promise<{ ok: boolean; raid?: Raid; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const cfg = RAID_TIER_CONFIGS[tier]
  const now = new Date()
  const endsAt = new Date(now.getTime() + cfg.duration_days * 86_400_000).toISOString()

  const partyHpMax = PARTY_HP_MAX[tier]
  const { data, error } = await supabase
    .from('raids')
    .insert({
      tier,
      leader_id: leaderId,
      status: 'active',
      boss_hp_remaining: cfg.boss_hp,
      boss_hp_max: cfg.boss_hp,
      started_at: now.toISOString(),
      ends_at: endsAt,
      tribute_items: tributeItems,
      party_hp: partyHpMax,
      party_hp_max: partyHpMax,
      last_tick_date: now.toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Failed to create raid' }

  // Add leader as first participant
  try {
    await supabase.from('raid_participants').insert({
      raid_id: (data as Raid).id,
      user_id: leaderId,
      tribute_paid: true,
      daily_attacks: [],
      role: leaderRole,
      heal_actions: [],
      defend_actions: [],
      character_snapshot: leaderSnapshot ?? null,
    })
  } catch { /* non-critical */ }

  return { ok: true, raid: data as Raid }
}

export async function updateParticipantSnapshot(
  raidId: string,
  userId: string,
  snapshot: CharacterSnapshot,
): Promise<void> {
  if (!supabase) return
  await supabase
    .from('raid_participants')
    .update({ character_snapshot: snapshot })
    .eq('raid_id', raidId)
    .eq('user_id', userId)
}

export async function fetchActiveRaid(userId: string): Promise<{ raid: Raid | null; participants: RaidParticipant[] }> {
  if (!supabase) return { raid: null, participants: [] }

  // Find a raid where user is a participant (either leader or member)
  const { data: partRows } = await supabase
    .from('raid_participants')
    .select('raid_id')
    .eq('user_id', userId)

  if (!partRows?.length) {
    // Maybe they're a leader
    const { data: leadRaid } = await supabase
      .from('raids')
      .select('*')
      .eq('leader_id', userId)
      .in('status', ['forming', 'active', 'won', 'failed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!leadRaid) return { raid: null, participants: [] }
    const { data: parts } = await supabase
      .from('raid_participants')
      .select('*')
      .eq('raid_id', (leadRaid as Raid).id)
    const rawParts2 = (parts as RaidParticipant[]) ?? []
    if (rawParts2.length > 0) {
      const { data: profiles2 } = await supabase.from('profiles').select('id, username, avatar_url').in('id', rawParts2.map((p) => p.user_id))
      if (profiles2?.length) {
        const pm2 = Object.fromEntries((profiles2 as { id: string; username: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]))
        return { raid: leadRaid as Raid, participants: rawParts2.map((p) => ({ ...p, username: pm2[p.user_id]?.username ?? p.username, avatar_url: pm2[p.user_id]?.avatar_url ?? null })) }
      }
    }
    return { raid: leadRaid as Raid, participants: rawParts2 }
  }

  const raidIds = partRows.map((r) => r.raid_id as string)
  const { data: raids } = await supabase
    .from('raids')
    .select('*')
    .in('id', raidIds)
    .in('status', ['forming', 'active', 'won', 'failed'])
    .order('created_at', { ascending: false })
    .limit(1)

  const raid = (raids?.[0] as Raid) ?? null
  if (!raid) return { raid: null, participants: [] }

  const { data: parts } = await supabase
    .from('raid_participants')
    .select('*')
    .eq('raid_id', raid.id)

  const rawParts = (parts as RaidParticipant[]) ?? []

  // Enrich with profile data (username, avatar) — overrides stored username which may be null
  if (rawParts.length > 0) {
    const userIds = rawParts.map((p) => p.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds)
    if (profiles?.length) {
      const pm = Object.fromEntries((profiles as { id: string; username: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]))
      return {
        raid,
        participants: rawParts.map((p) => ({
          ...p,
          username: pm[p.user_id]?.username ?? p.username,
          avatar_url: pm[p.user_id]?.avatar_url ?? null,
        })),
      }
    }
  }

  return { raid, participants: rawParts }
}

export async function joinRaid(
  raidId: string,
  userId: string,
  username: string | null,
  role: 'tank' | 'healer' | 'dps' = 'dps',
  snapshot?: CharacterSnapshot | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const { error } = await supabase.from('raid_participants').insert({
    raid_id: raidId,
    user_id: userId,
    username,
    tribute_paid: false,
    daily_attacks: [],
    role,
    heal_actions: [],
    defend_actions: [],
    character_snapshot: snapshot ?? null,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function submitDailyAttack(
  raidId: string,
  userId: string,
  damageDealt: number,
  wonFight: boolean,
): Promise<{ ok: boolean; raidWon: boolean; error?: string }> {
  if (!supabase) return { ok: false, raidWon: false, error: 'Supabase not configured' }

  const today = new Date().toISOString().split('T')[0]
  const attack: DailyAttack = { date: today, damage_dealt: damageDealt, won_fight: wonFight }

  // Fetch current participant row
  const { data: partRow } = await supabase
    .from('raid_participants')
    .select('daily_attacks')
    .eq('raid_id', raidId)
    .eq('user_id', userId)
    .single()

  if (!partRow) return { ok: false, raidWon: false, error: 'Participant not found' }

  const existingAttacks = (partRow.daily_attacks as DailyAttack[]) ?? []
  if (existingAttacks.some((a) => a.date === today)) return { ok: false, raidWon: false, error: 'Already attacked today' }
  const updatedAttacks = [...existingAttacks, attack]

  await supabase
    .from('raid_participants')
    .update({ daily_attacks: updatedAttacks })
    .eq('raid_id', raidId)
    .eq('user_id', userId)

  if (!wonFight || damageDealt <= 0) return { ok: true, raidWon: false }

  // Subtract contribution from boss HP
  const { data: raidRow } = await supabase
    .from('raids')
    .select('boss_hp_remaining, status')
    .eq('id', raidId)
    .single()

  if (!raidRow || (raidRow as { status: string }).status !== 'active') return { ok: true, raidWon: false }

  const newHp = Math.max(0, ((raidRow as { boss_hp_remaining: number }).boss_hp_remaining) - damageDealt)
  const raidWon = newHp <= 0
  const updates: Record<string, unknown> = { boss_hp_remaining: newHp }
  if (raidWon) updates.status = 'won'

  await supabase.from('raids').update(updates).eq('id', raidId)

  return { ok: true, raidWon }
}

export async function fetchFriends(userId: string): Promise<Friend[]> {
  if (!supabase) return []

  const { data } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted')

  if (!data?.length) return []

  const friendIds = data.map((f) =>
    (f as { user_id: string; friend_id: string }).user_id === userId
      ? (f as { user_id: string; friend_id: string }).friend_id
      : (f as { user_id: string; friend_id: string }).user_id,
  )

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', friendIds)

  return (profiles as Friend[]) ?? []
}

/** Submit healer daily action — consume food items and restore party HP */
export async function submitHealAction(
  raidId: string,
  userId: string,
  items: { item_id: string; quantity: number }[],
  healAmount: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const today = new Date().toISOString().split('T')[0]

  // Fetch current heal_actions for this participant
  const { data: partRow } = await supabase
    .from('raid_participants')
    .select('heal_actions')
    .eq('raid_id', raidId)
    .eq('user_id', userId)
    .single()

  if (!partRow) return { ok: false, error: 'Participant not found' }

  const existingHeals = (partRow.heal_actions as HealAction[]) ?? []
  if (existingHeals.some((h) => h.date === today)) {
    return { ok: false, error: 'Already healed today' }
  }

  const newHeal: HealAction = { date: today, heal_amount: healAmount, items_used: items }
  await supabase
    .from('raid_participants')
    .update({ heal_actions: [...existingHeals, newHeal] })
    .eq('raid_id', raidId)
    .eq('user_id', userId)

  // Apply heal to party_hp (capped at party_hp_max)
  const { data: raidRow } = await supabase
    .from('raids')
    .select('party_hp, party_hp_max')
    .eq('id', raidId)
    .single()

  if (raidRow) {
    const r = raidRow as { party_hp: number; party_hp_max: number }
    const newHp = Math.min(r.party_hp_max, (r.party_hp ?? 0) + healAmount)
    await supabase.from('raids').update({ party_hp: newHp }).eq('id', raidId)
  }

  return { ok: true }
}

/** Submit tank daily defend action */
export async function submitDefendAction(
  raidId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const today = new Date().toISOString().split('T')[0]

  const { data: partRow } = await supabase
    .from('raid_participants')
    .select('defend_actions')
    .eq('raid_id', raidId)
    .eq('user_id', userId)
    .single()

  if (!partRow) return { ok: false, error: 'Participant not found' }

  const existingDefends = (partRow.defend_actions as DefendAction[]) ?? []
  if (existingDefends.some((d) => d.date === today)) {
    return { ok: false, error: 'Already defended today' }
  }

  await supabase
    .from('raid_participants')
    .update({ defend_actions: [...existingDefends, { date: today }] })
    .eq('raid_id', raidId)
    .eq('user_id', userId)

  return { ok: true }
}

/**
 * Apply daily party HP damage tick for any days missed since last_tick_date.
 * Called lazily when a player fetches the raid.
 * Only applies damage when new days have elapsed — idempotent if called multiple times on same day.
 */
export async function applyPartyHpTick(
  raidId: string,
  tier: RaidTierId,
  currentPhase: 1 | 2 | 3,
): Promise<void> {
  if (!supabase) return

  const { data: raidRow } = await supabase
    .from('raids')
    .select('party_hp, party_hp_max, last_tick_date, status')
    .eq('id', raidId)
    .single()

  if (!raidRow) return
  const r = raidRow as {
    party_hp: number | null
    party_hp_max: number | null
    last_tick_date: string | null
    status: string
  }

  if (r.status !== 'active') return
  if (r.party_hp === null || r.party_hp_max === null) return

  const today = new Date().toISOString().split('T')[0]
  const lastTick = r.last_tick_date ?? today

  if (lastTick >= today) return // nothing to tick

  // Count days elapsed
  const lastMs = new Date(lastTick).getTime()
  const todayMs = new Date(today).getTime()
  const daysElapsed = Math.max(0, Math.floor((todayMs - lastMs) / 86_400_000))
  if (daysElapsed === 0) return

  // Fetch all defend/heal actions to adjust damage
  const { data: parts } = await supabase
    .from('raid_participants')
    .select('role, defend_actions, heal_actions')
    .eq('raid_id', raidId)

  const participants = (parts ?? []) as Array<{
    role: string
    defend_actions: DefendAction[]
    heal_actions: HealAction[]
  }>

  const baseDamagePerDay = PARTY_DAILY_DAMAGE[tier][currentPhase]
  let partyHp = r.party_hp

  // For each elapsed day, compute net damage
  for (let d = 0; d < daysElapsed; d++) {
    const date = new Date(lastMs + (d + 1) * 86_400_000).toISOString().split('T')[0]

    const tankDefended = participants.some(
      (p) => p.role === 'tank' && (p.defend_actions ?? []).some((a) => a.date === date),
    )

    // Damage is halved if tank defended that day
    const damage = tankDefended ? Math.floor(baseDamagePerDay * 0.5) : baseDamagePerDay
    partyHp -= damage
  }

  partyHp = Math.max(0, partyHp)

  const updates: Record<string, unknown> = { party_hp: partyHp, last_tick_date: today }
  if (partyHp <= 0) updates.status = 'failed'

  await supabase.from('raids').update(updates).eq('id', raidId)
}

export async function checkRaidExpiry(raidId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase
    .from('raids')
    .select('ends_at, status')
    .eq('id', raidId)
    .single()
  if (!data) return
  const r = data as { ends_at: string | null; status: string }
  if (r.status !== 'active') return
  if (r.ends_at && new Date(r.ends_at) < new Date()) {
    await supabase.from('raids').update({ status: 'failed' }).eq('id', raidId)
  }
}
