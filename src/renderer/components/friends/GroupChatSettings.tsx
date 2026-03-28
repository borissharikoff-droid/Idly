import { useState, useMemo } from 'react'
import { X, UserMinus, UserPlus, Trash2, LogOut, Pencil, Search } from '../../lib/icons'
import type { GroupChat, GroupMember } from '../../hooks/useGroupChat'
import type { FriendProfile } from '../../hooks/useFriends'

interface Props {
  group: GroupChat
  members: GroupMember[]
  friends: FriendProfile[]
  myId: string
  isOwner: boolean
  onBack: () => void
  onAddMember: (userId: string) => Promise<void>
  onKick: (userId: string) => Promise<void>
  onLeave: () => Promise<void>
  onDelete: () => Promise<void>
  onRename: (name: string) => Promise<string | null>
}

export function GroupChatSettings({ group, members, friends, myId, isOwner, onBack, onAddMember, onKick, onLeave, onDelete, onRename }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)
  const [busy, setBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [friendSearch, setFriendSearch] = useState('')

  const memberIds = new Set(members.map((m) => m.user_id))
  const addableFriends = friends.filter((f) => !memberIds.has(f.id))
  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase()
    return q ? addableFriends.filter((f) => (f.username ?? '').toLowerCase().includes(q)) : addableFriends
  }, [addableFriends, friendSearch])

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }

  const handleRename = async () => {
    if (!nameInput.trim() || nameInput.trim() === group.name) { setRenaming(false); return }
    setRenameError(null)
    setBusy(true)
    const err = await onRename(nameInput.trim())
    setBusy(false)
    if (err) { setRenameError(err); return }
    setRenaming(false)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06] flex-shrink-0">
        <button type="button" onClick={onBack} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-semibold text-white flex-1 truncate">Group Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Name */}
        <div className="space-y-1">
          <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Name</p>
          {renaming ? (
            <div className="space-y-1">
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setRenameError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); setRenameError(null) } }}
                  maxLength={40}
                  className={`flex-1 bg-surface-1 border rounded px-2 py-1 text-xs text-white focus:outline-none transition-colors ${renameError ? 'border-red-500/50 focus:border-red-500/70' : 'border-white/10 focus:border-accent/40'}`}
                />
                <button type="button" onClick={handleRename} disabled={busy} className="px-2 py-1 text-micro rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
                  {busy ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => { setRenaming(false); setRenameError(null) }} className="px-2 py-1 text-micro rounded text-gray-500 hover:text-white transition-colors">Cancel</button>
              </div>
              {renameError && <p className="text-micro text-red-400 px-0.5">{renameError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white">{group.name}</span>
              {isOwner && (
                <button type="button" onClick={() => { setNameInput(group.name); setRenaming(true) }} className="text-gray-600 hover:text-gray-300 transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="space-y-1.5">
          <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">{members.length} members</p>
          <div className="space-y-0.5">
            {members.map((m) => {
              const isMe = m.user_id === myId
              const isGroupOwner = m.user_id === group.owner_id
              return (
                <div key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03]">
                  <div className="w-5 h-5 rounded-full bg-surface-1 flex items-center justify-center text-micro flex-shrink-0 overflow-hidden border border-white/5">
                    {m.avatar_url && /^(https?:\/\/|data:|blob:)/.test(m.avatar_url) ? (
                      <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{m.avatar_url && m.avatar_url.length <= 2 ? m.avatar_url : (m.username ?? '?')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-200 truncate flex-1">{m.username ?? 'Unknown'}</span>
                  {isGroupOwner && <span className="text-micro text-amber-400 font-mono">owner</span>}
                  {isMe && !isGroupOwner && <span className="text-micro text-gray-600 font-mono">you</span>}
                  {!isMe && isOwner && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => wrap(() => onKick(m.user_id))}
                      className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Kick"
                    >
                      <UserMinus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Add members */}
        {addableFriends.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-micro uppercase tracking-wider text-gray-500 font-mono flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Add friend
            </p>
            {addableFriends.length > 4 && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search friends…"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 pl-6 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent/30 transition-colors"
                />
              </div>
            )}
            <div className="space-y-0.5">
              {filteredFriends.length === 0 && friendSearch && (
                <p className="text-micro text-gray-600 px-2 py-1">No matches</p>
              )}
              {filteredFriends.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03]">
                  <div className="w-5 h-5 rounded-full bg-surface-1 flex items-center justify-center text-micro flex-shrink-0 overflow-hidden border border-white/5">
                    {f.avatar_url && /^(https?:\/\/|data:|blob:)/.test(f.avatar_url) ? (
                      <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{f.avatar_url && f.avatar_url.length <= 2 ? f.avatar_url : (f.username ?? '?')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-200 truncate flex-1">{f.username ?? 'Unknown'}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => wrap(() => onAddMember(f.id))}
                    className="text-micro px-2 py-0.5 rounded border border-white/15 text-gray-400 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
          {!isOwner && (
            <button
              type="button"
              disabled={busy}
              onClick={() => wrap(onLeave)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-gray-400 hover:text-orange-400 hover:bg-orange-500/5 transition-colors disabled:opacity-40"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave group
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              disabled={busy}
              onClick={() => wrap(onDelete)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete group
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
