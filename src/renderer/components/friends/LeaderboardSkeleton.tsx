export function LeaderboardSkeleton() {
  return (
    <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4">
      <div className="h-3 w-24 rounded bg-white/10 animate-pulse mb-3" />
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 py-2 px-3 rounded-xl"
          >
            <div className="w-6 h-4 rounded bg-white/5 animate-pulse shrink-0" />
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
              <div className="h-2 w-12 rounded bg-white/5 animate-pulse" />
            </div>
            <div className="h-4 w-6 rounded bg-white/10 animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
