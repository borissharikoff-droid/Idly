import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rollSessionMaterialDrops } from '../renderer/lib/crafting'

describe('rollSessionMaterialDrops', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('under 0.5h threshold', () => {
    it('returns empty array for 0 hours', () => {
      expect(rollSessionMaterialDrops('coding', 0, [])).toEqual([])
    })

    it('returns empty array for 0.49 hours', () => {
      expect(rollSessionMaterialDrops('coding', 0.49, [])).toEqual([])
    })

    it('returns empty array for negative hours', () => {
      expect(rollSessionMaterialDrops('coding', -1, [])).toEqual([])
    })
  })

  describe('0.5h session (common material drop)', () => {
    it('drops 1 common material on successful roll (80% chance)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // 0.5 < 0.8 → success
      const drops = rollSessionMaterialDrops('coding', 0.5, [])
      expect(drops).toHaveLength(1)
      expect(drops[0].id).toBe('ore_iron') // coding → ore_iron
      expect(drops[0].qty).toBe(1)
    })

    it('drops nothing on failed roll (>80% chance)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.85) // 0.85 >= 0.8 → fail
      const drops = rollSessionMaterialDrops('coding', 0.5, [])
      expect(drops).toHaveLength(0)
    })

    it('uses category affinity for material type', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      const gamingDrops = rollSessionMaterialDrops('gaming', 0.5, [])
      expect(gamingDrops[0].id).toBe('monster_fang')

      const designDrops = rollSessionMaterialDrops('design', 0.5, [])
      expect(designDrops[0].id).toBe('magic_essence')
    })

    it('falls back to ore_iron for null category', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      const drops = rollSessionMaterialDrops(null, 0.5, [])
      expect(drops[0].id).toBe('ore_iron')
    })
  })

  describe('1h+ session (guaranteed common material)', () => {
    it('always drops 2 common material at 1h+', () => {
      const drops = rollSessionMaterialDrops('coding', 1.0, [])
      expect(drops).toHaveLength(1)
      expect(drops[0].id).toBe('ore_iron')
      expect(drops[0].qty).toBe(2)
    })
  })

  describe('2h session — rare material zone-gating', () => {
    it('does NOT drop rare materials without zone3 cleared', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      const drops = rollSessionMaterialDrops('coding', 2.0, [])
      // Only the common material should drop
      const rareIds = drops.filter(d => d.id === 'magic_essence' || d.id === 'ancient_scale')
      expect(rareIds).toHaveLength(0)
    })

    it('does NOT drop rare materials with only zone1 and zone2 cleared', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      const drops = rollSessionMaterialDrops('coding', 2.0, ['zone1', 'zone2'])
      const rareIds = drops.filter(d => d.id === 'magic_essence' || d.id === 'ancient_scale')
      expect(rareIds).toHaveLength(0)
    })

    it('drops rare material (magic_essence) with zone3 cleared when random < 0.5', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3) // < 0.5 → magic_essence
      const drops = rollSessionMaterialDrops('coding', 2.0, ['zone1', 'zone2', 'zone3'])
      const rareDrop = drops.find(d => d.id === 'magic_essence')
      expect(rareDrop).toBeDefined()
      expect(rareDrop!.qty).toBe(1)
    })

    it('drops rare material (ancient_scale) with zone3 cleared when random >= 0.5', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.7) // >= 0.5 → ancient_scale
      const drops = rollSessionMaterialDrops('coding', 2.0, ['zone1', 'zone2', 'zone3'])
      const rareDrop = drops.find(d => d.id === 'ancient_scale')
      expect(rareDrop).toBeDefined()
      expect(rareDrop!.qty).toBe(1)
    })
  })

  describe('3h session — void crystal zone-gating', () => {
    it('does NOT drop void crystal without zone5 cleared', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1) // would succeed the 50% roll
      const drops = rollSessionMaterialDrops('coding', 3.0, ['zone1', 'zone2', 'zone3'])
      const voidDrop = drops.find(d => d.id === 'void_crystal')
      expect(voidDrop).toBeUndefined()
    })

    it('does NOT drop void crystal without zone5 even with zone4', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      const drops = rollSessionMaterialDrops('coding', 3.0, ['zone1', 'zone2', 'zone3', 'zone4'])
      const voidDrop = drops.find(d => d.id === 'void_crystal')
      expect(voidDrop).toBeUndefined()
    })

    it('drops void crystal with zone5 cleared on successful roll (<50%)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3) // < 0.5 → void crystal drops
      const drops = rollSessionMaterialDrops('coding', 3.0, ['zone1', 'zone2', 'zone3', 'zone5'])
      const voidDrop = drops.find(d => d.id === 'void_crystal')
      expect(voidDrop).toBeDefined()
      expect(voidDrop!.qty).toBe(1)
    })

    it('does NOT drop void crystal with zone5 cleared on failed roll (>=50%)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6) // >= 0.5 → no void crystal
      const drops = rollSessionMaterialDrops('coding', 3.0, ['zone1', 'zone2', 'zone3', 'zone5'])
      const voidDrop = drops.find(d => d.id === 'void_crystal')
      expect(voidDrop).toBeUndefined()
    })

    it('3h session with all zones drops common + rare + void crystal', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.2) // passes all rolls
      const drops = rollSessionMaterialDrops('coding', 3.0, ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'])
      expect(drops.length).toBe(3)
      // common: ore_iron qty=2, rare: magic_essence qty=1, void_crystal qty=1
      expect(drops[0].id).toBe('ore_iron')
      expect(drops[0].qty).toBe(2)
      expect(drops[1].id).toBe('magic_essence')
      expect(drops[2].id).toBe('void_crystal')
    })
  })
})
