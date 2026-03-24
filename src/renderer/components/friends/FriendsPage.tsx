import { useState, useCallback, useEffect } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { motion } from 'framer-motion'
import { useChat } from '../../hooks/useChat'
import { FriendList } from './FriendList'
import { FriendListSkeleton } from './FriendListSkeleton'
import { AddFriend } from './AddFriend'
import { FriendProfile } from './FriendProfile'
import { PendingRequests } from './PendingRequests'
import { Leaderboard } from './Leaderboard'
import { GuildTab } from './GuildTab'
import { FriendCompare } from './FriendCompare'
import { ChatThread } from './ChatThread'
import { PartyPanel } from './PartyPanel'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useChatTargetStore } from '../../stores/chatTargetStore'
import { useRaidStore } from '../../stores/raidStore'
import { useNavigationStore } from '../../stores/navigationStore'
import type { FriendProfile as FriendProfileType, FriendsModel } from '../../hooks/useFriends'
import { syncSkillsToSupabase } from '../../services/supabaseSync'
import { useSkillSyncStore } from '../../stores/skillSyncStore'
import { PageHeader } from '../shared/PageHeader'
import { Users } from '../../lib/icons'
import { BackButton } from '../shared/BackButton'
import { ErrorState } from '../shared/ErrorState'
import { EmptyState } from '../shared/EmptyState'
type FriendView = 'list' | 'profile' | 'compare' | 'chat'

interface FriendsPageProps {
  friendsModel: FriendsModel
}

