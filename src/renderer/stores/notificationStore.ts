import { create } from 'zustand'

export type NotificationType = 'friend_online' | 'friend_levelup' | 'message' | 'update' | 'achievement' | 'system'

export interface Notification {
  id: string
  type: NotificationType
  icon: string
  title: string
  body: string
  timestamp: number
  read: boolean
  url?: string
}

interface NotificationStore {
  items: Notification[]
  unreadCount: number
  push: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markAllRead: () => void
  clear: () => void
}

const MAX = 50

export const useNotificationStore = create<NotificationStore>((set) => ({
  items: [],
  unreadCount: 0,
  push(payload) {
    const n: Notification = { ...payload, id: crypto.randomUUID(), timestamp: Date.now(), read: false }
    set((s) => {
      const items = [n, ...s.items].slice(0, MAX)
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
