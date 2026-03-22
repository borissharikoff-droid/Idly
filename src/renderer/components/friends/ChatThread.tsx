import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { X, Send, Copy, CornerUpLeft } from '../../lib/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { playClickSound } from '../../lib/sounds'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import type { ChatMessage } from '../../hooks/useChat'
import { MOTION } from '../../lib/motion'
import { BackButton } from '../shared/BackButton'
import { ErrorState } from '../shared/ErrorState'
import { SkeletonBlock } from '../shared/PageLoading'

interface ChatThreadProps {
  profile: FriendProfileType
  onBack: () => void
  onOpenProfile?: () => void
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  sendError?: string | null
  getConversation: (otherUserId: string) => Promise<ChatMessage[]>
  sendMessage: (receiverId: string, body: string) => Promise<void>
  markConversationRead: (otherUserId: string) => Promise<void>
}

const NEAR_BOTTOM_THRESHOLD = 100

/** Linkify URLs in text — returns array of string | JSX elements */
function renderMessageBody(text: string): (string | JSX.Element)[] {
  const urlRegex = /(https?:\/\/[^\s<>'")\]]+)/g
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const url = match[1]
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 decoration-1 opacity-80 hover:opacity-100 transition-opacity break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url.length > 50 ? url.slice(0, 48) + '...' : url}
      </a>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function CopyToast({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -14, scale: 0.93 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="fixed top-10 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded text-xs font-medium shadow-2xl"
          style={{ background: 'rgba(16,16,26,0.97)', border: '1px solid rgba(0,255,170,0.25)', backdropFilter: 'blur(12px)' }}
        >
          <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,255,170,0.5), transparent)' }} />
          <span className="text-accent">Copied to clipboard</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ReadReceipt({ read }: { read: boolean }) {
  return (
    <span className={`inline-flex ml-1 ${read ? 'text-accent/70' : 'text-gray-500/50'}`} title={read ? 'Read' : 'Sent'}>
      {read ? (
        <svg width="14" height="9" viewBox="0 0 16 10" fill="none" className="inline-block">
          <path d="M1 5.5L4.5 9L11 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 5.5L8.5 9L15 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="10" height="9" viewBox="0 0 12 10" fill="none" className="inline-block">
          <path d="M1 5.5L4.5 9L11 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  )
}

/** Typing indicator — three bouncing dots */
function TypingIndicator({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-1 py-1"
    >
      <div className="flex items-center gap-[3px] px-3.5 py-2.5 rounded rounded-bl-sm bg-white/[0.08] border border-white/[0.08]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-[5px] h-[5px] rounded-full bg-gray-400"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <span className="text-micro text-gray-500">{name} is typing</span>
    </motion.div>
  )
}

interface ReplyPreviewProps {
  message: ChatMessage
  senderName: string
  onClear: () => void
}

function ReplyPreview({ message, senderName, onClear }: ReplyPreviewProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded bg-white/[0.04] border-l-2 border-accent/50 text-xs">
      <div className="flex-1 min-w-0">
        <span className="text-accent/80 font-medium">{senderName}</span>
        <p className="text-gray-400 truncate mt-0.5">{message.body.slice(0, 80)}{message.body.length > 80 ? '...' : ''}</p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors p-1"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

/** Send icon wrapper */
function SendIcon({ className }: { className?: string }) {
  return <Send className={`w-[18px] h-[18px] ${className ?? ''}`} />
}

/** Hook for typing indicator via Supabase Realtime Broadcast */
function useTypingIndicator(peerId: string | null, userId: string | undefined) {
  const [peerIsTyping, setPeerIsTyping] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastBroadcastRef = useRef(0)

  useEffect(() => {
    if (!supabase || !userId || !peerId) return

    // Use a deterministic channel name so both peers join the same channel
    const ids = [userId, peerId].sort()
    const channelName = `chat-typing:${ids[0]}:${ids[1]}`

    const channel = supabase.channel(channelName)
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload?: { user_id?: string } }) => {
        if (payload.payload?.user_id === peerId) {
          setPeerIsTyping(true)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setPeerIsTyping(false), 3000)
        }
      })
      .subscribe()

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [userId, peerId])

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !userId) return
    // Throttle: max once per 2s
    const now = Date.now()
    if (now - lastBroadcastRef.current < 2000) return
    lastBroadcastRef.current = now
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
  }, [userId])

  return { peerIsTyping, broadcastTyping }
}

const isImageUrl = (s: string | null | undefined): boolean => !!s && /^(https?:\/\/|data:|blob:|file:|\/)/i.test(s)

