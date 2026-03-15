import { supabase } from '../lib/supabase'
import type { LootRarity } from '../lib/loot'

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
}

export interface RaidParticipant {
  raid_id: string
  user_id: string
  username: string | null
  joined_at: string
  tribute_paid: boolean
  daily_attacks: DailyAttack[]
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
    tribute_min_rarity: 'rare' as LootRarity,
    tribute_count: 2,
    reward_chest: 'epic_chest' as const,
    legendary_bonus_chance: 0.15,
    description: 'A 2-day battle against a guardian of old. Demands rare tribute.',
    lore: 'The Ancient Golem stirs from centuries of slumber.',
  },
  mythic: {
    name: 'Mythic Raid',
    duration_days: 4,
    color: '#a855f7',
    icon: '🐲',
    boss_hp: 5_000_000,
    contribution_per_win: 400_000,
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
    tribute_min_rarity: 'epic' as LootRarity,
    tribute_count: 2,
    reward_chest: 'legendary_chest' as const,
    legendary_bonus_chance: 1.0,
    description: 'A 4-day hunt for the mythic hydra. Demands epic tribute.',
    lore: 'Seven heads. Seven deaths. A prize unlike any other.',
  },
  eternal: {
    name: 'Eternal Raid',
    duration_days: 7,
    color: '#f59e0b',
    icon: '⚡',
    boss_hp: 20_000_000,
    contribution_per_win: 800_000,
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
    tribute_min_rarity: 'legendary' as LootRarity,
    tribute_count: 2,
    reward_chest: 'legendary_chest' as const,
    legendary_bonus_chance: 1.0,
    raid_medals: 10,
    description: 'A 7-day clash with an eternal titan. Demands legendary tribute.',
    lore: 'Before the world was named, the Titan ruled. It still does.',
  },
} as const satisfies Record<RaidTierId, {
  name: string
  duration_days: number
  color: string
  icon: string
  boss_hp: number
  contribution_per_win: number
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

const RARITY_ORDER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']
export function rarityMeetsMin(rarity: LootRarity, minRarity: LootRarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minRarity)
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

export async function createRaid(
  leaderId: string,
  tier: RaidTierId,
  tributeItems: TributeItem[],
): Promise<{ ok: boolean; raid?: Raid; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }
  const cfg = RAID_TIER_CONFIGS[tier]
  const now = new Date()
  const endsAt = new Date(now.getTime() + cfg.duration_days * 86_400_000).toISOString()

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
    })
    .select()
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Failed to create raid' }

  // Add leader as first participant
  await supabase.from('raid_participants').insert({
    raid_id: (data as Raid).id,
    user_id: leaderId,
    tribute_paid: true,
    daily_attacks: [],
  }).then(() => {}).catch(() => {})

  return { ok: true, raid: data as Raid }
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
      .in('status', ['forming', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!leadRaid) return { raid: null, participants: [] }
    const { data: parts } = await supabase
      .from('raid_participants')
      .select('*')
      .eq('raid_id', (leadRaid as Raid).id)
    return { raid: leadRaid as Raid, participants: (parts as RaidParticipant[]) ?? [] }
  }

  const raidIds = partRows.map((r) => r.raid_id as string)
  const { data: raids } = await supabase
    .from('raids')
    .select('*')
    .in('id', raidIds)
    .in('status', ['forming', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)

  const raid = (raids?.[0] as Raid) ?? null
  if (!raid) return { raid: null, participants: [] }

  const { data: parts } = await supabase
    .from('raid_participants')
    .select('*')
    .eq('raid_id', raid.id)

  return { raid, participants: (parts as RaidParticipant[]) ?? [] }
}

export async function joinRaid(
  raidId: string,
  userId: string,
  username: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' }

  const { error } = await supabase.from('raid_participants').insert({
    raid_id: raidId,
    user_id: userId,
    username,
    tribute_paid: false,
    daily_attacks: [],
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