export function FriendsPage({ friendsModel }: FriendsPageProps) {
  const { user } = useAuthStore()
  const { friends, pendingRequests, unreadByFriendId, loading, error, refresh, acceptRequest, rejectRequest, removeFriend } = friendsModel
  const [selected, setSelected] = useState<FriendProfileType | null>(null)
  const [view, setView] = useState<FriendView>('list')
  const [profileFromChat, setProfileFromChat] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showGuild, setShowGuild] = useState(false)
  const [showParty, setShowParty] = useState(false)
  const fetchInvites = useRaidStore((s) => s.fetchInvites)
  const pendingFriendUserId = useNavigationStore((s) => s.pendingFriendUserId)
  const setPendingFriendUserId = useNavigationStore((s) => s.setPendingFriendUserId)
  const returnTab = useNavigationStore((s) => s.returnTab)
  const setReturnTab = useNavigationStore((s) => s.setReturnTab)
  const navTo = useNavigationStore((s) => s.navigateTo)

  // Auto-open friend profile when navigated here from another tab (e.g. party row on Home)
  useEffect(() => {
    if (!pendingFriendUserId || !friends.length) return
    const friend = friends.find((f) => f.id === pendingFriendUserId)
    if (friend) {
      setPendingFriendUserId(null)
      setSelected(friend)
      setProfileFromChat(false)
      setView('profile')
    }
  }, [pendingFriendUserId, friends]) // eslint-disable-line react-hooks/exhaustive-deps
  const peerId = view === 'chat' && selected ? selected.id : null
  const chat = useChat(peerId)
  const chatTargetFriendId = useChatTargetStore((s) => s.friendId)
  const setChatTargetFriendId = useChatTargetStore((s) => s.setFriendId)
  const setActiveChatPeerId = useChatTargetStore((s) => s.setActiveChatPeerId)

  useEffect(() => {
    setActiveChatPeerId(peerId)
    return () => setActiveChatPeerId(null)
  }, [peerId, setActiveChatPeerId])
  const { setSyncState } = useSkillSyncStore()

  const retrySkillSync = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.db?.getAllSkillXP) return
    setSyncState({ status: 'syncing', error: null })
    const result = await syncSkillsToSupabase(api, { maxAttempts: 3 })
    if (result.ok) {
      setSyncState({ status: 'success', at: result.lastSkillSyncAt, error: null })
      refresh()
      return
    }
    setSyncState({ status: 'error', error: result.error ?? 'Skill sync failed' })
  }, [refresh, setSyncState])

  // Keep selected friend in sync with live useFriends data (polls every 15s)
  // so FriendProfile's profile prop always reflects the latest skill levels.
  useEffect(() => {
    if (!selected) return
    const updated = friends.find((f) => f.id === selected.id)
    if (updated && updated !== selected) setSelected(updated)
  }, [friends])

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

  useEffect(() => { if (user) fetchInvites() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap markConversationRead to also refresh friend unread badges
  const markConversationReadAndRefresh = useCallback(async (otherUserId: string) => {
    await chat.markConversationRead(otherUserId)
    refresh()
  }, [chat.markConversationRead, refresh])

  const incomingCount = pendingRequests.filter((r) => r.direction === 'incoming').length
  const isSubview = view === 'chat' || view === 'profile' || view === 'compare' || showGuild || showLeaderboard || showParty
  const backToList = useCallback(() => {
    if (returnTab) {
      setReturnTab(null)
      setSelected(null)
      setView('list')
      navTo?.(returnTab)
    } else {
      setView('list')
      setSelected(null)
    }
  }, [returnTab, setReturnTab, navTo])

  const handleBack = useCallback(() => {
    if (showParty) { setShowParty(false) }
    else if (showGuild) { setShowGuild(false) }
    else if (showLeaderboard) { setShowLeaderboard(false) }
    else if (view === 'compare') { setView('profile') }
    else if (view === 'profile' && profileFromChat) { setProfileFromChat(false); setView('chat') }
    else { backToList() }
  }, [view, profileFromChat, backToList, showGuild, showLeaderboard])

  useEscapeHandler(handleBack, isSubview)

  useEffect(() => {
    if (!isSubview) return
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
    }
    const isMouseBack = (button: number) => button === 3 || button === 4

    const onMouseBackCapture = (e: MouseEvent) => {
      if (!isMouseBack(e.button)) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      handleBack()
    }

    window.addEventListener('mousedown', onMouseBackCapture, true)
    window.addEventListener('auxclick', onMouseBackCapture, true)
    return () => {
      window.removeEventListener('mousedown', onMouseBackCapture, true)
      window.removeEventListener('auxclick', onMouseBackCapture, true)
    }
  }, [isSubview, handleBack])

  const isChatView = view === 'chat' && selected

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: 0 }}
      className={isChatView ? 'flex flex-col h-full min-h-0 p-2' : 'p-4 pb-2'}
    >
      {!user ? (
        <EmptyState title="Sign in to join the squad" description="Add friends, flex your stats, and compete on the leaderboard." icon="👥" />
      ) : !supabase ? (
        <EmptyState
          title="Supabase not configured"
          description="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env in the project root and rebuild."
          icon="🔌"
        />
      ) : view === 'compare' && selected ? (
        <FriendCompare friend={selected} onBack={() => setView('profile')} />
      ) : view === 'chat' && selected ? (
        <ChatThread
          profile={selected}
          onBack={backToList}
          onOpenProfile={() => { setProfileFromChat(true); setView('profile') }}
          messages={chat.messages}
          reactions={chat.reactions}
          loading={chat.loading}
          sending={chat.sending}
          sendError={chat.sendError}
          getConversation={chat.getConversation}
          sendMessage={chat.sendMessage}
          markConversationRead={markConversationReadAndRefresh}
          toggleReaction={chat.toggleReaction}
        />
      ) : view === 'profile' && selected ? (
        <FriendProfile
          profile={selected}
          onBack={profileFromChat ? () => { setProfileFromChat(false); setView('chat') } : backToList}
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
          <PageHeader
            title="Social"
            icon={<Users className="w-4 h-4 text-indigo-400" />}
            rightSlot={(
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setShowParty(!showParty); setShowLeaderboard(false); setShowGuild(false) }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    showParty ? 'border-accent/50 text-accent bg-accent/10' : 'border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  Party
                </button>
                <button
                  onClick={() => { setShowLeaderboard(!showLeaderboard); setShowGuild(false); setShowParty(false) }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    showLeaderboard ? 'border-accent/50 text-accent bg-accent/10' : 'border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  Leaderboard
                </button>
                <button
                  onClick={() => { setShowGuild(!showGuild); setShowLeaderboard(false); setShowParty(false) }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    showGuild ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  Guild
                </button>
              </div>
            )}
          />

          {!showGuild && !showLeaderboard && !showParty && <AddFriend onAdded={refresh} />}
          {/* RaidPartyPanel removed — party members are auto-invited when raid starts */}
          {incomingCount > 0 && !showLeaderboard && !showGuild && (
            <PendingRequests
              requests={pendingRequests.filter((r) => r.direction === 'incoming')}
              onAccept={acceptRequest}
              onReject={rejectRequest}
            />
          )}

          {showParty ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowParty(false)} />
              <PartyPanel
                friends={friends}
                onClose={() => setShowParty(false)}
                onViewProfile={(f) => { setSelected(f); setProfileFromChat(false); setShowParty(false); setView('profile') }}
                onMessageFriend={(userId) => {
                  const f = friends.find((fr) => fr.id === userId)
                  if (f) { setSelected(f); setShowParty(false); setView('chat') }
                }}
              />
            </div>
          ) : showGuild ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowGuild(false)} />
              <GuildTab onSelectMember={(userId) => {
                const friend = friends.find((f) => f.id === userId)
                if (friend) {
                  setSelected(friend)
                  setProfileFromChat(false)
                  setView('profile')
                  setShowGuild(false)
                }
              }} />
            </div>
          ) : showLeaderboard ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowLeaderboard(false)} />
              <Leaderboard onSelectUser={(userId) => {
                const friend = friends.find((f) => f.id === userId)
                if (friend) {
                  setSelected(friend)
                  setProfileFromChat(false)
                  setView('profile')
                  setShowLeaderboard(false)
                }
              }} />
            </div>
          ) : (
            <>
              {error && (
                <ErrorState message={error} onRetry={() => refresh()} retryLabel="Reconnect" secondaryAction={{ label: 'Retry sync', onClick: retrySkillSync }} className="mb-3" />
              )}
              {loading ? (
                <FriendListSkeleton />
              ) : (
                <FriendList
                  friends={friends}
                  onSelectFriend={(f) => { setSelected(f); setProfileFromChat(false); setView('profile') }}
                  onMessageFriend={(f) => { setSelected(f); setView('chat') }}
                  unreadByFriendId={unreadByFriendId}
                />
              )}
              {!loading && friends.length === 0 && (
                <EmptyState title="No squad yet" description="Add your first friend by username to compete and flex stats." icon="👾" />
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
    </motion.div>
  )
}
