import { LOOT_ITEMS, LOOT_SLOTS, POTION_MAX, getItemPower, type LootSlot } from '../../lib/loot'
import { computePlayerStats } from '../../lib/combat'
import { LootVisual, RARITY_THEME, normalizeRarity, SLOT_META } from '../loot/LootUI'
import { BuffTooltip } from '../shared/BuffTooltip'
import { playClickSound } from '../../lib/sounds'

export interface CharacterPanelProps {
  equippedBySlot: Partial<Record<LootSlot, string>>
  permanentStats?: { atk: number; hp: number; hpRegen: number }
  warriorBonuses?: { atk: number; hp: number; hpRegen: number }
  onSlotClick?: (slot: LootSlot, itemId: string) => void
  locked?: boolean
}

// Горизонтальная карточка — head / body / legs / ring
function HSlot({
  slot,
  equippedBySlot,
  onSlotClick,
  locked,
}: {
  slot: LootSlot
  equippedBySlot: Partial<Record<LootSlot, string>>
  onSlotClick?: (slot: LootSlot, itemId: string) => void
  locked?: boolean
}) {
  const meta = SLOT_META[slot]
  const item = (equippedBySlot[slot] ? LOOT_ITEMS.find((x) => x.id === equippedBySlot[slot]) : null) ?? null
  const theme = item ? RARITY_THEME[normalizeRarity(item.rarity)] : null

  const inner = (
    <div
      className="flex items-center gap-2.5 h-full px-2.5 overflow-hidden"
      style={{
        borderLeft: `3px solid ${theme ? theme.color : 'rgba(255,255,255,0.10)'}`,
        background: theme
          ? `linear-gradient(90deg, ${theme.glow}28 0%, rgba(7,7,14,0.96) 50%)`
          : 'rgba(7,7,14,0.82)',
        boxShadow: 'inset 0 0 14px rgba(0,0,0,0.45)',
      }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={theme
          ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}55 0%, rgba(5,5,10,0.95) 65%)`, border: `1px solid ${theme.border}55` }
          : { background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {item
          ? <LootVisual icon={item.icon} image={item.image} className="w-[18px] h-[18px] object-contain" scale={item.renderScale ?? 1} />
          : <span className="text-sm leading-none" style={{ opacity: 0.12 }}>{meta.icon}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[7px] font-mono uppercase tracking-widest leading-none" style={{ color: 'rgba(156,163,175,0.38)' }}>
          {meta.label}
        </p>
        <p className="text-[10px] font-semibold truncate leading-tight mt-[3px]"
          style={{ color: item ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.18)' }}>
          {item ? item.name : 'Empty'}
        </p>
      </div>
    </div>
  )

  const clickable = Boolean(item && onSlotClick && !locked)

  return (
    <BuffTooltip item={item} placement="top" stretch>
      <div
        className={`h-full rounded-lg overflow-hidden${clickable ? ' cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all' : ''}`}
        style={{ border: `1px solid ${theme ? theme.border : 'rgba(255,255,255,0.07)'}` }}
        role={clickable ? 'button' : undefined}
        onClick={clickable ? () => { playClickSound(); onSlotClick!(slot, item!.id) } : undefined}
      >
        {inner}
      </div>
    </BuffTooltip>
  )
}

// Вертикальная карточка — weapon (высокая, занимает 2 строки)
function VSlot({
  slot,
  equippedBySlot,
  onSlotClick,
  locked,
}: {
  slot: LootSlot
  equippedBySlot: Partial<Record<LootSlot, string>>
  onSlotClick?: (slot: LootSlot, itemId: string) => void
  locked?: boolean
}) {
  const meta = SLOT_META[slot]
  const item = (equippedBySlot[slot] ? LOOT_ITEMS.find((x) => x.id === equippedBySlot[slot]) : null) ?? null
  const theme = item ? RARITY_THEME[normalizeRarity(item.rarity)] : null

  const inner = (
    <div
      className="flex flex-col items-center justify-center gap-1.5 h-full px-2 overflow-hidden"
      style={theme
        ? {
            background: `radial-gradient(ellipse at 50% 42%, ${theme.glow}30 0%, rgba(7,7,14,0.97) 68%)`,
            boxShadow: `inset 0 0 18px rgba(0,0,0,0.55), 0 0 8px ${theme.glow}14`,
          }
        : {
            background: 'rgba(7,7,14,0.84)',
            boxShadow: 'inset 0 0 14px rgba(0,0,0,0.5)',
          }}
    >
      <p className="text-[7px] font-mono uppercase tracking-widest leading-none" style={{ color: 'rgba(156,163,175,0.38)' }}>
        {meta.label}
      </p>
      <div
        className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden"
        style={theme
          ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}55 0%, rgba(5,5,10,0.95) 70%)`, border: `1px solid ${theme.border}55` }
          : { background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {item
          ? <LootVisual icon={item.icon} image={item.image} className="w-10 h-10 object-contain" scale={item.renderScale ?? 1} />
          : <span className="text-2xl leading-none" style={{ opacity: 0.12 }}>{meta.icon}</span>}
      </div>
      <p className="text-[8px] font-mono leading-none text-center w-full truncate px-1"
        style={{ color: item ? 'rgba(255,255,255,0.65)' : 'rgba(156,163,175,0.25)' }}>
        {item ? item.name : '—'}
      </p>
      {theme && (
        <div className="w-8 h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${theme.color}, transparent)` }} />
      )}
    </div>
  )

  const clickable = Boolean(item && onSlotClick && !locked)

  return (
    <BuffTooltip item={item} placement="top" stretch>
      <div
        className={`h-full rounded-lg overflow-hidden${clickable ? ' cursor-pointer hover:brightness-110 transition-all' : ''}`}
        style={{ border: `1px solid ${theme ? theme.border : 'rgba(255,255,255,0.08)'}` }}
        role={clickable ? 'button' : undefined}
        onClick={clickable ? () => { playClickSound(); onSlotClick!(slot, item!.id) } : undefined}
      >
        {inner}
      </div>
    </BuffTooltip>
  )
}

