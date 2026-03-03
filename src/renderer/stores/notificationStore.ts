import { create } from 'zustand'

export type NotificationType = 'friend_levelup' | 'update' | 'progression' | 'arena_result' | 'marketplace_sale'

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
  }
  recovery?: {
    sessionId: string
    startTime: number
    elapsedSeconds: number
    sessionSkillXP?: Record<string, number>
  }
}

interface NotificationStore {
  items: Notification[]
  unreadCount: number
  push: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => string
  dismiss: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

const MAX = 50
const ALLOWED_TYPES: NotificationType[] = ['update', 'friend_levelup', 'progression', 'arena_result', 'marketplace_sale']

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  items: [],
  unreadCount: 0,
  push(payload) {
    if (!ALLOWED_TYPES.includes(payload.type)) return ''
    const id = crypto.randomUUID()
    const n: Notification = { ...payload, id, timestamp: Date.now(), read: false }
    set((s) => {
      const items = [n, ...s.items].slice(0, MAX)
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
