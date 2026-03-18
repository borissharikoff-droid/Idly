import { motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import { ChevronLeft } from '../../lib/icons'
import { playClickSound } from '../../lib/sounds'

interface BackButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

export function BackButton({ onClick, label = 'Back', className = '' }: BackButtonProps) {
  const handleClick = () => {
    playClickSound()
    onClick()
  }
  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={MOTION.interactive.tap}
      className={`flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm ${className}`}
      aria-label={label}
    >
      <ChevronLeft className="w-4 h-4" />
      <span className="font-mono text-xs">{label}</span>
    </motion.button>
  )
}
