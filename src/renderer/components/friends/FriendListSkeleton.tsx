export function FriendListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-discord-card/80 p-3"
        >
          <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-white/5 animate-pulse" />
          </div>
          <div className="h-6 w-8 rounded bg-white/10 animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  )
}
