import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOOT_ITEMS,
  getEquippedPerkRuntime,
  openChest,
  rollChestDrop,
  estimateLootDropRate,
} from '../renderer/lib/loot'

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

describe('loot system', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('rolls chest and opens to item', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const chestRoll = rollChestDrop(
      { source: 'skill_grind', focusCategory: 'coding' },
      { rollsSinceEpicChest: 0, rollsSinceRareChest: 0, rollsSinceLegendaryChest: 0 },
    )
    expect(chestRoll.chestType).toBeTruthy()
    const open = openChest(chestRoll.chestType, { source: 'session_complete' })
    expect(open?.item.id).toBeTruthy()
  })

  it('calculates runtime perks from equipped slots', () => {
    const perk = getEquippedPerkRuntime({
      head: 'shadow_helm',
      body: 'shadow_plate',
      weapon: 'shadow_sword',
      ring: 'shadow_ring',
    })
    // Shadow set gives ATK and HP perks
    expect(LOOT_ITEMS.find(x => x.id === 'shadow_helm')).toBeTruthy()
    expect(LOOT_ITEMS.find(x => x.id === 'shadow_plate')).toBeTruthy()
  })

  it('estimates drop rate for bag-drop items', () => {
    const rate = estimateLootDropRate('wooden_helm', { source: 'skill_grind', focusCategory: 'coding' })
    expect(rate).toBeGreaterThan(0)
  })

  it('registers all bag-drop set items with unique ids', () => {
    const setIds = [
      'wooden_helm', 'wooden_plate', 'wooden_sword', 'wooden_legs', 'wooden_ring',
      'copper_helm', 'copper_plate', 'copper_sword', 'copper_legs', 'copper_ring',
      'shadow_helm', 'shadow_plate', 'shadow_sword', 'shadow_legs', 'shadow_ring',
      'golden_helm', 'golden_plate', 'golden_sword', 'golden_legs', 'golden_ring',
      'void_helm',   'void_plate',   'void_sword',   'void_legs',   'void_ring',
    ]
    const allIds = LOOT_ITEMS.map((item) => item.id)
    expect(new Set(allIds).size).toBe(allIds.length)
    for (const id of setIds) {
      expect(allIds).toContain(id)
    }
  })

  it('applies representative set perks in runtime', () => {
    const perk = getEquippedPerkRuntime({
      head: 'golden_helm',
      body: 'golden_plate',
      weapon: 'golden_sword',
      legs: 'golden_legs',
      ring: 'golden_ring',
    })
    expect(perk.globalXpMultiplier).toBeGreaterThan(1)
    expect(perk.streakShield).toBe(true)
    expect(perk.focusBoostMultiplier).toBeGreaterThan(1)
  })
})