export function ChatThread({ profile, onBack, onOpenProfile, messages, loading, sending, sendError, getConversation, sendMessage, markConversationRead }: ChatThreadProps) {
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const [copyToast, setCopyToast] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wasAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const { peerIsTyping, broadcastTyping } = useTypingIndicator(profile.id, user?.id)

  useEffect(() => {
    getConversation(profile.id)
    markConversationRead(profile.id)
    prevMessageCountRef.current = 0
  }, [profile.id, getConversation, markConversationRead])

  useEffect(() => {
    if (messages.length > 0) {
      markConversationRead(profile.id)
    }
  }, [messages.length, profile.id, markConversationRead])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_THRESHOLD
    }
    el.addEventListener('scroll', check, { passive: true })
    check()
    return () => el.removeEventListener('scroll', check)
  }, [])

  useLayoutEffect(() => {
    if (loading || messages.length === 0) return
    const el = listRef.current
    if (!el) return

    const lastMsg = messages[messages.length - 1]
    const isIncoming = lastMsg.sender_id !== user?.id
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    const isInitialLoad = prevCount === 0
    const shouldScrollOnIncoming = isIncoming && wasAtBottomRef.current
    const shouldScrollOnSend = !isIncoming

    if (isInitialLoad || shouldScrollOnIncoming || shouldScrollOnSend) {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' }))
    }
    wasAtBottomRef.current = true
  }, [loading, messages, user?.id])

  useEffect(() => {
    inputRef.current?.focus()
  }, [profile.id])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.min(el.scrollHeight, 120)
    el.style.height = `${Math.max(h, 40)}px`
    el.style.overflowY = h >= 120 ? 'auto' : 'hidden'
  }, [input])

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    const body = replyTo
      ? `> ${replyTo.body.split('\n')[0].slice(0, 60)}${replyTo.body.length > 60 ? '...' : ''}\n${text}`
      : text
    sendMessage(profile.id, body)
    setInput('')
    setReplyTo(null)
    playClickSound()
  }

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopyToast(false), 1500)
    })
  }, [])

  const handleReply = useCallback((m: ChatMessage) => {
    setReplyTo(m)
    inputRef.current?.focus()
  }, [])

  const groupedMessages = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: ChatMessage[] }> = []
    for (const m of messages) {
      const d = new Date(m.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const today = new Date()
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()
      const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const prev = groups[groups.length - 1]
      if (!prev || prev.key !== key) {
        groups.push({ key, label, items: [m] })
      } else {
        prev.items.push(m)
      }
    }
    return groups
  }, [messages])

  // Determine if consecutive messages from same sender (for avatar grouping)
  const isFirstInGroup = (items: ChatMessage[], idx: number): boolean => {
    if (idx === 0) return true
    return items[idx].sender_id !== items[idx - 1].sender_id
  }

  const isLastInGroup = (items: ChatMessage[], idx: number): boolean => {
    if (idx === items.length - 1) return true
    return items[idx].sender_id !== items[idx + 1].sender_id
  }

  return (
    <motion.div
      initial={MOTION.subPage.initial}
      animate={MOTION.subPage.animate}
      transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
      className="flex flex-col flex-1 min-h-0"
    >
      <CopyToast visible={copyToast} />

      {/* Header */}
      <div className="relative flex items-center justify-center shrink-0 py-2.5 mb-1">
        <div className="absolute left-0">
          <BackButton onClick={onBack} />
        </div>
        <button
          type="button"
          onClick={() => { onOpenProfile?.(); playClickSound() }}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          {/* Avatar */}
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-xs font-bold text-gray-300 overflow-hidden border border-white/10">
              {isImageUrl(profile.avatar_url)
                ? <img src={profile.avatar_url!} alt="" className="w-full h-full object-cover" />
                : (profile.avatar_url || profile.username?.[0]?.toUpperCase() || '?')
              }
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1e2024] ${profile.is_online ? 'bg-emerald-400' : 'bg-gray-500'}`} />
          </div>
          <div className="text-left">
            <p className="text-sm text-white font-medium leading-none">{profile.username || 'Friend'}</p>
            <p className="text-micro text-gray-500 mt-0.5">
              {peerIsTyping ? (
                <span className="text-accent/70">typing...</span>
              ) : (
                profile.is_online ? 'Online' : 'Offline'
              )}
            </p>
          </div>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-0.5 mb-2 select-text"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        {loading ? (
          <div className="space-y-3 py-2">
            <div className="flex justify-center">
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex justify-start">
              <SkeletonBlock className="h-12 w-40 rounded rounded-bl-sm" />
            </div>
            <div className="flex justify-end">
              <SkeletonBlock className="h-10 w-32 rounded rounded-br-sm bg-accent/10" />
            </div>
            <div className="flex justify-start">
              <SkeletonBlock className="h-14 w-36 rounded rounded-bl-sm" />
            </div>
            <div className="flex justify-end">
              <SkeletonBlock className="h-8 w-28 rounded rounded-br-sm bg-accent/10" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <span className="text-2xl">👋</span>
            </div>
            <p className="text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-500">Say hi to start the conversation</p>
          </div>
        ) : (
          <>
            {groupedMessages.map((group) => (
              <div key={group.key} className="space-y-0.5">
                {/* Date divider */}
                <div className="flex items-center justify-center py-3">
                  <div className="h-px flex-1 bg-white/[0.04]" />
                  <span className="text-micro text-gray-500 font-medium px-3">
                    {group.label}
                  </span>
                  <div className="h-px flex-1 bg-white/[0.04]" />
                </div>
                {group.items.map((m, idx) => {
                  const isMe = m.sender_id === user?.id
                  const isHovered = hoveredMsg === m.id
                  const first = isFirstInGroup(group.items, idx)
                  const last = isLastInGroup(group.items, idx)
                  // Collapse timestamps: show only if >2 min gap from prev msg by same sender
                  const prev = idx > 0 ? group.items[idx - 1] : null
                  const showTime = !prev
                    || prev.sender_id !== m.sender_id
                    || (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) > 120_000

                  // Detect quoted reply
                  const isQuote = m.body.startsWith('> ')
                  let quoteLine = ''
                  let bodyText = m.body
                  if (isQuote) {
                    const nlIdx = m.body.indexOf('\n')
                    if (nlIdx > 0) {
                      quoteLine = m.body.slice(2, nlIdx)
                      bodyText = m.body.slice(nlIdx + 1)
                    }
                  }

                  // Dynamic border radius based on grouping
                  const radius = isMe
                    ? `${first ? '18px' : '6px'} 18px 18px ${last ? '6px' : '6px'}`
                    : `18px ${first ? '18px' : '6px'} ${last ? '6px' : '6px'} 18px`

                  return (
                    <div
                      key={m.id}
                      className={`group flex items-end gap-1 ${isMe ? 'justify-end pl-12' : 'justify-start pr-12'} ${first && idx > 0 ? 'mt-2' : ''}`}
                      onMouseEnter={() => setHoveredMsg(m.id)}
                      onMouseLeave={() => setHoveredMsg(null)}
                    >
                      {/* Avatar placeholder for received messages — only show on last msg in group */}
                      {!isMe && (
                        <div className="w-7 shrink-0 self-end">
                          {last && (
                            <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-micro font-bold text-gray-400 overflow-hidden border border-white/10">
                              {isImageUrl(profile.avatar_url)
                                ? <img src={profile.avatar_url!} alt="" className="w-full h-full object-cover" />
                                : (profile.avatar_url || profile.username?.[0]?.toUpperCase() || '?')
                              }
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action buttons for received msgs */}
                      {!isMe && (
                        <div className={`flex gap-0.5 shrink-0 transition-opacity duration-100 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                          <button
                            type="button"
                            onClick={() => handleReply(m)}
                            className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors"
                            title="Reply"
                          >
                            <CornerUpLeft className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(m.body)}
                            className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors"
                            title="Copy"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Message bubble */}
                      <div
                        className={`max-w-[75%] px-3.5 py-2 text-body leading-relaxed transition-all duration-75 ${
                          isMe
                            ? 'bg-accent/12 text-white border border-accent/20'
                            : 'bg-white/[0.06] text-gray-100 border border-white/[0.06]'
                        } ${isHovered ? (isMe ? 'bg-accent/18' : 'bg-white/[0.09]') : ''}`}
                        style={{ borderRadius: radius }}
                      >
                        {/* Quoted reply */}
                        {quoteLine && (
                          <div className={`text-caption mb-1.5 pl-2 py-1 border-l-2 ${isMe ? 'border-accent/40 text-accent/50' : 'border-white/20 text-gray-400'} truncate`}>
                            {quoteLine}
                          </div>
                        )}
                        <p className="break-words whitespace-pre-wrap">{renderMessageBody(bodyText)}</p>
                        {/* Footer: time + read receipt */}
                        {showTime && (
                          <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <span className={`text-micro ${isMe ? 'text-accent/40' : 'text-gray-500/60'}`}>
                              {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                            {isMe && <ReadReceipt read={m.read_at != null} />}
                          </div>
                        )}
                      </div>

                      {/* Action buttons for sent msgs */}
                      {isMe && (
                        <div className={`flex gap-0.5 shrink-0 transition-opacity duration-100 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                          <button
                            type="button"
                            onClick={() => handleCopy(m.body)}
                            className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors"
                            title="Copy"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReply(m)}
                            className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors"
                            title="Reply"
                          >
                            <CornerUpLeft className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Typing indicator */}
            <AnimatePresence>
              {peerIsTyping && (
                <TypingIndicator name={profile.username || 'Friend'} />
              )}
            </AnimatePresence>
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <ErrorState message={sendError} className="mb-2 py-2 shrink-0" />
      )}

      {/* Input area */}
      <div className="shrink-0 px-2 pb-1">
        {/* Reply preview */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ReplyPreview
                message={replyTo}
                senderName={replyTo.sender_id === user?.id ? 'You' : (profile.username || 'Friend')}
                onClear={() => setReplyTo(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              broadcastTyping()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) return
                e.preventDefault()
                handleSend()
              }
              if (e.key === 'Escape' && replyTo) {
                setReplyTo(null)
              }
            }}
            placeholder={replyTo ? 'Type your reply...' : 'Message...'}
            rows={1}
            className="flex-1 resize-none min-h-[40px] rounded bg-surface-0/80 border border-white/[0.06] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent/30 transition-colors"
          />
          <motion.button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            whileTap={!sending && input.trim() ? { scale: 0.9 } : {}}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 ${
              input.trim()
                ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 shadow-sm shadow-accent/10'
                : 'bg-white/[0.04] text-gray-500 border border-white/[0.06]'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {sending ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              />
            ) : (
              <SendIcon />
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
