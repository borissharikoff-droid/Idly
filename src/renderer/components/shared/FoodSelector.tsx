import { useState } from 'react'
import { FOOD_ITEMS, type FoodItemDef } from '../../lib/cooking'
import type { FoodLoadoutSlot } from '../../lib/combat'

interface FoodSelectorProps {
  slots: (FoodLoadoutSlot | null)[]
  onChange: (slots: (FoodLoadoutSlot | null)[]) => void
  ownedItems: Record<string, number>
}

export function FoodSelector({ slots, onChange, ownedItems }: FoodSelectorProps) {
  const [pickerIdx, setPickerIdx] = useState<number | null>(null)

  const hasAnyFood = FOOD_ITEMS.some((f) => (ownedItems[f.id] ?? 0) > 0)
  const availableFood = FOOD_ITEMS.filter((f) => {
    const owned = ownedItems[f.id] ?? 0
    const usedInSlots = slots.reduce((sum, s) => sum + (s && s.foodId === f.id ? s.qty : 0), 0)
    return owned - usedInSlots > 0
  })

  if (!hasAnyFood && !slots.some(Boolean)) return null

  const handlePick = (idx: number, food: FoodItemDef) => {
    const owned = ownedItems[food.id] ?? 0
    const usedInOtherSlots = slots.reduce((sum, s, i) => sum + (i !== idx && s && s.foodId === food.id ? s.qty : 0), 0)
    const available = owned - usedInOtherSlots
    if (available <= 0) return
    const next = [...slots]
    next[idx] = { foodId: food.id, qty: Math.min(available, 10), effect: food.effect }
    onChange(next)
    setPickerIdx(null)
  }

  const handleClear = (idx: number) => {
    const next = [...slots]
    next[idx] = null
    onChange(next)
  }

  return (
    <div className="space-y-1.5">
      {/* Slot row */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 font-mono">Food <span className="text-gray-700">(1/run)</span>:</span>
        {slots.map((slot, idx) => {
          const food = slot ? FOOD_ITEMS.find((f) => f.id === slot.foodId) : null
          const isOpen = pickerIdx === idx
          return (
            <div key={idx} className="relative">
              <button
                type="button"
                onClick={() => setPickerIdx(isOpen ? null : idx)}
                className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs transition-colors ${
                  isOpen
                    ? 'border-cyber-neon/40 bg-cyber-neon/10 text-cyber-neon'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                }`}
                title={food
                  ? [
                      food.name,
                      food.effect.heal ? `+${food.effect.heal}HP instant` : '',
                      food.effect.buffAtk ? `+${food.effect.buffAtk}ATK` : '',
                      food.effect.buffDef ? `+${food.effect.buffDef}DEF` : '',
                      food.effect.buffRegen ? `+${food.effect.buffRegen}reg` : '',
                      (food.effect.buffAtk || food.effect.buffDef || food.effect.buffRegen) && food.effect.buffDurationSec
                        ? `for ${food.effect.buffDurationSec}s` : '',
                      '· consumed on use',
                    ].filter(Boolean).join(' · ')
                  : 'Add food'}
              >
                {food ? (
                  <>
                    <span>{food.icon}</span>
                    <span className="absolute -bottom-0.5 -right-0.5 text-[10px] font-bold text-white bg-black/60 rounded px-0.5">{slot!.qty}</span>
                  </>
                ) : (
                  <span className="text-gray-600">+</span>
                )}
              </button>
              {slot && (
                <button
                  type="button"
                  onClick={() => handleClear(idx)}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500/80 text-[10px] text-white flex items-center justify-center hover:bg-red-500"
                >×</button>
              )}
            </div>
          )
        })}
      </div>

      {/* Inline picker — expands below the slot row, no floating */}
      {pickerIdx !== null && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
          {availableFood.length === 0 ? (
            <p className="text-[10px] text-gray-600 font-mono text-center py-2">No food in inventory</p>
          ) : (
            availableFood.map((f) => {
              const owned = ownedItems[f.id] ?? 0
              const usedOther = slots.reduce((sum, s, i) => sum + (i !== pickerIdx && s && s.foodId === f.id ? s.qty : 0), 0)
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handlePick(pickerIdx, f)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.06] transition-colors border-b border-white/[0.04] last:border-0"
                >
                  <span className="text-sm shrink-0">{f.icon}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-gray-200">{f.name}</span>
                    {f.effect.heal && <span className="text-[10px] font-medium px-1 rounded" style={{ color: '#4ade80', background: 'rgba(74,222,128,0.12)' }}>+{f.effect.heal}HP</span>}
                    {f.effect.buffAtk && <span className="text-[10px] font-medium px-1 rounded" style={{ color: '#f87171', background: 'rgba(248,113,113,0.12)' }}>+{f.effect.buffAtk}ATK</span>}
                    {f.effect.buffDef && <span className="text-[10px] font-medium px-1 rounded" style={{ color: '#818cf8', background: 'rgba(129,140,248,0.12)' }}>+{f.effect.buffDef}DEF</span>}
                    {f.effect.buffRegen && <span className="text-[10px] font-medium px-1 rounded" style={{ color: '#34d399', background: 'rgba(52,211,153,0.12)' }}>+{f.effect.buffRegen}reg</span>}
                    {f.effect.goldBonusPct && <span className="text-[10px] font-medium px-1 rounded" style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.12)' }}>+{f.effect.goldBonusPct}%g</span>}
                    {f.effect.dropBonusPct && <span className="text-[10px] font-medium px-1 rounded" style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.12)' }}>+{f.effect.dropBonusPct}%drop</span>}
                    {f.effect.buffDurationSec && (f.effect.buffAtk || f.effect.buffDef || f.effect.buffRegen) && (
                      <span className="text-[10px] font-mono text-gray-600">{f.effect.buffDurationSec}s</span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 shrink-0">×{owned - usedOther}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
