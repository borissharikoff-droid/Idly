import { create } from 'zustand'
import type { TabId } from '../App'

interface NavigationStore {
  /** Set by App.tsx — components can call this to navigate globally */
  navigateTo: ((tab: TabId) => void) | null
  setNavigateTo: (fn: (tab: TabId) => void) => void
  currentTab: TabId
  setCurrentTab: (tab: TabId) => void
  profileInitialTab: string | null
  setProfileInitialTab: (tab: string | null) => void
  /** Navigate to Friends tab and auto-open this user's profile */
  pendingFriendUserId: string | null
  setPendingFriendUserId: (id: string | null) => void
  /** Tab to return to when Back is pressed after a cross-tab navigation */
  returnTab: TabId | null
  setReturnTab: (tab: TabId | null) => void
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  navigateTo: null,
  setNavigateTo: (fn) => set({ navigateTo: fn }),
  currentTab: 'home',
  setCurrentTab: (tab) => set({ currentTab: tab }),
  profileInitialTab: null,
  setProfileInitialTab: (tab) => set({ profileInitialTab: tab }),
  pendingFriendUserId: null,
  setPendingFriendUserId: (id) => set({ pendingFriendUserId: id }),
  returnTab: null,
  setReturnTab: (tab) => set({ returnTab: tab }),
}))
