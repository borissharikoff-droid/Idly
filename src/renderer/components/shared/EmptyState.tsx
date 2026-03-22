interface EmptyStateProps {
  title: string
  description?: string
  icon?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({ title, description, icon = '•', actionLabel, onAction, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center px-4 py-8 ${className}`}>
      <div className="w-12 h-12 rounded-card bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4 text-2xl leading-none">
        {icon}
      </div>
      <p className="text-white/80 text-sm font-medium mb-1">{title}</p>
      {description && (
        <p className="text-gray-500 text-xs leading-relaxed max-w-[220px]">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-xs px-4 py-1.5 rounded border border-white/12 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
