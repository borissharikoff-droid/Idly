import { useLayoutEffect, useRef, useState, useCallback, useEffect } from 'react'
import { X, Send, Settings, Copy, Users, MessageCircle, Dices } from '../../lib/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { playClickSound } from '../../lib/sounds'
import { MOTION_VARIANTS } from '../../lib/motion'
import { BackButton } from '../shared/BackButton'
import type { GroupChat, GroupMember, GroupMessage, GroupReactionsMap } from '../../hooks/useGroupChat'
import type { FriendProfile } from '../../hooks/useFriends'
import { GroupChatSettings } from './GroupChatSettings'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// ── Group typing indicator ────────────────────────────────────────────────────

function useGroupTyping(groupId: string, myId: string, myUsername: string) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]) // usernames
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastBroadcastRef = useRef(0)

  useEffect(() => {
    if (!supabase || !groupId) return
    const channel = supabase.channel(`group-typing:${groupId}`)
    channelRef.current = channel
    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload?: { user_id?: string; username?: string } }) => {
        const { user_id, username } = payload.payload ?? {}
        if (!user_id || user_id === myId || !username) return
        setTypingUsers((prev) => prev.includes(username) ? prev : [...prev, username])
        if (timersRef.current[user_id]) clearTimeout(timersRef.current[user_id])
        timersRef.current[user_id] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== username))
          delete timersRef.current[user_id]
        }, 3000)
      })
      .subscribe()
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
      timersRef.current = {}
      channel.unsubscribe()
      channelRef.current = null
      setTypingUsers([])
    }
  }, [groupId, myId])

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current) return
    const now = Date.now()
    if (now - lastBroadcastRef.current < 2000) return
    lastBroadcastRef.current = now
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: myId, username: myUsername } })
  }, [myId, myUsername])

  return { typingUsers, broadcastTyping }
}

function typingLabel(users: string[]): string {
  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} is typing…`
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing…`
  return `${users[0]}, ${users[1]} and ${users.length - 2} more are typing…`
}

const REACTIONS = ['👍', '👎', '🖕', '💩', '🤡'] as const

const ROLL_PREFIX = '[roll:'
const IMAGE_PREFIX = '[img]'

const isChatRoll  = (body: string) => body.startsWith(ROLL_PREFIX) && body.endsWith(']')
const chatRollValue = (body: string) => parseInt(body.slice(ROLL_PREFIX.length, -1), 10)
const isChatImage = (body: string) => body.startsWith(IMAGE_PREFIX)
const chatImageUrl = (body: string) => body.slice(IMAGE_PREFIX.length)

const NEAR_BOTTOM_THRESHOLD = 100

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ── Image compress (same as ChatThread) ───────────────────────────────────────

async function compressImage(file: File): Promise<File> {
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
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const outExt  = outType === 'image/png' ? 'png' : 'jpg'
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, `.${outExt}`), { type: outType }) : file),
        outType, QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.img
        src={url} alt=""
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button" onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
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

function RollBubble({ value, username }: { value: number; username: string }) {
  return (
    <div className="flex items-center justify-center py-1.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'backOut' }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10"
      >
        <Dices className="w-4 h-4 text-violet-400 select-none" />
        <span className="text-micro text-gray-400 font-mono">{username}</span>
        <span className="text-micro text-gray-500">rolled</span>
        <motion.span
          key={value} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'backOut' }}
          className="text-violet-300 font-mono font-bold text-xs"
        >
          {value}
        </motion.span>
        <span className="text-micro text-gray-600 font-mono">(0–100)</span>
      </motion.div>
    </div>
  )
}

