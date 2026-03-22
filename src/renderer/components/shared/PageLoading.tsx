interface SkeletonBlockProps {
  className?: string
}

export function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return <div className={`rounded bg-white/[0.06] animate-pulse ${className}`} />
}

interface PageLoadingProps {
  label?: string
  className?: string
}

export function PageLoading({ label = 'Loading...', className = '' }: PageLoadingProps) {
  return (
    <div className={`px-4 py-6 ${className}`} aria-live="polite" aria-busy="true">
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-24 rounded" />
        <SkeletonBlock className="h-12 w-full rounded-card" />
        <SkeletonBlock className="h-12 w-full rounded-card" />
        <SkeletonBlock className="h-12 w-4/5 rounded-card" />
      </div>
      <p className="mt-4 text-micro text-gray-600 font-mono tracking-wide">{label}</p>
    </div>
  )
}
