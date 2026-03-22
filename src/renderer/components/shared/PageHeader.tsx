import type { ReactNode } from 'react'
import { BackButton } from './BackButton'

interface PageHeaderProps {
  title: string
  icon?: ReactNode
  onBack?: () => void
  backLabel?: string
  rightSlot?: ReactNode
  titleSlot?: ReactNode
  className?: string
}

export function PageHeader({ title, icon, onBack, backLabel, rightSlot, titleSlot, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-center justify-between pb-3 mb-1 border-b border-white/[0.06] ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && <BackButton onClick={onBack} label={backLabel} />}
        {icon && (
          <span className="shrink-0 text-gray-500 flex items-center" aria-hidden>
            {icon}
          </span>
        )}
        <h2 className="text-sm font-semibold text-white/90 tracking-wide truncate">{title}</h2>
        {titleSlot}
      </div>
      {rightSlot && <div className="shrink-0 ml-2">{rightSlot}</div>}
    </div>
  )
}
