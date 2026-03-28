import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

interface AddFriendProps {
  onAdded: () => void
}

export function AddFriend({ onAdded }: AddFriendProps) {
  const { user } = useAuthStore()
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !user || !username.trim()) return
    setBusy(true)
    setMessage(null)
    const search = username.trim()
    const { data: profiles } = await supabase.from('profiles').select('id').eq('username', search).limit(1)
    const friend = profiles?.[0]
    if (!friend || friend.id === user.id) {
      setMessage({ type: 'err', text: 'User not found or cannot add yourself.' })
      setBusy(false)
      return
    }
    const { error } = await supabase.from('friendships').insert({
      user_id: user.id,
      friend_id: friend.id,
      status: 'pending',
    })
    if (error) {
      if (error.code === '23505') setMessage({ type: 'err', text: 'Request already sent or already friends.' })
      else setMessage({ type: 'err', text: error.message })
    } else {
      setMessage({ type: 'ok', text: 'Friend request sent.' })
      setUsername('')
      onAdded()
    }
    setBusy(false)
  }

  if (!supabase || !user) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card bg-surface-2/80 border border-white/10 p-3"
    >
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1 rounded bg-surface-0 border border-white/10 px-3 py-2 text-white placeholder-gray-500 text-sm focus:border-accent outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </form>
      {message && (
        <p className={`mt-2 text-sm ${message.type === 'ok' ? 'text-accent' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}
    </motion.div>
  )
}
