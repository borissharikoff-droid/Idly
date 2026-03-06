import { playClickSound } from '../../lib/sounds'

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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 7V6a4 4 0 0 1 8 0v1" />
        <path d="M6 7h12a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1z" />
        <path d="M9 12h6" />
      </svg>
    </button>
  )
}
