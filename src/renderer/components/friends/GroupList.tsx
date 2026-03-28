import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, Plus, MoreHorizontal, LogOut, Trash2 } from '../../lib/icons'
import type { GroupChatPreview } from '../../hooks/useGroupChat'

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

interface GroupListProps {
  groups: GroupChatPreview[]
  loading: boolean
  myId: string
  onSelectGroup: (groupId: string) => void
  onCreateGroup: () => void
  onLeaveGroup: (groupId: string) => Promise<void>
  onDeleteGroup: (groupId: string) => Promise<void>
}

export function GroupList({ groups, loading, myId, onSelectGroup, onCreateGroup, onLeaveGroup, onDeleteGroup }: GroupListProps) {
  if (loading && groups.length === 0) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-2 py-2 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-white/5 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-white/5 rounded w-1/3" />
              <div className="h-2 bg-white/5 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-indigo-500/50" />
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium">No groups yet</p>
          <p className="text-micro text-gray-600 mt-0.5">Chat with multiple friends at once</p>
        </div>
        <button
          type="button"
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:border-indigo-500/40"
        >
          <Plus className="w-3 h-3" />
          Create your first group
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {groups.map((group) => (
        <GroupRow
          key={group.id}
          group={group}
          isOwner={group.owner_id === myId}
          onClick={() => onSelectGroup(group.id)}
          onLeave={() => onLeaveGroup(group.id)}
          onDelete={() => onDeleteGroup(group.id)}
        />
      ))}
    </div>
  )
}

interface GroupRowProps {
  group: GroupChatPreview
  isOwner: boolean
  onClick: () => void
  onLeave: () => Promise<void>
  onDelete: () => Promise<void>
}

function GroupRow({ group, isOwner, onClick, onLeave, onDelete }: GroupRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) { setMenuOpen(false); setConfirm(null) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleAction = async (action: 'leave' | 'delete') => {
    if (confirm !== action) { setConfirm(action); return }
    setBusy(true)
    setMenuOpen(false)
    setConfirm(null)
    if (action === 'leave') await onLeave()
    else await onDelete()
    setBusy(false)
  }

  return (
    <div className="group relative flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
      {/* Clickable area */}
      <motion.button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        whileTap={{ scale: 0.99 }}
      >
        {/* Avatar with unread dot */}
        <div className="relative flex-shrink-0">
          {group.memberCount === 2 && group.otherMember ? (
            // 1-on-1: show the other person's avatar like a DM
            <div className="w-9 h-9 rounded-full bg-surface-2 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-300 overflow-hidden">
              {group.otherMember.avatar_url && /^(https?:\/\/|data:|blob:)/.test(group.otherMember.avatar_url)
                ? <img src={group.otherMember.avatar_url} alt="" className="w-full h-full object-cover" />
                : (group.otherMember.avatar_url || group.otherMember.username?.[0]?.toUpperCase() || '?')
              }
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
          )}
          {group.hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-surface-0" />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-semibold truncate ${group.hasUnread ? 'text-white' : 'text-gray-200'}`}>
              {group.memberCount === 2 && group.otherMember?.username ? group.otherMember.username : group.name}
            </span>
            {group.lastMessage && (
              <span className="text-micro text-gray-600 font-mono flex-shrink-0">
                {formatTime(group.lastMessage.created_at)}
              </span>
            )}
          </div>
          <p className={`text-micro truncate mt-0.5 ${group.hasUnread ? 'text-gray-300' : 'text-gray-600'}`}>
            {group.lastMessage
              ? group.lastMessage.sender_username
                ? `${group.lastMessage.sender_username}: ${group.lastMessage.body}`
                : group.lastMessage.body
              : 'No messages yet'}
          </p>
        </div>
      </motion.button>

      {/* ··· menu button (visible on hover) */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setConfirm(null) }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all disabled:opacity-30"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-30 w-36 rounded-card bg-surface-1 border border-white/[0.08] shadow-2xl overflow-hidden">
            {isOwner ? (
              <button
                type="button"
                onClick={() => handleAction('delete')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  confirm === 'delete'
                    ? 'bg-red-500/20 text-red-300'
                    : 'text-gray-400 hover:text-red-400 hover:bg-red-500/5'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                {confirm === 'delete' ? 'Confirm delete?' : 'Delete group'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAction('leave')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  confirm === 'leave'
                    ? 'bg-orange-500/20 text-orange-300'
                    : 'text-gray-400 hover:text-orange-400 hover:bg-orange-500/5'
                }`}
              >
                <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                {confirm === 'leave' ? 'Confirm leave?' : 'Leave group'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
