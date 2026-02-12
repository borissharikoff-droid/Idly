import { create } from 'zustand'

export type FriendToastType = 'online' | 'message'

export interface FriendToast {
  id: string
  type: FriendToastType
  friendName: string
  /** For message: preview text */
  messagePreview?: string
  createdAt: number
}

const TOAST_TTL_MS = 4500
const MAX_TOASTS = 3
const ONLINE_DEDUPE_WINDOW_MS = 12_000
const lastOnlineShownAt = new Map<string, number>()

interface FriendToastStore {
  toasts: FriendToast[]
  push: (payload: { type: FriendToastType; friendName: string; messagePreview?: string }) => void
  dismiss: (id: string) => void
  dismissAll: () => void
}

export const useFriendToastStore = create<FriendToastStore>((set, get) => ({
  toasts: [],

  push(payload) {
    if (payload.type === 'online') {
      const key = payload.friendName.trim().toLowerCase()
      const now = Date.now()
      const last = lastOnlineShownAt.get(key) ?? 0
      if (now - last < ONLINE_DEDUPE_WINDOW_MS) return
      lastOnlineShownAt.set(key, now)
    }
    const id = crypto.randomUUID()
    const toast: FriendToast = {
      id,
      ...payload,
      createdAt: Date.now(),
    }
    set((s) => ({
      toasts: [...s.toasts, toast].slice(-MAX_TOASTS),
    }))
    setTimeout(() => {
      get().dismiss(id)
    }, TOAST_TTL_MS)
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  dismissAll() {
    set({ toasts: [] })
  },
}))
