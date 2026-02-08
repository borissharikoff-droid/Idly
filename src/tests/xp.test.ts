import { describe, it, expect } from 'vitest'
import {
  levelFromTotalXP,
  xpProgressInLevel,
  xpRequiredForLevel,
  totalXPForLevel,
  getTitleForLevel,
  getRewardsInRange,
  getStreakMultiplier,
  computeSessionXP,
  checkNewAchievements,
  checkSocialAchievements,
  checkSkillAchievements,
  getAchievementById,
} from '../renderer/lib/xp'

describe('xpRequiredForLevel', () => {
  it('returns 50 for levels 1-10', () => {
    expect(xpRequiredForLevel(1)).toBe(50)
    expect(xpRequiredForLevel(10)).toBe(50)
  })

  it('returns 100 for levels 11-25', () => {
    expect(xpRequiredForLevel(11)).toBe(100)
    expect(xpRequiredForLevel(25)).toBe(100)
  })

  it('returns 200 for levels 26-50', () => {
    expect(xpRequiredForLevel(26)).toBe(200)
    expect(xpRequiredForLevel(50)).toBe(200)
  })

  it('returns 400 for levels 51+', () => {
    expect(xpRequiredForLevel(51)).toBe(400)
    expect(xpRequiredForLevel(100)).toBe(400)
  })
})

describe('totalXPForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(totalXPForLevel(1)).toBe(0)
  })

  it('returns 50 for level 2', () => {
    expect(totalXPForLevel(2)).toBe(50)
  })

  it('returns 500 for level 11 (10 levels * 50 XP)', () => {
    expect(totalXPForLevel(11)).toBe(500)
  })
})

describe('levelFromTotalXP', () => {
  it('returns level 1 for 0 XP', () => {
    expect(levelFromTotalXP(0)).toBe(1)
  })

  it('returns level 2 for 50 XP (with progressive curve)', () => {
    expect(levelFromTotalXP(50)).toBe(2)
  })

  it('returns level 1 for negative XP', () => {
    expect(levelFromTotalXP(-10)).toBe(1)
  })

  it('increases level with XP', () => {
    expect(levelFromTotalXP(500)).toBeGreaterThan(levelFromTotalXP(100))
  })

  it('returns level 11 for 500 XP', () => {
    expect(levelFromTotalXP(500)).toBe(11)
  })
})

describe('xpProgressInLevel', () => {
  it('returns current=0, needed=50 for 0 XP (level 1)', () => {
    const { current, needed } = xpProgressInLevel(0)
    expect(current).toBe(0)
    expect(needed).toBe(50)
  })

  it('returns current=25, needed=50 for 25 XP (mid level 1)', () => {
    const { current, needed } = xpProgressInLevel(25)
    expect(current).toBe(25)
    expect(needed).toBe(50)
  })

  it('returns current=0, needed=100 for 500 XP (start of level 11)', () => {
    const { current, needed } = xpProgressInLevel(500)
    expect(current).toBe(0)
    expect(needed).toBe(100)
  })
})

describe('getTitleForLevel', () => {
  it('returns Newbie for level 1', () => {
    expect(getTitleForLevel(1)).toBe('Newbie')
  })

  it('returns Rookie for level 5', () => {
    expect(getTitleForLevel(5)).toBe('Rookie')
  })

  it('returns Grinder for level 10', () => {
    expect(getTitleForLevel(10)).toBe('Grinder')
  })

  it('returns Grinder for level 12 (between 10 and 15)', () => {
    expect(getTitleForLevel(12)).toBe('Grinder')
  })

  it('returns Transcendent for level 99', () => {
    expect(getTitleForLevel(99)).toBe('Transcendent')
  })
})

describe('getRewardsInRange', () => {
  it('returns rewards between levels', () => {
    const rewards = getRewardsInRange(1, 10)
    expect(rewards.length).toBe(2) // level 5 and 10
    expect(rewards.some(r => r.title === 'Rookie')).toBe(true)
    expect(rewards.some(r => r.title === 'Grinder')).toBe(true)
  })

  it('returns empty for no rewards in range', () => {
    const rewards = getRewardsInRange(1, 3)
    expect(rewards.length).toBe(0)
  })
})

