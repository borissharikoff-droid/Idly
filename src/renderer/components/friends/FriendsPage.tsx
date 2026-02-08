import { useState } from 'react'
import { useFriends } from '../../hooks/useFriends'
import { FriendList } from './FriendList'
import { AddFriend } from './AddFriend'
import { FriendProfile } from './FriendProfile'
import { PendingRequests } from './PendingRequests'
import { Leaderboard } from './Leaderboard'
import { FriendCompare } from './FriendCompare'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'

type FriendView = 'list' | 'profile' | 'compare'

export function FriendsPage() {
  const { user } = useAuthStore()
  const { friends, pendingRequests, loading, error, refresh, acceptRequest, rejectRequest } = useFriends()
  const [selected, setSelected] = useState<FriendProfileType | null>(null)
  const [view, setView] = useState<FriendView>('list')
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  const incomingCount = pendingRequests.filter((r) => r.direction === 'incoming').length

  return (
    <div className="p-4 pb-2">
      {!supabase || !user ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">👥</span>
          <p className="text-white font-medium mb-1">Sign in to join the squad</p>
          <p className="text-gray-500 text-xs">Add friends, flex your stats, compete on the leaderboard.</p>
        </div>
      ) : view === 'compare' && selected ? (
        <FriendCompare friend={selected} onBack={() => setView('profile')} />
      ) : view === 'profile' && selected ? (
        <FriendProfile
          profile={selected}
          onBack={() => { setSelected(null); setView('list') }}
          onCompare={() => setView('compare')}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Friends</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLeaderboard(!showLeaderboard)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  showLeaderboard ? 'border-cyber-neon/50 text-cyber-neon bg-cyber-neon/10' : 'border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                Leaderboard
              </button>
            </div>
          </div>

          <AddFriend onAdded={refresh} />

          {incomingCount > 0 && !showLeaderboard && (
            <PendingRequests
              requests={pendingRequests}
              onAccept={acceptRequest}
              onReject={rejectRequest}
            />
          )}

          {showLeaderboard ? (
            <Leaderboard />
          ) : error ? (
            <div className="rounded-xl bg-discord-card/80 border border-red-500/30 p-4 text-center">
              <p className="text-red-400 text-sm mb-2">{error}</p>
              <button
                onClick={() => refresh()}
                className="text-xs px-3 py-1.5 rounded-lg bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/40 hover:bg-cyber-neon/30 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <p className="text-gray-500 text-sm py-4">Loading...</p>
          ) : (
            <>
              <FriendList friends={friends} onSelectFriend={(f) => { setSelected(f); setView('profile') }} />
              {pendingRequests.filter((r) => r.direction === 'outgoing').length > 0 && (
                <div className="mt-3">
                  <PendingRequests
                    requests={pendingRequests.filter((r) => r.direction === 'outgoing')}
                    onAccept={acceptRequest}
                    onReject={rejectRequest}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
