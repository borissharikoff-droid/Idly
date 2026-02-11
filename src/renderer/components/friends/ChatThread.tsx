import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { playClickSound } from '../../lib/sounds'
import { useAuthStore } from '../../stores/authStore'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import type { ChatMessage } from '../../hooks/useChat'

interface ChatThreadProps {
  profile: FriendProfileType
  onBack: () => void
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  sendError?: string | null
  getConversation: (otherUserId: string) => Promise<ChatMessage[]>
  sendMessage: (receiverId: string, body: string) => Promise<void>
  markConversationRead: (otherUserId: string) => Promise<void>
}

export function ChatThread({ profile, onBack, messages, loading, sending, sendError, getConversation, sendMessage, markConversationRead }: ChatThreadProps) {
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getConversation(profile.id)
    markConversationRead(profile.id)
  }, [profile.id, getConversation, markConversationRead])

  // Mark new messages as read when they arrive while chat is open
  useEffect(() => {
    if (messages.length > 0) {
      markConversationRead(profile.id)
    }
  }, [messages.length, profile.id, markConversationRead])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    sendMessage(profile.id, text)
    setInput('')
    playClickSound()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-[calc(100vh-12rem)] min-h-[320px]"
    >
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => { onBack(); playClickSound() }}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          <span className="font-mono text-xs">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white font-medium truncate max-w-[140px]">{profile.username || 'Friend'}</span>
          <span className="w-2 h-2 rounded-full bg-cyber-neon/80 shrink-0" title="Chat" />
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-xl bg-discord-card/80 border border-white/10 p-3 space-y-2 mb-3"
      >
        {loading ? (
          <p className="text-gray-500 text-sm py-4">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">No messages yet. Say hi!</p>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_id === user?.id
            return (
              <div
                key={m.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    isMe
                      ? 'bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30 rounded-br-md'
                      : 'bg-white/10 text-gray-200 border border-white/10 rounded-bl-md'
                  }`}
                >
                  <p className="break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-cyber-neon/70' : 'text-gray-500'}`}>
                    {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {sendError && (
        <p className="text-red-400 text-xs mb-1 px-1">{sendError}</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          autoFocus
          placeholder="Message..."
          className="flex-1 rounded-xl bg-discord-card border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-neon/40"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="shrink-0 px-4 py-2 rounded-xl bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/40 hover:bg-cyber-neon/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          Send
        </button>
      </div>
    </motion.div>
  )
}
