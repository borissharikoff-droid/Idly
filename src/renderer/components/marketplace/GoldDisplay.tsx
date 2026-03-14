import { useGoldStore } from '../../stores/goldStore'
import { getUIIcons } from '../../lib/itemConfig'
import { useAdminConfigStore } from '../../stores/adminConfigStore'

export function GoldDisplay() {
  useAdminConfigStore((s) => s.rev) // re-render on config change
  const gold = useGoldStore((s) => s.gold)
  const goldIcon = getUIIcons().gold || '🪙'
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-500/25">
      <span className="text-amber-400" aria-hidden>
        {goldIcon.startsWith('data:') || goldIcon.startsWith('http')
          ? <img src={goldIcon} alt="" className="w-[18px] h-[18px] object-contain inline" draggable={false} />
          : goldIcon}
      </span>
      <span className="text-sm font-bold text-amber-400 tabular-nums">{gold ?? 0}</span>
    </div>
  )
}