function ReactionPicker({ messageId, isMe, visible, myUserId, reactions, onToggle }: {
  messageId: string; isMe: boolean; visible: boolean
  myUserId: string | undefined; reactions: GroupReactionsMap
  onToggle: (messageId: string, reaction: string) => void
}) {
  return (
    <div className={`absolute ${isMe ? 'right-0 -top-8' : 'left-8 -top-8'} z-10 transition-opacity duration-75 pointer-events-none ${visible ? 'opacity-100 pointer-events-auto' : 'opacity-0'}`}>
      <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full border border-white/[0.08] bg-surface-1 shadow-lg">
        {REACTIONS.map((emoji) => {
          const reacted = myUserId ? (reactions[messageId]?.[emoji]?.includes(myUserId) ?? false) : false
          return (
            <button
              key={emoji} type="button"
              onClick={() => onToggle(messageId, emoji)}
              className={`w-6 h-6 flex items-center justify-center rounded-full text-sm transition-all duration-75 hover:scale-110 hover:bg-white/10 ${reacted ? 'bg-accent/20' : ''}`}
            >
              {emoji}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function renderBody(text: string): (string | JSX.Element)[] {
  const urlRegex = /(https?:\/\/[^\s<>'")\]]+)/g
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const url = match[1]
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2 decoration-1 opacity-80 hover:opacity-100 transition-opacity break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url.length > 50 ? url.slice(0, 48) + '…' : url}
      </a>
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  group: GroupChat
  members: GroupMember[]
  messages: GroupMessage[]
  reactions: GroupReactionsMap
  friends: FriendProfile[]
  loading: boolean
  sending: boolean
  sendError: string | null
  myId: string
  /** Known from the list preview — avoids flash on load when members[] is still empty */
  initialMemberCount?: number
  initialOtherMember?: { username: string | null; avatar_url: string | null } | null
  onBack: () => void
  onMarkRead?: () => void
  onOpenProfile?: (userId: string) => void
  sendMessage: (body: string) => Promise<void>
  toggleReaction: (messageId: string, reaction: string) => Promise<void>
  addMember: (userId: string) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  renameGroup: (name: string) => Promise<string | null>
  deleteGroup: () => Promise<void>
  leaveGroup: () => Promise<void>
}

// ── Main component ────────────────────────────────────────────────────────────

export function GroupChatThread({
  group, members, messages, reactions, friends, loading, sending, sendError, myId,
  initialMemberCount, initialOtherMember,
  onBack, onMarkRead, onOpenProfile, sendMessage, toggleReaction, addMember, removeMember, renameGroup, deleteGroup, leaveGroup,
}: Props) {
  const { user } = useAuthStore()
  const myUsername = user?.user_metadata?.username ?? ''
  const { typingUsers, broadcastTyping } = useGroupTyping(group.id, myId, myUsername)

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null)
  const [contextMenuMsg, setContextMenuMsg] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isNearBottom = useRef(true)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])

  // Kick context menu (owner only)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; senderId: string; senderName: string; msgBody: string } | null>(null)

  useEffect(() => {
    if (!ctxMenu && !contextMenuMsg) return
    const handler = () => { setCtxMenu(null); setContextMenuMsg(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu, contextMenuMsg])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useLayoutEffect(() => {
    if (isNearBottom.current) scrollToBottom()
    if (messages.length > 0) onMarkRead?.()
  }, [messages, scrollToBottom]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }, [])

  const handleSend = useCallback(async () => {
    const body = input.trim()
    if (!body || sending) return
    if (body === '/roll') {
      setInput('')
      const value = Math.floor(Math.random() * 101)
      playClickSound()
      await sendMessage(`${ROLL_PREFIX}${value}]`)
      return
    }
    playClickSound()
    setInput('')
    await sendMessage(body)
  }, [input, sending, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.min(el.scrollHeight, 120)
    el.style.height = `${Math.max(h, 40)}px`
    el.style.overflowY = h >= 120 ? 'auto' : 'hidden'
  }, [input])

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopyToast(false), 1500)
    })
  }, [])

  const handleImageFile = useCallback(async (file: File) => {
    if (!supabase || !user?.id) return
    setUploadingImage(true)
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('chat-images').upload(path, compressed, { contentType: compressed.type })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      await sendMessage(`${IMAGE_PREFIX}${publicUrl}`)
    }
    setUploadingImage(false)
  }, [user?.id, sendMessage])

  const isOwner = group.owner_id === myId
  const memberMap = Object.fromEntries(members.map((m) => [m.user_id, m]))

  // 1-on-1 group: 2 members → render like a DM chat
  // Use initialMemberCount from the list preview to avoid flicker while members[] loads
  const resolvedMemberCount = members.length > 0 ? members.length : (initialMemberCount ?? 0)
  const isOneOnOne = resolvedMemberCount === 2
  const otherMemberFromList = members.length === 0 ? initialOtherMember : undefined
  const otherMember = isOneOnOne
    ? (members.find((m) => m.user_id !== myId) ?? (otherMemberFromList ? { ...otherMemberFromList, user_id: '', joined_at: '' } : undefined))
    : undefined

  const isFirst = (idx: number) => idx === 0 || messages[idx].sender_id !== messages[idx - 1].sender_id
  const isLast  = (idx: number) => idx === messages.length - 1 || messages[idx].sender_id !== messages[idx + 1].sender_id
  const showTimestamp = (idx: number) => {
    if (isLast(idx)) return true
    const cur = new Date(messages[idx].created_at).getTime()
    const next = new Date(messages[idx + 1].created_at).getTime()
    return next - cur > 120_000
  }

  if (showSettings) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <GroupChatSettings
          group={group}
          members={members}
          friends={friends}
          myId={myId}
          isOwner={isOwner}
          onBack={() => setShowSettings(false)}
          onAddMember={addMember}
          onKick={removeMember}
          onLeave={async () => { await leaveGroup(); onBack() }}
          onDelete={async () => { await deleteGroup(); onBack() }}
          onRename={renameGroup}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AnimatePresence>
        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </AnimatePresence>
      <CopyToast visible={copyToast} />

      {/* Header */}
      <div className="relative flex items-center justify-center shrink-0 py-2.5 mb-1">
        <div className="absolute left-0">
          <BackButton onClick={onBack} />
        </div>
        {isOneOnOne && otherMember ? (
          /* 1-on-1: DM-style header */
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <AvatarWithFrame
              avatar={otherMember.avatar_url ?? otherMember.username?.[0]?.toUpperCase() ?? '?'}
              frameId={('equipped_frame' in otherMember ? otherMember.equipped_frame : null) ?? null}
              sizeClass="w-7 h-7"
              textClass="text-micro"
              ringInsetClass="-inset-[1px]"
              ringOpacity={0.7}
            />
            <div className="text-left min-w-0">
              <p className="text-sm text-white font-medium leading-none">{otherMember.username ?? 'Friend'}</p>
              <p className="text-micro mt-0.5 truncate max-w-[160px]">
                {typingUsers.length > 0
                  ? <span className="text-accent/70">{typingLabel(typingUsers)}</span>
                  : <span className="text-gray-500">{group.name}</span>
                }
              </p>
            </div>
          </button>
        ) : (
          /* Multi-person group header */
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium leading-none">{group.name}</p>
              <p className="text-micro mt-0.5">
                {typingUsers.length > 0
                  ? <span className="text-accent/70">{typingLabel(typingUsers)}</span>
                  : <span className="text-gray-500">{members.length} members</span>
                }
              </p>
            </div>
          </button>
        )}
        {!isOneOnOne && (
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="absolute right-2 p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-0.5 mb-2 min-h-0 select-text"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        {loading && (
          <div className="space-y-3 py-2">
            <div className="flex justify-start gap-1.5">
              <div className="w-7 h-7 rounded-full bg-white/5 shrink-0" />
              <div className="h-12 w-40 rounded-xl bg-white/5" />
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-32 rounded-xl bg-accent/10" />
            </div>
            <div className="flex justify-start gap-1.5">
              <div className="w-7 h-7 rounded-full bg-white/5 shrink-0" />
              <div className="h-14 w-36 rounded-xl bg-white/5" />
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const isMe = msg.sender_id === myId
            const first = isFirst(i)
            const last  = isLast(i)
            const showTime = showTimestamp(i)
            const isRoll  = isChatRoll(msg.body)
            const isImg   = isChatImage(msg.body)
            const imgUrl  = isImg ? chatImageUrl(msg.body) : ''
            const member = memberMap[msg.sender_id]
            const senderName = member?.username ?? msg.sender_username ?? 'Unknown'
            const isHovered = hoveredMsg === msg.id

            if (isRoll) {
              return (
                <motion.div key={msg.id} {...MOTION_VARIANTS.fadeIn}>
                  <RollBubble value={chatRollValue(msg.body)} username={senderName} />
                </motion.div>
              )
            }

            const radius = isMe
              ? `${first ? '18px' : '6px'} 18px 18px ${last ? '6px' : '6px'}`
              : `18px ${first ? '18px' : '6px'} ${last ? '6px' : '6px'} 18px`

            const msgReactions = reactions[msg.id] ?? {}
            const activeReactions = REACTIONS.filter((r) => (msgReactions[r]?.length ?? 0) > 0)

            return (
              <motion.div
                key={msg.id}
                {...MOTION_VARIANTS.fadeIn}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${first && i > 0 ? 'mt-2' : ''}`}
                onMouseEnter={() => setHoveredMsg(msg.id)}
                onMouseLeave={() => setHoveredMsg(null)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenuMsg(msg.id) }}
              >
                {/* Sender name — only in multi-person groups */}
                {!isMe && first && !isOneOnOne && (
                  <button
                    type="button"
                    onClick={() => { onOpenProfile?.(msg.sender_id); playClickSound() }}
                    className="text-micro text-gray-500 font-mono ml-9 mb-0.5 hover:text-gray-300 transition-colors"
                  >
                    {senderName}
                  </button>
                )}

                <div className={`flex items-end gap-1 ${isMe ? 'justify-end pl-10' : 'justify-start pr-10'} w-full`}>
                  {/* Avatar — only in multi-person groups */}
                  {!isMe && !isOneOnOne && (
                    <div className="w-7 shrink-0 self-end">
                      {last && (
                        <button
                          type="button"
                          onClick={() => { onOpenProfile?.(msg.sender_id); playClickSound() }}
                          className="block rounded-full"
                        >
                          <AvatarWithFrame
                            avatar={member?.avatar_url ?? senderName[0]?.toUpperCase() ?? '?'}
                            frameId={member?.equipped_frame ?? null}
                            sizeClass="w-7 h-7"
                            textClass="text-micro"
                            ringInsetClass="-inset-[1px]"
                            ringOpacity={0.7}
                          />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Hover copy button (others) */}
                  {!isMe && !isImg && (
                    <div className={`flex gap-0.5 shrink-0 transition-opacity duration-75 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                      <button type="button" onClick={() => handleCopy(msg.body)}
                        className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors" title="Copy">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Bubble */}
                  {isImg ? (
                    <div
                      className="max-w-[220px] relative cursor-zoom-in"
                      style={{ borderRadius: radius, overflow: 'hidden' }}
                      onClick={() => setLightboxUrl(imgUrl)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (isOwner && !isMe) setCtxMenu({ x: e.clientX, y: e.clientY, senderId: msg.sender_id, senderName, msgBody: msg.body })
                      }}
                    >
                      <img
                        src={imgUrl} alt="image"
                        className="block w-full h-auto hover:brightness-90 transition-[filter] duration-100"
                        style={{ maxHeight: 260 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      {showTime && (
                        <div className={`absolute bottom-1 ${isMe ? 'right-2' : 'left-2'} flex items-center gap-1 px-1 py-0.5 rounded bg-black/50`}>
                          <span className="text-micro text-white/70">{formatTime(msg.created_at)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`relative ${isImg ? '' : 'max-w-[75%]'}`}>
                      <div
                        onContextMenu={(e) => {
                          e.preventDefault()
                          if (isOwner && !isMe) setCtxMenu({ x: e.clientX, y: e.clientY, senderId: msg.sender_id, senderName, msgBody: msg.body })
                          setContextMenuMsg(msg.id)
                        }}
                        className={`px-3.5 py-2 text-body leading-relaxed break-words transition-colors duration-75 cursor-context-menu ${
                          isMe
                            ? 'bg-accent/12 text-white border border-accent/20'
                            : 'bg-white/[0.06] text-gray-100 border border-white/[0.06]'
                        }`}
                        style={{ borderRadius: radius }}
                      >
                        {renderBody(msg.body)}
                        {showTime && (
                          <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <span className={`text-micro ${isMe ? 'text-accent/40' : 'text-gray-500/60'}`}>
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        )}
                      </div>
                      <ReactionPicker
                        messageId={msg.id}
                        isMe={isMe}
                        visible={contextMenuMsg === msg.id}
                        myUserId={myId}
                        reactions={reactions}
                        onToggle={toggleReaction}
                      />
                    </div>
                  )}

                  {/* Hover copy button (mine) */}
                  {isMe && !isImg && (
                    <div className={`flex gap-0.5 shrink-0 transition-opacity duration-75 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                      <button type="button" onClick={() => handleCopy(msg.body)}
                        className="p-1 rounded-md hover:bg-white/[0.08] text-gray-500 hover:text-gray-300 transition-colors" title="Copy">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Reaction pills */}
                {activeReactions.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'pr-1 justify-end' : 'pl-8 justify-start'}`}>
                    {activeReactions.map((emoji) => {
                      const count = msgReactions[emoji].length
                      const reacted = msgReactions[emoji].includes(myId)
                      return (
                        <button
                          key={emoji} type="button"
                          onClick={() => toggleReaction(msg.id, emoji)}
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
              </motion.div>
            )
          })}
        </AnimatePresence>

        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              {isOneOnOne ? <MessageCircle className="w-7 h-7 text-white/20" /> : <Users className="w-7 h-7 text-white/20" />}
            </div>
            <p className="text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-500">{isOneOnOne ? 'Say hi to start the conversation' : 'Say hi to the group!'}</p>
          </div>
        )}
      </div>

      {/* Input — DM style */}
      <div className="shrink-0 px-2 pb-1">
        {sendError && <p className="text-micro text-red-400 mb-1 px-2">{sendError}</p>}

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

          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); broadcastTyping() }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData.items)
              const imgItem = items.find((item) => item.type.startsWith('image/'))
              if (imgItem) {
                e.preventDefault()
                const file = imgItem.getAsFile()
                if (file) handleImageFile(file)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={isOneOnOne && otherMember ? `Message ${otherMember.username ?? group.name}…` : `Message ${group.name}…`}
            rows={1}
            className="flex-1 resize-none min-h-[40px] rounded bg-surface-0/80 border border-white/[0.06] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent/30 transition-colors"
          />

          {/* Send button */}
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
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 rounded-card bg-surface-1 border border-white/[0.08] shadow-2xl overflow-hidden"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { handleCopy(ctxMenu.msgBody); setCtxMenu(null) }}
            className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors w-full text-left"
          >
            <Copy className="w-3 h-3" />
            Copy message
          </button>
          {isOwner && ctxMenu.senderId !== myId && (
            <button
              type="button"
              onClick={async () => { setCtxMenu(null); await removeMember(ctxMenu.senderId) }}
              className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-colors w-full text-left"
            >
              <span>🚫</span>
              Kick {ctxMenu.senderName}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
