import { create } from 'zustand'

export type NotificationType = 'friend_levelup' | 'update' | 'progression' | 'arena_result' | 'marketplace_sale' | 'poll' | 'patch_notes'

export interface Notification {
  id: string
  type: NotificationType
  icon: string
  title: string
  body: string
  timestamp: number
  read: boolean
  url?: string
  arenaResult?: {
    victory: boolean
    gold: number
    bossName: string
    chest?: { type: string; name: string; icon: string; image?: string } | null
    materialDrop?: { id: string; name: string; icon: string; qty: number } | null
    warriorXP?: number
    dungeonGold?: number
  }
  recovery?: {
    sessionId: string
    startTime: number
    elapsedSeconds: number
    sessionSkillXP?: Record<string, number>
    sessionActivities?: unknown[]
  }
  chestReward?: {
    rewardId: string
    chestType: string
    chestImage?: string
    chestRarity?: string
  }
  poll?: {
    pollId: string
    options: Array<{ id: string; label: string }>
  }
  patchVersion?: string
  friendLevelUp?: {
    friendId: string
    friendName: string
    newLevel: number
  }
}

interface NotificationStore {
  items: Notification[]
  unreadCount: number
  push: (n: Omit<Notification, 'id' | 'timestamp' | 'read'> & { timestamp?: number }) => string
  dismiss: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

const MAX = 50
const ALLOWED_TYPES: NotificationType[] = ['update', 'friend_levelup', 'progression', 'arena_result', 'marketplace_sale', 'poll', 'patch_notes']

export const useNotificationStore = create<NotificationStore>((set) => ({
  items: [],
  unreadCount: 0,
  push(payload) {
    if (!ALLOWED_TYPES.includes(payload.type)) return ''
    const id = crypto.randomUUID()
    const { timestamp: tsOverride, ...rest } = payload
    const n: Notification = { ...rest, id, timestamp: tsOverride ?? Date.now(), read: false }
    set((s) => {
      // Deduplicate: only keep the latest recovery notification
      let base = s.items
      if (payload.recovery) {
        base = base.filter((i) => !i.recovery)
      }
      const items = [n, ...base].slice(0, MAX)
      return { items, unreadCount: items.filter((i) => !i.read).length }
    })
    return id
  },
  dismiss(id) {
    set((s) => {
      const items = s.items.filter((i) => i.id !== id)
      return { items, unreadCount: items.filter((i) => !i.read).length }
    })
  },
  markAllRead() {
    set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })), unreadCount: 0 }))
  },
  clear() {
    set({ items: [], unreadCount: 0 })
  },
}))
