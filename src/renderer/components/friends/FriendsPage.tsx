import { useState, useCallback, useEffect } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { motion } from 'framer-motion'
import { useChat } from '../../hooks/useChat'
import { useGroupChatList, useGroupChat, markGroupRead } from '../../hooks/useGroupChat'
import { FriendList } from './FriendList'
import { FriendListSkeleton } from './FriendListSkeleton'
import { AddFriend } from './AddFriend'
import { FriendProfile } from './FriendProfile'
import { PendingRequests } from './PendingRequests'
import { Leaderboard } from './Leaderboard'
import { GuildTab } from './GuildTab'
import { FriendCompare } from './FriendCompare'
import { ChatThread } from './ChatThread'
import { GroupChatThread } from './GroupChatThread'
import { GroupList } from './GroupList'
import { CreateGroupModal } from './CreateGroupModal'
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
import { Users, Plus, UserPlus, Sword, Trophy, Shield, MoreHorizontal } from '../../lib/icons'
import { BackButton } from '../shared/BackButton'
import { ErrorState } from '../shared/ErrorState'
import { EmptyState } from '../shared/EmptyState'

type FriendView = 'list' | 'profile' | 'compare' | 'chat' | 'group_chat'
type SocialTab = 'friends' | 'groups'

interface FriendsPageProps {
  friendsModel: FriendsModel
}