describe('getStreakMultiplier', () => {
  it('returns 1.0 for streak 0', () => {
    expect(getStreakMultiplier(0)).toBe(1.0)
  })

  it('returns 1.0 for streak 1', () => {
    expect(getStreakMultiplier(1)).toBe(1.0)
  })

  it('returns 1.1 for streak 2-6', () => {
    expect(getStreakMultiplier(2)).toBe(1.1)
    expect(getStreakMultiplier(6)).toBe(1.1)
  })

  it('returns 1.25 for streak 7-13', () => {
    expect(getStreakMultiplier(7)).toBe(1.25)
    expect(getStreakMultiplier(13)).toBe(1.25)
  })

  it('returns 1.5 for streak 14-29', () => {
    expect(getStreakMultiplier(14)).toBe(1.5)
    expect(getStreakMultiplier(29)).toBe(1.5)
  })

  it('returns 2.0 for streak 30+', () => {
    expect(getStreakMultiplier(30)).toBe(2.0)
    expect(getStreakMultiplier(100)).toBe(2.0)
  })
})

describe('computeSessionXP', () => {
  it('gives more XP for coding than gaming', () => {
    const now = Date.now()
    const codingXP = computeSessionXP(3600, [
      { category: 'coding', start_time: now, end_time: now + 3600000 },
    ])
    const gamingXP = computeSessionXP(3600, [
      { category: 'games', start_time: now, end_time: now + 3600000 },
    ])
    expect(codingXP).toBeGreaterThan(gamingXP)
  })

  it('returns non-zero for empty activities', () => {
    const xp = computeSessionXP(600, [])
    expect(xp).toBeGreaterThan(0)
  })

  it('handles null category', () => {
    const now = Date.now()
    const xp = computeSessionXP(600, [
      { category: null, start_time: now, end_time: now + 600000 },
    ])
    expect(xp).toBeGreaterThan(0)
  })
})

describe('checkNewAchievements', () => {
  it('unlocks first_session on first session', () => {
    const result = checkNewAchievements(
      { duration_seconds: 60, start_time: Date.now() },
      [],
      0,
      1,
      [],
    )
    const ids = result.map((r) => r.id)
    expect(ids).toContain('first_session')
  })

  it('does not re-unlock already unlocked achievements', () => {
    const result = checkNewAchievements(
      { duration_seconds: 60, start_time: Date.now() },
      [],
      0,
      1,
      ['first_session'],
    )
    const ids = result.map((r) => r.id)
    expect(ids).not.toContain('first_session')
  })

  it('unlocks streak_7 at streak 7', () => {
    const result = checkNewAchievements(
      { duration_seconds: 60, start_time: Date.now() },
      [],
      7,
      10,
      [],
    )
    const ids = result.map((r) => r.id)
    expect(ids).toContain('streak_7')
    expect(ids).toContain('streak_2')
  })

  it('unlocks marathon for 2+ hour session', () => {
    const result = checkNewAchievements(
      { duration_seconds: 7200, start_time: Date.now() },
      [],
      0,
      1,
      [],
    )
    const ids = result.map((r) => r.id)
    expect(ids).toContain('marathon')
  })

  it('unlocks code_warrior for 2+ hours coding', () => {
    const now = Date.now()
    const result = checkNewAchievements(
      { duration_seconds: 7200, start_time: now },
      [{ category: 'coding', start_time: now, end_time: now + 7200000 }],
      0,
      1,
      [],
    )
    const ids = result.map((r) => r.id)
    expect(ids).toContain('code_warrior')
  })
})

describe('checkSocialAchievements', () => {
  it('unlocks first_friend at 1 friend', () => {
    const result = checkSocialAchievements(1, [])
    expect(result.map((r) => r.id)).toContain('first_friend')
  })

  it('unlocks five_friends at 5 friends', () => {
    const result = checkSocialAchievements(5, [])
    expect(result.map((r) => r.id)).toContain('five_friends')
  })
})

describe('checkSkillAchievements', () => {
  it('unlocks skill_developer_10 at dev level 10', () => {
    const result = checkSkillAchievements({ developer: 10 }, [])
    expect(result.map((r) => r.id)).toContain('skill_developer_10')
  })

  it('unlocks polymath for 3 skills at 25+', () => {
    const result = checkSkillAchievements(
      { developer: 25, designer: 25, gamer: 25 },
      [],
    )
    expect(result.map((r) => r.id)).toContain('polymath')
  })
})

describe('getAchievementById', () => {
  it('returns achievement for valid id', () => {
    const ach = getAchievementById('first_session')
    expect(ach).toBeDefined()
    expect(ach!.name).toBe('First Steps')
  })

  it('returns undefined for invalid id', () => {
    expect(getAchievementById('nonexistent')).toBeUndefined()
  })
})
