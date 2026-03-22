import { useEffect, useState } from 'react'
import { fetchFriendActivity, formatActivityEntry, relativeTime, type FriendActivityEntry } from '../../services/friendActivityService'

interface ActivityFeedProps {
  userId: string
}

export function ActivityFeed({ userId }: ActivityFeedProps) {
  const [feed, setFeed] = useState<FriendActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchFriendActivity(userId)
      .then(setFeed)
      .catch(() => setFeed([]))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-white/[0.03] border border-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (feed.length === 0) {
    return (
      <div className="rounded border border-white/8 bg-white/[0.02] px-4 py-6 text-center">
        <p className="text-2xl mb-1">📡</p>
        <p className="text-xs text-gray-400">No activity yet</p>
        <p className="text-micro text-gray-600 mt-0.5">Boss kills and achievements appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {feed.map((entry) => {
        const { icon, text } = formatActivityEntry(entry)
        return (
          <div key={entry.id} className="flex items-center gap-2.5 px-3 py-2 rounded bg-white/[0.03] border border-white/5">
            <span className="text-sm shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
              <span className="text-caption font-semibold text-gray-200">{entry.username} </span>
              <span className="text-caption text-gray-400">{text}</span>
            </div>
            <span className="text-micro text-gray-600 font-mono shrink-0">{relativeTime(entry.created_at)}</span>
          </div>
        )
      })}
    </div>
  )
}