export function FriendsPage({ friendsModel }: FriendsPageProps) {
  const { user } = useAuthStore()
  const { friends, pendingRequests, unreadByFriendId, loading, error, refresh, acceptRequest, rejectRequest, removeFriend } = friendsModel
  const [selected, setSelected] = useState<FriendProfileType | null>(null)
  const [view, setView] = useState<FriendView>('list')
  const [profileOriginView, setProfileOriginView] = useState<'chat' | 'group_chat' | null>(null)
  const [socialTab, setSocialTab] = useState<SocialTab>(() =>
    (localStorage.getItem('grindly_social_tab') as SocialTab) || 'friends'
  )
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showGuild, setShowGuild] = useState(false)
  const [showParty, setShowParty] = useState(false)
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)

  const setTab = useCallback((tab: SocialTab) => {
    setSocialTab(tab)
    localStorage.setItem('grindly_social_tab', tab)
  }, [])

  const fetchInvites = useRaidStore((s) => s.fetchInvites)
  const pendingFriendUserId = useNavigationStore((s) => s.pendingFriendUserId)
  const setPendingFriendUserId = useNavigationStore((s) => s.setPendingFriendUserId)
  const returnTab = useNavigationStore((s) => s.returnTab)
  const setReturnTab = useNavigationStore((s) => s.setReturnTab)
  const navTo = useNavigationStore((s) => s.navigateTo)

  // Auto-open friend profile when navigated here from another tab
  useEffect(() => {
    if (!pendingFriendUserId || !friends.length) return
    const friend = friends.find((f) => f.id === pendingFriendUserId)
    if (friend) {
      setPendingFriendUserId(null)
      setSelected(friend)
      setProfileOriginView(null)
      setView('profile')
    }
  }, [pendingFriendUserId, friends]) // eslint-disable-line react-hooks/exhaustive-deps

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const groupList = useGroupChatList()
  const groupChat = useGroupChat(view === 'group_chat' ? activeGroupId : null)

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

  useEffect(() => {
    if (!selected) return
    const updated = friends.find((f) => f.id === selected.id)
    if (updated && updated !== selected) setSelected(updated)
  }, [friends]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatTargetFriendId) return
    const friend = friends.find((f) => f.id === chatTargetFriendId)
    setChatTargetFriendId(null)
    if (friend) { setSelected(friend); setView('chat') }
  }, [chatTargetFriendId, friends, setChatTargetFriendId])

  useEffect(() => { if (user) fetchInvites() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const markConversationReadAndRefresh = useCallback(async (otherUserId: string) => {
    await chat.markConversationRead(otherUserId)
    refresh()
  }, [chat.markConversationRead, refresh])

  const openGroup = useCallback((groupId: string) => {
    const group = groupList.groups.find((g) => g.id === groupId)
    if (group?.lastMessage) markGroupRead(groupId, group.lastMessage.created_at)
    groupList.markRead(groupId)
    setActiveGroupId(groupId)
    setView('group_chat')
  }, [groupList])

  const incomingCount = pendingRequests.filter((r) => r.direction === 'incoming').length
  const totalGroupUnread = groupList.groups.filter((g) => g.hasUnread).length

  const isSubview = view === 'chat' || view === 'profile' || view === 'compare' || view === 'group_chat'
    || showGuild || showLeaderboard || showParty || showAddFriend

  const backToList = useCallback(() => {
    setProfileOriginView(null)
    if (returnTab) {
      setReturnTab(null)
      setSelected(null)
      setActiveGroupId(null)
      setView('list')
      navTo?.(returnTab)
    } else {
      setView('list')
      setSelected(null)
      setActiveGroupId(null)
    }
  }, [returnTab, setReturnTab, navTo])

  const handleBack = useCallback(() => {
    if (showAddFriend) { setShowAddFriend(false) }
    else if (showParty) { setShowParty(false) }
    else if (showGuild) { setShowGuild(false) }
    else if (showLeaderboard) { setShowLeaderboard(false) }
    else if (view === 'compare') { setView('profile') }
    else if (view === 'profile' && profileOriginView) { const origin = profileOriginView; setProfileOriginView(null); setView(origin) }
    else { backToList() }
  }, [view, profileOriginView, backToList, showGuild, showLeaderboard, showAddFriend, showParty])

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

  const isChatView = (view === 'chat' && selected) || view === 'group_chat'

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: 0 }}
      className={isChatView ? 'flex flex-col h-full min-h-0 p-2' : 'p-4 pb-2'}
    >
      {showCreateGroup && (
        <CreateGroupModal
          friends={friends}
          onCreate={async (name, memberIds) => {
            const group = await groupList.createGroup(name, memberIds)
            if (group) { setTab('groups'); openGroup(group.id); setShowCreateGroup(false) }
          }}
          onClose={() => setShowCreateGroup(false)}
        />
      )}

      {!user ? (
        <EmptyState title="Sign in to join the squad" description="Add friends, flex your stats, and compete on the leaderboard." icon={<Users className="w-6 h-6 text-gray-500" />} />
      ) : !supabase ? (
        <EmptyState
          title="Supabase not configured"
          description="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env in the project root and rebuild."
          icon="🔌"
        />
      ) : view === 'group_chat' && !groupChat.group ? (
        /* Loading skeleton while group data fetches — prevents flash back to list */
        <div className="flex flex-col h-full min-h-0 animate-pulse">
          <div className="flex items-center justify-center py-2.5 mb-1 shrink-0">
            <div className="h-6 w-32 rounded bg-white/5" />
          </div>
          <div className="flex-1 px-3 py-3 space-y-3">
            <div className="flex justify-start"><div className="h-10 w-40 rounded-xl bg-white/5" /></div>
            <div className="flex justify-end"><div className="h-8 w-28 rounded-xl bg-accent/5" /></div>
            <div className="flex justify-start"><div className="h-12 w-36 rounded-xl bg-white/5" /></div>
          </div>
        </div>
      ) : view === 'group_chat' && groupChat.group ? (
        <GroupChatThread
          group={groupChat.group}
          members={groupChat.members}
          messages={groupChat.messages}
          reactions={groupChat.reactions}
          friends={friends}
          loading={groupChat.loading}
          sending={groupChat.sending}
          sendError={groupChat.sendError}
          myId={user.id}
          initialMemberCount={groupList.groups.find((g) => g.id === activeGroupId)?.memberCount}
          initialOtherMember={groupList.groups.find((g) => g.id === activeGroupId)?.otherMember}
          onBack={() => { setActiveGroupId(null); setView('list') }}
          onMarkRead={() => { if (activeGroupId) groupList.markRead(activeGroupId) }}
          onOpenProfile={(userId) => {
            const friend = friends.find((f) => f.id === userId)
            if (friend) {
              setSelected(friend)
            } else {
              // Member is not a friend — build minimal profile from group member data
              const member = groupChat.members.find((m) => m.user_id === userId)
              if (!member) return
              setSelected({
                id: userId,
                username: member.username,
                avatar_url: member.avatar_url,
                equipped_frame: member.equipped_frame ?? null,
                level: 0, xp: 0, current_activity: null, is_online: false,
                streak_count: 0, friendship_id: '', friendship_status: 'none',
              })
            }
            setProfileOriginView('group_chat')
            setView('profile')
          }}
          sendMessage={groupChat.sendMessage}
          toggleReaction={groupChat.toggleReaction}
          addMember={groupChat.addMember}
          removeMember={groupChat.removeMember}
          renameGroup={async (name) => { const err = await groupChat.renameGroup(name); if (!err) groupList.refresh(); return err }}
          deleteGroup={async () => { await groupChat.deleteGroup(); groupList.refresh(); setActiveGroupId(null); setView('list') }}
          leaveGroup={async () => { await groupChat.leaveGroup(); groupList.refresh(); setActiveGroupId(null); setView('list') }}
        />
      ) : view === 'compare' && selected ? (
        <FriendCompare friend={selected} onBack={() => setView('profile')} />
      ) : view === 'chat' && selected ? (
        <ChatThread
          profile={selected}
          onBack={backToList}
          onOpenProfile={() => { setProfileOriginView('chat'); setView('profile') }}
          messages={chat.messages}
          reactions={chat.reactions}
          loading={chat.loading}
          loadingMore={chat.loadingMore}
          hasMoreMessages={chat.hasMoreMessages}
          sending={chat.sending}
          sendError={chat.sendError}
          getConversation={chat.getConversation}
          loadMoreMessages={chat.loadMoreMessages}
          sendMessage={chat.sendMessage}
          markConversationRead={markConversationReadAndRefresh}
          toggleReaction={chat.toggleReaction}
        />
      ) : view === 'profile' && selected ? (
        <FriendProfile
          profile={selected}
          onBack={profileOriginView ? () => { const origin = profileOriginView; setProfileOriginView(null); setView(origin) } : backToList}
          onCompare={() => setView('compare')}
          onMessage={() => setView('chat')}
          onRemove={async () => {
            const ok = await removeFriend(selected.friendship_id)
            if (ok) { setSelected(null); setView('list') }
          }}
        />
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <PageHeader
            title="Social"
            icon={<Users className="w-4 h-4 text-indigo-400" />}
            rightSlot={(
              <div className="flex items-center gap-1">
                {/* ··· dropdown: Party / Leaderboard / Guild */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowMoreDropdown((v) => !v); setShowDropdown(false) }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                      showMoreDropdown
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                    }`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {showMoreDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowMoreDropdown(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 w-40 rounded-card bg-surface-1 border border-white/[0.08] shadow-2xl overflow-hidden">
                        {[
                          { icon: <Sword className="w-3.5 h-3.5" />,  label: 'Party',       color: 'text-violet-400', onClick: () => { setShowParty(true); setShowLeaderboard(false); setShowGuild(false); setShowAddFriend(false) } },
                          { icon: <Trophy className="w-3.5 h-3.5" />, label: 'Leaderboard', color: 'text-amber-400',  onClick: () => { setShowLeaderboard(true); setShowParty(false); setShowGuild(false); setShowAddFriend(false) } },
                          { icon: <Shield className="w-3.5 h-3.5" />, label: 'Guild',       color: 'text-yellow-400', onClick: () => { setShowGuild(true); setShowLeaderboard(false); setShowParty(false); setShowAddFriend(false) } },
                        ].map((item) => (
                          <button key={item.label} type="button"
                            onClick={() => { item.onClick(); setShowMoreDropdown(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                          >
                            <span className={item.color}>{item.icon}</span>
                            <span className="text-xs text-gray-200">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* + dropdown: Add Friend / New Group */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowDropdown((v) => !v); setShowMoreDropdown(false) }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                      showDropdown
                        ? 'bg-accent/20 border-accent/40 text-accent'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                    }`}
                    style={{ transform: showDropdown ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s, background 0.15s, color 0.15s' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {showDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 w-40 rounded-card bg-surface-1 border border-white/[0.08] shadow-2xl overflow-hidden">
                        {[
                          { icon: <UserPlus className="w-3.5 h-3.5" />, label: 'Add Friend', color: 'text-accent',     onClick: () => { setShowAddFriend(true); setShowParty(false); setShowLeaderboard(false); setShowGuild(false) } },
                          { icon: <Users className="w-3.5 h-3.5" />,    label: 'New Group',  color: 'text-indigo-400', onClick: () => setShowCreateGroup(true) },
                        ].map((item) => (
                          <button key={item.label} type="button"
                            onClick={() => { item.onClick(); setShowDropdown(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                          >
                            <span className={item.color}>{item.icon}</span>
                            <span className="text-xs text-gray-200">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          />

          {/* Add Friend panel */}
          {showAddFriend && (
            <div className="space-y-2">
              <BackButton onClick={() => setShowAddFriend(false)} />
              <AddFriend onAdded={() => { refresh(); setShowAddFriend(false) }} />
            </div>
          )}

          {/* Incoming requests */}
          {incomingCount > 0 && !showLeaderboard && !showGuild && !showParty && !showAddFriend && (
            <PendingRequests
              requests={pendingRequests.filter((r) => r.direction === 'incoming')}
              onAccept={acceptRequest}
              onReject={rejectRequest}
            />
          )}

          {/* Panel views: Party / Guild / Leaderboard */}
          {showParty ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowParty(false)} />
              <PartyPanel
                friends={friends}
                onClose={() => setShowParty(false)}
                onViewProfile={(f) => { setSelected(f); setProfileOriginView(null); setShowParty(false); setView('profile') }}
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
                if (friend) { setSelected(friend); setProfileOriginView(null); setView('profile'); setShowGuild(false) }
              }} />
            </div>
          ) : showLeaderboard ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowLeaderboard(false)} />
              <Leaderboard onSelectUser={(userId) => {
                const friend = friends.find((f) => f.id === userId)
                if (friend) { setSelected(friend); setProfileOriginView(null); setView('profile'); setShowLeaderboard(false) }
              }} />
            </div>
          ) : !showAddFriend ? (
            <>
              {/* Friends | Groups tab bar */}
              <div className="flex border-b border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTab('friends')}
                  className={`flex-1 text-xs font-medium py-2 transition-colors ${
                    socialTab === 'friends'
                      ? 'text-white border-b-2 border-accent -mb-px'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Friends
                </button>
                <button
                  type="button"
                  onClick={() => setTab('groups')}
                  className={`flex-1 text-xs font-medium py-2 transition-colors relative ${
                    socialTab === 'groups'
                      ? 'text-white border-b-2 border-indigo-400 -mb-px'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Groups
                  {totalGroupUnread > 0 && (
                    <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full ml-1 mb-0.5 align-middle" />
                  )}
                </button>
              </div>

              {/* Tab content */}
              {socialTab === 'friends' ? (
                <>
                  {error && (
                    <ErrorState message={error} onRetry={() => refresh()} retryLabel="Reconnect" secondaryAction={{ label: 'Retry sync', onClick: retrySkillSync }} className="mb-3" />
                  )}
                  {loading ? (
                    <FriendListSkeleton />
                  ) : (
                    <FriendList
                      friends={friends}
                      onSelectFriend={(f) => { setSelected(f); setProfileOriginView(null); setView('profile') }}
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
              ) : (
                <GroupList
                  groups={groupList.groups}
                  loading={groupList.loading}
                  myId={user.id}
                  onSelectGroup={openGroup}
                  onCreateGroup={() => setShowCreateGroup(true)}
                  onLeaveGroup={groupList.leaveGroup}
                  onDeleteGroup={groupList.deleteGroup}
                />
              )}
            </>
          ) : null}
        </div>
      )}
    </motion.div>
  )
}
