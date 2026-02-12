import { useState, useCallback, useEffect } from 'react'
import { useFriends } from '../../hooks/useFriends'
import { useChat } from '../../hooks/useChat'
import { FriendList } from './FriendList'
import { FriendListSkeleton } from './FriendListSkeleton'
import { AddFriend } from './AddFriend'
import { FriendProfile } from './FriendProfile'
import { PendingRequests } from './PendingRequests'
import { Leaderboard } from './Leaderboard'
import { FriendCompare } from './FriendCompare'
import { ChatThread } from './ChatThread'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useChatTargetStore } from '../../stores/chatTargetStore'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'

type FriendView = 'list' | 'profile' | 'compare' | 'chat'

export function FriendsPage() {
  const { user } = useAuthStore()
  const { friends, pendingRequests, unreadByFriendId, loading, error, refresh, acceptRequest, rejectRequest, removeFriend } = useFriends()
  const [selected, setSelected] = useState<FriendProfileType | null>(null)
  const [view, setView] = useState<FriendView>('list')
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const peerId = view === 'chat' && selected ? selected.id : null
  const chat = useChat(peerId)
  const chatTargetFriendId = useChatTargetStore((s) => s.friendId)
  const setChatTargetFriendId = useChatTargetStore((s) => s.setFriendId)

  // Navigate to chat when MessageBanner signals (e.g. clicked on new message)
  useEffect(() => {
    if (!chatTargetFriendId) return
    const friend = friends.find((f) => f.id === chatTargetFriendId)
    setChatTargetFriendId(null)
    if (friend) {
      setSelected(friend)
      setView('chat')
    }
  }, [chatTargetFriendId, friends, setChatTargetFriendId])

  // Wrap markConversationRead to also refresh friend unread badges
  const markConversationReadAndRefresh = useCallback(async (otherUserId: string) => {
    await chat.markConversationRead(otherUserId)
    refresh()
  }, [chat.markConversationRead, refresh])

  const incomingCount = pendingRequests.filter((r) => r.direction === 'incoming').length

  return (
    <div className="p-4 pb-2">
      {!user ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">👥</span>
          <p className="text-white font-medium mb-1">Sign in to join the squad</p>
          <p className="text-gray-500 text-xs">Add friends, flex your stats, compete on the leaderboard.</p>
        </div>
      ) : !supabase ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">🔌</span>
          <p className="text-white font-medium mb-1">Supabase not configured</p>
          <p className="text-gray-500 text-xs max-w-[280px]">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env in the project root and rebuild (npm run build).
          </p>
        </div>
      ) : view === 'compare' && selected ? (
        <FriendCompare friend={selected} onBack={() => setView('profile')} />
      ) : view === 'chat' && selected ? (
        <ChatThread
          profile={selected}
          onBack={() => { setView('list'); setSelected(null) }}
          messages={chat.messages}
          loading={chat.loading}
          sending={chat.sending}
          sendError={chat.sendError}
          getConversation={chat.getConversation}
          sendMessage={chat.sendMessage}
          markConversationRead={markConversationReadAndRefresh}
        />
      ) : view === 'profile' && selected ? (
        <FriendProfile
          profile={selected}
          onBack={() => { setSelected(null); setView('list') }}
          onCompare={() => setView('compare')}
          onMessage={() => setView('chat')}
          onRemove={async () => {
            const ok = await removeFriend(selected.friendship_id)
            if (ok) {
              setSelected(null)
              setView('list')
            }
          }}
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
            <div className="space-y-3">
              <button
                onClick={() => setShowLeaderboard(false)}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                <span className="font-mono text-xs">Back</span>
              </button>
              <Leaderboard />
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-xl bg-discord-card/80 border border-red-500/30 p-4 text-center mb-3">
                  <p className="text-red-400 text-sm mb-2">{error}</p>
                  <button
                    onClick={() => refresh()}
                    className="text-xs px-3 py-1.5 rounded-lg bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/40 hover:bg-cyber-neon/30 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}
              {loading ? (
                <FriendListSkeleton />
              ) : (
                <FriendList
                  friends={friends}
                  onSelectFriend={(f) => { setSelected(f); setView('profile') }}
                  onMessageFriend={(f) => { setSelected(f); setView('chat') }}
                  unreadByFriendId={unreadByFriendId}
                />
              )}
              {!loading && pendingRequests.filter((r) => r.direction === 'outgoing').length > 0 && (
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
