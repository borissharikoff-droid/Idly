import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPrestigeCounts,
  getPrestigeCount,
  prestigeSkill,
  getPrestigeXpMultiplier,
  computeTotalSkillLevelWithPrestige,
  canPrestige,
  getPrestigeTier,
  PRESTIGE_TIERS,
  skillLevelFromXP,
} from '../renderer/lib/skills'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

describe('prestige system', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
    vi.restoreAllMocks()

    // Ensure window object exists for prestigeSkill's electronAPI check
    if (!('window' in globalThis)) {
      Object.defineProperty(globalThis, 'window', {
        value: globalThis,
        configurable: true,
      })
    }
  })

  describe('getPrestigeCounts', () => {
    it('returns empty object when no prestige data exists', () => {
      expect(getPrestigeCounts()).toEqual({})
    })

    it('returns stored prestige counts', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 2, gamer: 1 }))
      const counts = getPrestigeCounts()
      expect(counts).toEqual({ developer: 2, gamer: 1 })
    })

    it('returns empty object on corrupted JSON', () => {
      localStorage.setItem('grindly_prestige', 'not json')
      expect(getPrestigeCounts()).toEqual({})
    })
  })

  describe('getPrestigeCount', () => {
    it('returns 0 for non-existent skill', () => {
      expect(getPrestigeCount('developer')).toBe(0)
    })

    it('returns 0 for a completely unknown skill id', () => {
      expect(getPrestigeCount('nonexistent_skill_xyz')).toBe(0)
    })

    it('returns stored count for a skill', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 3 }))
      expect(getPrestigeCount('developer')).toBe(3)
    })
  })

  describe('prestigeSkill', () => {
    it('returns null if skill is not at max level', () => {
      localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 100 }))
      const result = prestigeSkill('developer')
      expect(result).toBeNull()
    })

    it('prestiges a max-level skill and resets XP', () => {
      // 3_600_000 = MAX_XP = level 99
      localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 3_600_000 }))
      const result = prestigeSkill('developer')

      expect(result).not.toBeNull()
      expect(result!.tier).toBe(1)
      expect(result!.label).toBe('Bronze')

      // XP should be reset to 0
      const xpData = JSON.parse(localStorage.getItem('grindly_skill_xp')!)
      expect(xpData.developer).toBe(0)

      // Prestige count should be 1
      expect(getPrestigeCount('developer')).toBe(1)
    })

    it('increments prestige count on successive prestiges', () => {
      // First prestige
      localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 3_600_000 }))
      prestigeSkill('developer')
      expect(getPrestigeCount('developer')).toBe(1)

      // Second prestige (re-max the skill)
      localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 3_600_000 }))
      const result = prestigeSkill('developer')
      expect(result).not.toBeNull()
      expect(result!.tier).toBe(2)
      expect(result!.label).toBe('Silver')
      expect(getPrestigeCount('developer')).toBe(2)
    })

    it('returns null at max prestige tier (5)', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 5 }))
      localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 3_600_000 }))
      const result = prestigeSkill('developer')
      expect(result).toBeNull()
    })

    it('returns correct tier info for each prestige level', () => {
      for (let i = 0; i < 5; i++) {
        localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 3_600_000 }))
        const result = prestigeSkill('developer')
        expect(result).not.toBeNull()
        expect(result!.tier).toBe(i + 1)
        expect(result!.label).toBe(PRESTIGE_TIERS[i].label)
      }
    })
  })

  describe('canPrestige', () => {
    it('returns false when skill is not max level', () => {
      expect(canPrestige('developer', 100)).toBe(false)
    })

    it('returns true when skill is max level and under max prestige', () => {
      expect(canPrestige('developer', 3_600_000)).toBe(true)
    })

    it('returns false when already at max prestige', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 5 }))
      expect(canPrestige('developer', 3_600_000)).toBe(false)
    })
  })

  describe('getPrestigeXpMultiplier', () => {
    it('returns 1.0 with 0 prestiges', () => {
      expect(getPrestigeXpMultiplier('developer')).toBe(1.0)
    })

    it('returns 1.05 with 1 prestige', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 1 }))
      expect(getPrestigeXpMultiplier('developer')).toBeCloseTo(1.05)
    })

    it('returns 1.15 with 3 prestiges', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 3 }))
      expect(getPrestigeXpMultiplier('developer')).toBeCloseTo(1.15)
    })

    it('returns 1.25 at max prestige (5)', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 5 }))
      expect(getPrestigeXpMultiplier('developer')).toBeCloseTo(1.25)
    })

    it('returns 1.0 for a skill with no prestige data', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ gamer: 2 }))
      expect(getPrestigeXpMultiplier('developer')).toBe(1.0)
    })
  })

  describe('getPrestigeTier', () => {
    it('returns null for non-prestiged skill', () => {
      expect(getPrestigeTier('developer')).toBeNull()
    })

    it('returns correct tier for prestiged skill', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 3 }))
      const tier = getPrestigeTier('developer')
      expect(tier).not.toBeNull()
      expect(tier!.label).toBe('Gold')
      expect(tier!.borderColor).toBe('#ffd700')
    })
  })

  describe('computeTotalSkillLevelWithPrestige', () => {
    it('returns base total when no prestiges exist', () => {
      const rows = [{ skill_id: 'developer', total_xp: 3_600_000 }]
      const result = computeTotalSkillLevelWithPrestige(rows)
      // developer at 99, all others at 0
      expect(result).toBe(99)
    })

    it('adds prestige bonus levels (99 per prestige)', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 2 }))
      const rows = [{ skill_id: 'developer', total_xp: 3_600_000 }]
      const result = computeTotalSkillLevelWithPrestige(rows)
      // 99 base + 2*99 prestige bonus = 297
      expect(result).toBe(99 + 2 * 99)
    })

    it('handles multiple skills with prestige', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 1, gamer: 3 }))
      const rows = [
        { skill_id: 'developer', total_xp: 3_600_000 },
        { skill_id: 'gamer', total_xp: 3_600_000 },
      ]
      const result = computeTotalSkillLevelWithPrestige(rows)
      // developer: 99 + 1*99 = 198, gamer: 99 + 3*99 = 396, total = 594
      expect(result).toBe(99 + 1 * 99 + 99 + 3 * 99)
    })

    it('handles empty rows with prestige data', () => {
      localStorage.setItem('grindly_prestige', JSON.stringify({ developer: 2 }))
      const result = computeTotalSkillLevelWithPrestige([])
      // developer level 0 + 2*99 prestige bonus
      expect(result).toBe(2 * 99)
    })
  })
})
