import { useState } from 'react'
import { X, Users } from '../../lib/icons'
import type { FriendProfile } from '../../hooks/useFriends'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'

interface Props {
  friends: FriendProfile[]
  onCreate: (name: string, memberIds: string[]) => Promise<void>
  onClose: () => void
}

export function CreateGroupModal({ friends, onCreate, onClose }: Props) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleCreate = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(name.trim(), Array.from(selected))
    } catch {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-72 rounded-card bg-surface-2 border border-white/10 shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-white">New Group</span>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* Name input */}
          <div className="space-y-1">
            <label className="text-micro uppercase tracking-wider text-gray-500 font-mono">Group name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Late night grinders"
              maxLength={40}
              className="w-full bg-surface-1 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent/40"
            />
          </div>

          {/* Friend picker */}
          {friends.length > 0 && (
            <div className="space-y-1">
              <label className="text-micro uppercase tracking-wider text-gray-500 font-mono">Add friends</label>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {friends.map((f) => {
                  const isSelected = selected.has(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggle(f.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                        isSelected ? 'bg-accent/15 border border-accent/30' : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <AvatarWithFrame
                        avatar={f.avatar_url ?? (f.username ?? '?')[0].toUpperCase()}
                        frameId={f.equipped_frame}
                        sizeClass="w-6 h-6"
                        textClass="text-micro"
                        ringInsetClass="-inset-[1px]"
                        ringOpacity={0.8}
                      />
                      <span className="text-xs text-gray-200 truncate flex-1">{f.username ?? 'Unknown'}</span>
                      <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent border-accent' : 'border-white/20'}`}>
                        {isSelected && <span className="text-[9px] text-white leading-none">✓</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Create button */}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="w-full py-1.5 rounded bg-accent text-white text-xs font-semibold disabled:opacity-40 hover:bg-accent/80 transition-colors"
          >
            {creating ? 'Creating…' : `Create${selected.size > 0 ? ` (${selected.size + 1})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
