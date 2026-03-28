import { AlertTriangle } from '../../lib/icons'

interface ErrorStateProps {
  message: string
  onRetry?: () => void
  retryLabel?: string
  secondaryAction?: { label: string; onClick: () => void }
  className?: string
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Retry',
  secondaryAction,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center px-4 py-8 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-12 h-12 rounded-card bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center mb-4">
        <AlertTriangle className="w-5 h-5 text-red-400" />
      </div>
      <p className="text-red-400 text-sm font-medium mb-1">Something went wrong</p>
      <p className="text-gray-500 text-xs leading-relaxed max-w-[220px] mb-4">{message}</p>
      {(onRetry || secondaryAction) && (
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs px-4 py-1.5 rounded bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
            >
              {retryLabel}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="text-xs px-4 py-1.5 rounded bg-white/5 text-white/70 border border-white/12 hover:bg-white/10 hover:text-white transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
