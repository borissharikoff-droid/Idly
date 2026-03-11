export const STREAK_MULTIPLIERS = {
  day2: 1.08,
  day7: 1.2,
  day14: 1.4,
  day30: 1.75,
} as const

export const CATEGORY_XP_MULTIPLIER_CONFIG: Record<string, number> = {
  coding: 1.3,
  design: 1.2,
  creative: 1.1,
  learning: 1.15,
  music: 0.8,
  games: 0.85,
  social: 0.75,
  browsing: 0.8,
  other: 0.6,
  idle: 0,
}

export const SKILL_BOOST_SECONDS = 1800

export const ACHIEVEMENT_XP_REWARDS: Record<string, number> = {
  first_session: 15,
  code_warrior: 70,
  marathon: 60,
  ten_sessions: 90,
  fifty_sessions: 220,
  streak_2: 25,
  streak_7: 110,
  streak_14: 170,
  streak_30: 320,
  night_owl: 30,
  early_bird: 30,
  first_friend: 20,
  five_friends: 65,
  social_butterfly: 120,
  skill_developer_10: 35,
  skill_developer_50: 130,
  skill_developer_99: 550,
  skill_designer_10: 35,
  skill_designer_50: 120,
  skill_gamer_25: 70,
  polymath: 120,
  jack_of_all_trades: 260,
  // New skill milestones
  skill_warrior_25: 70,
  skill_farmer_25: 70,
  skill_crafter_25: 70,
  skill_chef_25: 70,
  total_skill_500: 300,
  // Farming
  first_harvest: 15,
  harvest_100: 150,
  all_seeds_planted: 100,
  void_harvest: 200,
  // Crafting
  first_craft: 15,
  craft_50: 150,
  craft_dragonfire: 300,
  // Cooking
  first_cook: 15,
  cook_mythic: 200,
  cook_50: 150,
  // Arena
  first_dungeon: 20,
  clear_all_zones: 250,
  kill_100_mobs: 100,
  dragon_slayer: 300,
  // Gold
  earn_1000_gold: 30,
  earn_10000_gold: 100,
  earn_100000_gold: 250,
}

export const REWARD_RARITY_TABLE: Record<'common' | 'rare' | 'epic' | 'legendary', string[]> = {
  common: ['badge', 'avatar'],
  rare: ['profile_frame', 'skill_boost'],
  epic: ['profile_frame', 'avatar'],
  legendary: ['profile_frame', 'avatar', 'badge'],
}
