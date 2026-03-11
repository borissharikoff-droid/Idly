import { create } from 'zustand'

export type ToastKind =
  | { kind: 'arena_boss'; victory: boolean; bossName: string; gold: number; notificationId: string; chest?: { type: string; name: string; icon: string; image?: string } | null; materialDrop?: { id: string; name: string; icon: string; qty: number } | null; warriorXP?: number; dungeonGold?: number }
  | { kind: 'mob_kill'; mobName: string; gold: number; xp: number; material: string | null }
  | { kind: 'craft_complete'; itemName: string; itemIcon: string; qty: number; xp: number }
  | { kind: 'cook_complete'; itemName: string; itemIcon: string; qty: number; xp: number }
  | { kind: 'friend_online'; friendName: string }
  | { kind: 'friend_message'; friendName: string; messagePreview?: string }
  | { kind: 'marketplace_listed'; itemName: string; qty: number; priceGold: number }
  | { kind: 'marketplace_sold'; itemName: string; qty: number; totalGold: number }
  | { kind: 'crop_rot'; count: number }

export interface Toast {
  id: string
  createdAt: number
  ttlMs: number
  data: ToastKind
  onExpire?: () => void
}

const TTL: Record<ToastKind['kind'], number> = {
  arena_boss:      6000,
  mob_kill:        3000,
  craft_complete:  3500,
  cook_complete:   3500,
  friend_online:   4500,
  friend_message:      4500,
  marketplace_listed:  3500,
  marketplace_sold:    5000,
  crop_rot:            4000,
}

const MAX_TOASTS = 4

// Dedup window for friend online toasts (don't show same friend twice within 12s)
const lastOnlineAt = new Map<string, number>()
const ONLINE_DEDUPE_MS = 12_000

interface ToastStore {
  toasts: Toast[]
  push: (data: ToastKind, onExpire?: () => void) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push(data, onExpire) {
    // Deduplicate friend online toasts
    if (data.kind === 'friend_online') {
      const key = data.friendName.trim().toLowerCase()
      const now = Date.now()
      if ((lastOnlineAt.get(key) ?? 0) > now - ONLINE_DEDUPE_MS) return ''
      lastOnlineAt.set(key, now)
    }

    const id = crypto.randomUUID()
    const ttlMs = TTL[data.kind]
    const toast: Toast = { id, createdAt: Date.now(), ttlMs, data, onExpire }

    set((s) => {
      const next = [...s.toasts, toast]
      const dropped = next.slice(0, Math.max(0, next.length - MAX_TOASTS))
      for (const t of dropped) { if (t.onExpire) t.onExpire() }
      return { toasts: next.slice(-MAX_TOASTS) }
    })

    setTimeout(() => {
      get().dismiss(id)
    }, ttlMs)

    return id
  },

  dismiss(id) {
    const toast = get().toasts.find((t) => t.id === id)
    if (toast?.onExpire) toast.onExpire()
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  dismissAll() {
    const { toasts } = get()
    for (const t of toasts) { if (t.onExpire) t.onExpire() }
    set({ toasts: [] })
  },
}))
