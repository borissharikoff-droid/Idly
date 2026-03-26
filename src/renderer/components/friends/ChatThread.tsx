import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { X, Send, Copy, CornerUpLeft } from '../../lib/icons'
import { parseFriendPresence, formatSessionDurationCompact } from '../../lib/friendPresence'
import { motion, AnimatePresence } from 'framer-motion'
import { playClickSound } from '../../lib/sounds'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import type { ChatMessage, ReactionsMap } from '../../hooks/useChat'
import { MOTION } from '../../lib/motion'
import { BackButton } from '../shared/BackButton'
import { ErrorState } from '../shared/ErrorState'
import { SkeletonBlock } from '../shared/PageLoading'

const REACTIONS = ['👍', '👎', '🖕', '💩', '🤡'] as const
const IMAGE_PREFIX = '[img]'
const ROLL_PREFIX = '[roll:'

const isChatImage = (body: string) => body.startsWith(IMAGE_PREFIX)
const chatImageUrl = (body: string) => body.slice(IMAGE_PREFIX.length)
const isChatRoll = (body: string) => body.startsWith(ROLL_PREFIX) && body.endsWith(']')
const chatRollValue = (body: string) => parseInt(body.slice(ROLL_PREFIX.length, -1), 10)

function RollBubble({ value, username, rolling = false }: { value: number; username: string; rolling?: boolean }) {
  return (
    <div className="flex items-center justify-center py-1.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'backOut' }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10"
      >
        <motion.span
          animate={rolling ? { rotate: [0, 20, -20, 20, -10, 0] } : {}}
          transition={{ duration: 0.6, repeat: rolling ? Infinity : 0, ease: 'easeInOut' }}
          className="text-base select-none"
        >🎲</motion.span>
        <span className="text-micro text-gray-400 font-mono">{username}</span>
        <span className="text-micro text-gray-500">rolled</span>
        {rolling ? (
          <span className="text-violet-300 font-mono font-bold text-xs w-6 text-center">
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.25, repeat: Infinity }}>
              {Math.floor(Math.random() * 101)}
            </motion.span>
          </span>
        ) : (
          <motion.span
            key={value}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'backOut' }}
            className="text-violet-300 font-mono font-bold text-xs"
          >
            {value}
          </motion.span>
        )}
        <span className="text-micro text-gray-600 font-mono">(0–100)</span>
      </motion.div>
    </div>
  )
}

async function compressImage(file: File): Promise<File> {
  // GIFs lose animation on canvas — skip
  if (file.type === 'image/gif') return file

  const MAX_PX = 1920
  const QUALITY = 0.85

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) { height = Math.round(height * MAX_PX / width); width = MAX_PX }
        else { width = Math.round(width * MAX_PX / height); height = MAX_PX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      // Keep PNG for transparency, convert everything else to JPEG
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const outExt  = outType === 'image/png' ? 'png' : 'jpg'
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, `.${outExt}`), { type: outType }))
        },
        outType,
        QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// ── Reaction picker (always rendered, shown/hidden via CSS opacity) ──────────

interface ReactionPickerProps {
  messageId: string
  isMe: boolean
  visible: boolean
  myUserId: string | undefined
  reactions: ReactionsMap
  onToggle: (messageId: string, reaction: string) => void
}

