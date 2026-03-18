import { useEffect, useState } from 'react'
import { LOOT_ITEMS } from '../../lib/loot'
import { SKILLS, skillLevelFromXP } from '../../lib/skills'
import { computeWarriorBonuses } from '../../lib/combat'
import { useInventoryStore } from '../../stores/inventoryStore'
import { CharacterPanel } from './CharacterPanel'
import { ItemInspectModal } from '../shared/ItemInspectModal'

interface CharacterCardProps {
  locked?: boolean
  /** When provided, slot clicks call this instead of the built-in inspect modal. */
  onSlotInspect?: (itemId: string) => void
}

export function CharacterCard({ locked = false, onSlotInspect }: CharacterCardProps) {
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats  = useInventoryStore((s) => s.permanentStats)

  const [skillLevels, setSkillLevels]   = useState<Record<string, number>>({})
  const [inspectItemId, setInspectItemId] = useState<string | null>(null)

  useEffect(() => {
    const buildLevels = (rows: { skill_id: string; total_xp: number }[]): Record<string, number> => {
      const xpMap = new Map(rows.map((r) => [r.skill_id, r.total_xp]))
      return Object.fromEntries(SKILLS.map((s) => [s.id, skillLevelFromXP(xpMap.get(s.id) ?? 0)]))
    }
    const load = () => {
      const api = window.electronAPI
      if (api?.db?.getAllSkillXP) {
        api.db.getAllSkillXP()
          .then((rows: { skill_id: string; total_xp: number }[]) => setSkillLevels(buildLevels(rows ?? [])))
          .catch(() => setSkillLevels({}))
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
          setSkillLevels(buildLevels(Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp }))))
        } catch { setSkillLevels({}) }
      }
    }
    load()
    const onVisibility = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const warriorLevel   = skillLevels['warrior'] ?? 0
  const warriorBonuses = computeWarriorBonuses(warriorLevel)
  const inspectItem    = inspectItemId ? (LOOT_ITEMS.find((x) => x.id === inspectItemId) ?? null) : null

  return (
    <>
      <div className="rounded-xl border border-white/[0.09] bg-discord-card/80 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-mono font-semibold">Character</p>
          <div className="flex items-center gap-2">
            {warriorLevel > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{ color: '#EF4444', background: '#EF444415', border: '1px solid #EF444430' }}>
                ⚔ Lvl.{warriorLevel}
              </span>
            )}
            {locked && <span className="text-[10px] text-amber-400/90 font-mono">locked</span>}
          </div>
        </div>

        <CharacterPanel
          equippedBySlot={equippedBySlot}
          permanentStats={permanentStats}
          warriorBonuses={warriorBonuses}
          onSlotClick={(_, itemId) => { onSlotInspect ? onSlotInspect(itemId) : setInspectItemId(itemId) }}
          locked={locked}
        />
      </div>

      {!onSlotInspect && (
        <ItemInspectModal
          item={inspectItem}
          locked={locked}
          onClose={() => setInspectItemId(null)}
        />
      )}
    </>
  )
}
