import { playClickSound } from '../../lib/sounds'
import { ShoppingBag } from '../../lib/icons'

interface BackpackButtonProps {
  onClick: () => void
  className?: string
}

export function BackpackButton({ onClick, className = '' }: BackpackButtonProps) {
  return (
    <button
      type="button"
      onClick={() => { playClickSound(); onClick() }}
      className={`w-8 h-8 rounded-lg bg-discord-card/60 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:border-white/10 transition-colors focus:outline-none ${className}`}
      title="Backpack"
    >
      <ShoppingBag className="w-[15px] h-[15px]" aria-hidden />
    </button>
  )
}