function ReactionPicker({ messageId, isMe, visible, myUserId, reactions, onToggle }: ReactionPickerProps) {
  return (
    <div
      className={`absolute ${isMe ? 'right-0 -top-8' : 'left-8 -top-8'} z-10 transition-opacity duration-75 pointer-events-none ${visible ? 'opacity-100 pointer-events-auto' : 'opacity-0'}`}
    >
      <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full border border-white/[0.08] bg-surface-1 shadow-lg">
        {REACTIONS.map((emoji) => {
          const reacted = myUserId ? (reactions[messageId]?.[emoji]?.includes(myUserId) ?? false) : false
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggle(messageId, emoji)}
              className={`text-sm leading-none w-6 h-6 flex items-center justify-center rounded-full transition-transform duration-75 hover:scale-110 hover:bg-white/10 ${reacted ? 'bg-accent/20' : ''}`}
            >
              {emoji}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatThreadProps {
  profile: FriendProfileType
  onBack: () => void
  onOpenProfile?: () => void
  messages: ChatMessage[]
  reactions: ReactionsMap
  loading: boolean
  loadingMore: boolean
  hasMoreMessages: boolean
  sending: boolean
  sendError?: string | null
  getConversation: (otherUserId: string) => Promise<ChatMessage[]>
  loadMoreMessages: (otherUserId: string, oldestCreatedAt: string) => Promise<void>
  sendMessage: (receiverId: string, body: string) => Promise<void>
  markConversationRead: (otherUserId: string) => Promise<void>
  toggleReaction: (messageId: string, reaction: string) => void
}

const NEAR_BOTTOM_THRESHOLD = 100

// ── Linkify ───────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

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

function ReplyPreview({ message, senderName, onClear }: { message: ChatMessage; senderName: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded bg-white/[0.04] border-l-2 border-accent/50 text-xs">
      <div className="flex-1 min-w-0">
        <span className="text-accent/80 font-medium">{senderName}</span>
        <p className="text-gray-400 truncate mt-0.5">{message.body.slice(0, 80)}{message.body.length > 80 ? '...' : ''}</p>
      </div>
      <button type="button" onClick={onClear} className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors p-1">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Typing indicator hook ─────────────────────────────────────────────────────

function useTypingIndicator(peerId: string | null, userId: string | undefined) {
  const [peerIsTyping, setPeerIsTyping] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastBroadcastRef = useRef(0)

  useEffect(() => {
    if (!supabase || !userId || !peerId) return
    const ids = [userId, peerId].sort()
    const channel = supabase.channel(`chat-typing:${ids[0]}:${ids[1]}`)
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
    const now = Date.now()
    if (now - lastBroadcastRef.current < 2000) return
    lastBroadcastRef.current = now
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
  }, [userId])

  return { peerIsTyping, broadcastTyping }
}

const isAvatarUrl = (s: string | null | undefined): boolean => !!s && /^(https?:\/\/|data:|blob:|file:|\/)/i.test(s)

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.img
        src={url}
        alt=""
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

// ── ImageUploadButton ─────────────────────────────────────────────────────────

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChatThread({ profile, onBack, onOpenProfile, messages, reactions, loading, loadingMore, hasMoreMessages, sending, sendError, getConversation, loadMoreMessages, sendMessage, markConversationRead, toggleReaction }: ChatThreadProps) {
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const [copyToast, setCopyToast] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [rolling, setRolling] = useState(false)
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null)
  const [contextMenuMsg, setContextMenuMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!contextMenuMsg) return
    const close = () => setContextMenuMsg(null)
    window.addEventListener('click', close, { once: true })
    return () => window.removeEventListener('click', close)
  }, [contextMenuMsg])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const sendTimestampsRef = useRef<number[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wasAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const { peerIsTyping, broadcastTyping } = useTypingIndicator(profile.id, user?.id)

  // Reset counter synchronously before the scroll effect so initial-load detection works
  useLayoutEffect(() => {
    prevMessageCountRef.current = 0
  }, [profile.id])

  // Hard-scroll to bottom when switching chats (covers cached messages + reactions already loaded)
  useEffect(() => {
    wasAtBottomRef.current = true
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    // Extra pass after images/reactions render
    const t = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
    return () => cancelAnimationFrame(t)
  }, [profile.id])

  // When reactions load/change and we're at bottom — stay at bottom
  useEffect(() => {
    if (!wasAtBottomRef.current) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [reactions])

  useEffect(() => {
    getConversation(profile.id)
    markConversationRead(profile.id)
  }, [profile.id, getConversation, markConversationRead])

  useEffect(() => {
    if (messages.length > 0) markConversationRead(profile.id)
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
    if (isInitialLoad || (isIncoming && wasAtBottomRef.current) || !isIncoming) {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' }))
    }
    wasAtBottomRef.current = true
  }, [loading, messages, user?.id, profile.id])

  // Scroll to bottom when peer starts typing (same as Telegram behaviour)
  useEffect(() => {
    if (!peerIsTyping) return
    if (!wasAtBottomRef.current) return
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [peerIsTyping])

  useEffect(() => { inputRef.current?.focus() }, [profile.id])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.min(el.scrollHeight, 120)
    el.style.height = `${Math.max(h, 40)}px`
    el.style.overflowY = h >= 120 ? 'auto' : 'hidden'
  }, [input])

  const checkRateLimit = (): boolean => {
    const now = Date.now()
    sendTimestampsRef.current = sendTimestampsRef.current.filter((t) => now - t < 10_000)
    if (now - (sendTimestampsRef.current.at(-1) ?? 0) < 500) return false
    if (sendTimestampsRef.current.length >= 10) return false
    sendTimestampsRef.current.push(now)
    return true
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    if (!checkRateLimit()) return
    if (text === '/roll') {
      setInput('')
      setRolling(true)
      const result = Math.floor(Math.random() * 101)
      setTimeout(() => {
        setRolling(false)
        sendMessage(profile.id, `${ROLL_PREFIX}${result}]`)
        playClickSound()
      }, 1200)
      return
    }
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

  const handleImageFile = useCallback(async (file: File) => {
    if (!supabase || !user?.id) return
    if (!checkRateLimit()) return
    setUploadingImage(true)
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('chat-images').upload(path, compressed, { contentType: compressed.type })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      await sendMessage(profile.id, `${IMAGE_PREFIX}${publicUrl}`)
    }
    setUploadingImage(false)
  }, [user?.id, profile.id, sendMessage])

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
      if (!prev || prev.key !== key) groups.push({ key, label, items: [m] })
      else prev.items.push(m)
    }
    return groups
  }, [messages])

  const handleLoadMore = useCallback(async () => {
    if (!hasMoreMessages || loadingMore || messages.length === 0) return
    const el = listRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    await loadMoreMessages(profile.id, messages[0].created_at)
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevScrollHeight
    })
  }, [hasMoreMessages, loadingMore, messages, loadMoreMessages, profile.id])

  const isFirstInGroup = (items: ChatMessage[], idx: number) => idx === 0 || items[idx].sender_id !== items[idx - 1].sender_id
  const isLastInGroup  = (items: ChatMessage[], idx: number) => idx === items.length - 1 || items[idx].sender_id !== items[idx + 1].sender_id

  return (
    <motion.div
      initial={MOTION.subPage.initial}
      animate={MOTION.subPage.animate}
      transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
      className="flex flex-col flex-1 min-h-0"
    >
      <AnimatePresence>
        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </AnimatePresence>
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
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-xs font-bold text-gray-300 overflow-hidden border border-white/10">
              {isAvatarUrl(profile.avatar_url)
                ? <img src={profile.avatar_url!} alt="" className="w-full h-full object-cover" />
                : (profile.avatar_url || profile.username?.[0]?.toUpperCase() || '?')
              }
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1e2024] ${profile.is_online ? 'bg-emerald-400' : 'bg-gray-500'}`} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm text-white font-medium leading-none">{profile.username || 'Friend'}</p>
            <p className="text-micro text-gray-500 mt-0.5 truncate max-w-[180px]">
              {peerIsTyping ? (
                <span className="text-accent/70">typing...</span>
              ) : (() => {
                if (!profile.is_online) return 'Offline'
                const { activityLabel, appName, sessionStartMs } = parseFriendPresence(profile.current_activity)
                if (appName) {
                  const dur = sessionStartMs ? ` · ${formatSessionDurationCompact(sessionStartMs)}` : ''
                  return <span title={activityLabel}>{appName}{dur}</span>
                }
                if (activityLabel && activityLabel !== 'AFK') {
                  const dur = sessionStartMs ? ` · ${formatSessionDurationCompact(sessionStartMs)}` : ''
                  return <span>{activityLabel}{dur}</span>
                }
                if (activityLabel === 'AFK') return <span className="text-gray-600">AFK</span>
                return 'Online'
              })()}
            </p>
          </div>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-0.5 mb-2 select-text"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        {loading ? (
          <div className="space-y-3 py-2">
            <div className="flex justify-center"><SkeletonBlock className="h-5 w-16 rounded-full" /></div>
            <div className="flex justify-start"><SkeletonBlock className="h-12 w-40 rounded rounded-bl-sm" /></div>
            <div className="flex justify-end"><SkeletonBlock className="h-10 w-32 rounded rounded-br-sm bg-accent/10" /></div>
            <div className="flex justify-start"><SkeletonBlock className="h-14 w-36 rounded rounded-bl-sm" /></div>
            <div className="flex justify-end"><SkeletonBlock className="h-8 w-28 rounded rounded-br-sm bg-accent/10" /></div>
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
            {/* Load older messages */}
            {hasMoreMessages && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-micro text-gray-500 hover:text-gray-300 border border-white/10 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
                >
                  {loadingMore ? 'Loading...' : '↑ Load older messages'}
                </button>
              </div>
            )}
            {groupedMessages.map((group) => (
              <div key={group.key} className="space-y-0.5">
                {/* Date divider */}
                <div className="flex items-center justify-center py-3">
                  <div className="h-px flex-1 bg-white/[0.04]" />
                  <span className="text-micro text-gray-500 font-medium px-3">{group.label}</span>
                  <div className="h-px flex-1 bg-white/[0.04]" />
                </div>

                {group.items.map((m, idx) => {
                  const isMe = m.sender_id === user?.id
                  const isHovered = hoveredMsg === m.id
                  const first = isFirstInGroup(group.items, idx)
                  const last  = isLastInGroup(group.items, idx)
                  const prev  = idx > 0 ? group.items[idx - 1] : null
                  const showTime = !prev || prev.sender_id !== m.sender_id
                    || (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) > 120_000

                  const isImg = isChatImage(m.body)
                  const imgUrl = isImg ? chatImageUrl(m.body) : ''
                  const isRoll = isChatRoll(m.body)

                  // Roll messages render as centered system bubbles — skip normal bubble
                  if (isRoll) {
                    const rollSenderName = isMe
                      ? (user?.user_metadata?.username || 'You')
                      : (profile.username || 'Friend')
                    return (
                      <div key={m.id}>
                        <RollBubble value={chatRollValue(m.body)} username={rollSenderName} />
                      </div>
                    )
                  }

                  // Quoted reply (text messages only)
                  const isQuote = !isImg && m.body.startsWith('> ')
                  let quoteLine = ''
                  let bodyText  = m.body
                  if (isQuote) {
                    const nlIdx = m.body.indexOf('\n')
                    if (nlIdx > 0) { quoteLine = m.body.slice(2, nlIdx); bodyText = m.body.slice(nlIdx + 1) }
                  }

                  const radius = isMe
                    ? `${first ? '18px' : '6px'} 18px 18px ${last ? '6px' : '6px'}`
                    : `18px ${first ? '18px' : '6px'} ${last ? '6px' : '6px'} 18px`

                  const msgReactions   = reactions[m.id] ?? {}
                  const activeReactions = REACTIONS.filter((r) => (msgReactions[r]?.length ?? 0) > 0)

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${first && idx > 0 ? 'mt-2' : ''}`}
                      onMouseEnter={() => setHoveredMsg(m.id)}
                      onMouseLeave={() => setHoveredMsg(null)}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenuMsg(m.id) }}
                    >
                      <div className={`flex items-end gap-1 ${isMe ? 'justify-end pl-12' : 'justify-start pr-12'} w-full`}>

                        {/* Avatar (received) */}
                        {!isMe && (
                          <div className="w-7 shrink-0 self-end">
                            {last && (
                              <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-micro font-bold text-gray-400 overflow-hidden border border-white/10">
                                {isAvatarUrl(profile.avatar_url)
                                  ? <img src={profile.avatar_url!} alt="" className="w-full h-full object-cover" />
                                  : (profile.avatar_url || profile.username?.[0]?.toUpperCase() || '?')
                                }
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons (received) */}
                        {!isMe && (
                          <div className={`flex gap-0.5 shrink-0 transition-opacity duration-75 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            <button type="button" onClick={() => handleReply(m)} className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors" title="Reply">
                              <CornerUpLeft className="w-3 h-3" />
                            </button>
                            {!isImg && (
                              <button type="button" onClick={() => handleCopy(m.body)} className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors" title="Copy">
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Message bubble (relative so ReactionPicker can float outside it) */}
                        <div className={`relative ${isImg ? '' : 'max-w-[75%]'}`}>
                          {isImg ? (
                            <div className="max-w-[220px] relative cursor-zoom-in" style={{ borderRadius: radius, overflow: 'hidden' }} onClick={() => setLightboxUrl(imgUrl)}>
                              <img
                                src={imgUrl}
                                alt="image"
                                className="block w-full h-auto hover:brightness-90 transition-[filter] duration-100"
                                style={{ maxHeight: 260 }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                              {showTime && (
                                <div className={`absolute bottom-1 ${isMe ? 'right-2' : 'left-2'} flex items-center gap-1 px-1 py-0.5 rounded bg-black/50`}>
                                  <span className="text-micro text-white/70">
                                    {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                  {isMe && <ReadReceipt read={m.read_at != null} />}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              className={`px-3.5 py-2 text-body leading-relaxed transition-colors duration-75 ${
                                isMe
                                  ? 'bg-accent/12 text-white border border-accent/20'
                                  : 'bg-white/[0.06] text-gray-100 border border-white/[0.06]'
                              } ${isHovered ? (isMe ? 'bg-accent/18' : 'bg-white/[0.09]') : ''}`}
                              style={{ borderRadius: radius }}
                            >
                              {quoteLine && (
                                <div className={`text-caption mb-1.5 pl-2 py-1 border-l-2 ${isMe ? 'border-accent/40 text-accent/50' : 'border-white/20 text-gray-400'} truncate`}>
                                  {quoteLine}
                                </div>
                              )}
                              <p className="break-words whitespace-pre-wrap">{renderMessageBody(bodyText)}</p>
                              {showTime && (
                                <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  <span className={`text-micro ${isMe ? 'text-accent/40' : 'text-gray-500/60'}`}>
                                    {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                  {isMe && <ReadReceipt read={m.read_at != null} />}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Reaction picker — absolute, floats outside bubble, no layout impact */}
                          <ReactionPicker
                            messageId={m.id}
                            isMe={isMe}
                            visible={contextMenuMsg === m.id}
                            myUserId={user?.id}
                            reactions={reactions}
                            onToggle={toggleReaction}
                          />
                        </div>

                        {/* Action buttons (sent) */}
                        {isMe && (
                          <div className={`flex gap-0.5 shrink-0 transition-opacity duration-75 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            {!isImg && (
                              <button type="button" onClick={() => handleCopy(m.body)} className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors" title="Copy">
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                            <button type="button" onClick={() => handleReply(m)} className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors" title="Reply">
                              <CornerUpLeft className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Reaction pills */}
                      {activeReactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'pr-1 justify-end' : 'pl-8 justify-start'}`}>
                          {activeReactions.map((emoji) => {
                            const count   = msgReactions[emoji].length
                            const reacted = user?.id ? msgReactions[emoji].includes(user.id) : false
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(m.id, emoji)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-all duration-75 hover:scale-105 ${
                                  reacted
                                    ? 'bg-accent/20 border-accent/40 text-accent'
                                    : 'bg-white/[0.06] border-white/[0.08] text-gray-400 hover:border-white/20'
                                }`}
                              >
                                <span className="leading-none">{emoji}</span>
                                <span className="leading-none font-medium tabular-nums">{count}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Typing indicator */}
            <AnimatePresence>
              {peerIsTyping && <TypingIndicator name={profile.username || 'Friend'} />}
            </AnimatePresence>
            {/* Local roll animation */}
            <AnimatePresence>
              {rolling && <RollBubble key="rolling" value={0} username={user?.user_metadata?.username || 'You'} rolling />}
            </AnimatePresence>
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && <ErrorState message={sendError} className="mb-2 py-2 shrink-0" />}

      {/* Input area */}
      <div className="shrink-0 px-2 pb-1">
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImageFile(file)
              e.target.value = ''
            }}
          />

          {/* Image upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            title="Send image"
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] border border-white/[0.06] transition-all duration-150 disabled:opacity-30"
          >
            {uploadingImage ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              />
            ) : (
              <ImageIcon />
            )}
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); broadcastTyping() }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData.items)
              const imgItem = items.find((i) => i.type.startsWith('image/'))
              if (imgItem) {
                e.preventDefault()
                const file = imgItem.getAsFile()
                if (file) handleImageFile(file)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) return
                e.preventDefault()
                handleSend()
              }
              if (e.key === 'Escape' && replyTo) setReplyTo(null)
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
              <Send className="w-[18px] h-[18px]" />
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