export function CharacterPanel({
  equippedBySlot,
  permanentStats,
  warriorBonuses,
  onSlotClick,
  locked,
}: CharacterPanelProps) {
  const playerStats = computePlayerStats(equippedBySlot, permanentStats, warriorBonuses)

  const ip = LOOT_SLOTS.reduce((sum, s) => {
    const id = equippedBySlot[s]
    if (!id) return sum
    const it = LOOT_ITEMS.find((x) => x.id === id)
    return sum + (it ? getItemPower(it) : 0)
  }, 0)

  const PMAX = POTION_MAX
  const statRows = [
    { icon: '⚔', value: playerStats.atk,     label: 'ATK', unit: '/s', color: '#f87171', maxed: (permanentStats?.atk ?? 0) >= PMAX },
    { icon: '♥', value: playerStats.hp,       label: 'HP',  unit: '',   color: '#4ade80', maxed: (permanentStats?.hp ?? 0) >= PMAX },
    { icon: '❋', value: playerStats.hpRegen,  label: 'REG', unit: '/s', color: '#22d3ee', maxed: (permanentStats?.hpRegen ?? 0) >= PMAX },
    { icon: '✦', value: ip,                   label: 'IP',  unit: '',   color: '#fcd34d', maxed: false },
  ]

  const p = { equippedBySlot, onSlotClick, locked }
  const ROW_H = 46  // высота одной строки
  const GAP   = 6   // зазор между строками
  const TOTAL = ROW_H * 2 + GAP

  return (
    <div className="space-y-1.5">
      {/* Снаряжение */}
      <div className="flex gap-1.5" style={{ height: TOTAL }}>

        {/* Левая колонка — weapon (высокий) */}
        <div style={{ width: 80 }}>
          <VSlot slot="weapon" {...p} />
        </div>

        {/* Средняя колонка — head + legs */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div style={{ height: ROW_H }}><HSlot slot="head" {...p} /></div>
          <div style={{ height: ROW_H }}><HSlot slot="legs" {...p} /></div>
        </div>

        {/* Правая колонка — body + ring */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div style={{ height: ROW_H }}><HSlot slot="body" {...p} /></div>
          <div style={{ height: ROW_H }}><HSlot slot="ring" {...p} /></div>
        </div>

      </div>

      {/* Статы */}
      <div className="grid grid-cols-4 gap-1.5">
        {statRows.map(({ icon, value, label, unit, color, maxed }) => {
          const c = maxed ? '#f59e0b' : color
          return (
            <div
              key={label}
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${c}12 0%, rgba(7,7,14,0.90) 60%)`,
                border: `1px solid ${c}28`,
                boxShadow: `inset 0 0 8px rgba(0,0,0,0.4)`,
              }}
            >
              <span className="text-[11px] leading-none flex-shrink-0" style={{ color: c, textShadow: `0 0 8px ${c}88` }}>{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-mono font-bold tabular-nums leading-none" style={{ color: c }}>{value}</p>
                <p className="text-[7px] font-mono uppercase tracking-wide leading-none mt-[3px]" style={{ color: `${c}66` }}>{label}{unit}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
