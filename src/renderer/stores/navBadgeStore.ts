import { create } from 'zustand'

interface NavBadgeStore {
  /** Incoming friend requests (not yet accepted) */
  incomingRequestsCount: number
  /** Unread DM count */
  unreadMessagesCount: number
  /** Unclaimed loot in profile */
  unclaimedLootCount: number
  setIncomingRequestsCount: (n: number) => void
  setUnreadMessagesCount: (n: number) => void
  addUnreadMessages: (n: number) => void
  clearUnreadMessages: () => void
  setUnclaimedLootCount: (n: number) => void
}

export const useNavBadgeStore = create<NavBadgeStore>((set) => ({
  incomingRequestsCount: 0,
  unreadMessagesCount: 0,
  unclaimedLootCount: 0,
  setIncomingRequestsCount: (n) => set({ incomingRequestsCount: n }),
  setUnreadMessagesCount: (n) => set({ unreadMessagesCount: n }),
  addUnreadMessages: (n) => set((s) => ({ unreadMessagesCount: s.unreadMessagesCount + n })),
  clearUnreadMessages: () => set({ unreadMessagesCount: 0 }),
  setUnclaimedLootCount: (n) => set({ unclaimedLootCount: n }),
}))
