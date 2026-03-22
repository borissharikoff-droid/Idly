interface InlineSuccessProps {
  message: string
  className?: string
}

export function InlineSuccess({ message, className = '' }: InlineSuccessProps) {
  return (
    <p
      className={`flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/[0.08] border border-emerald-500/20 rounded px-3 py-1.5 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="text-emerald-500 shrink-0 font-bold leading-none">✓</span>
      {message}
    </p>
  )
}
