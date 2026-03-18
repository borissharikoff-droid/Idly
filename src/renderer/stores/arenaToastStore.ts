import { create } from 'zustand'
import { useNotificationStore } from './notificationStore'

export interface ArenaToast {
  id: string
  victory: boolean
  bossName: string
  gold: number
  notificationId: string
  createdAt: number
}

const TOAST_TTL_MS = 5000
const MAX_TOASTS = 2

interface ArenaToastStore {
  toasts: ArenaToast[]
  push: (payload: { victory: boolean; bossName: string; gold: number; notificationId: string }) => void
  dismiss: (id: string) => void
  claimAndDismiss: (id: string) => void
}

export const useArenaToastStore = create<ArenaToastStore>((set, get) => ({
  toasts: [],

  push(payload) {
    const id = crypto.randomUUID()
    const toast: ArenaToast = {
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

  claimAndDismiss(id) {
    const toast = get().toasts.find((t) => t.id === id)
    if (!toast) return
    useNotificationStore.getState().dismiss(toast.notificationId)
    get().dismiss(id)
  },
}))
