import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TabId } from '../App'

/** Tabs that are progressively disclosed for new users. Existing users see all. */
export const ADVANCED_TABS: TabId[] = ['craft', 'farm', 'cooking']

interface NavCustomizationState {
  pinnedTabs: TabId[]
  /** Tabs hidden in the More popup until the user unlocks them (new users only). Empty for existing users. */
  lockedTabs: TabId[]
  setPinnedTabs: (tabs: TabId[]) => void
  setLockedTabs: (tabs: TabId[]) => void
  unlockTab: (tab: TabId) => void
  unlockAllAdvanced: () => void
}

export const DEFAULT_PINNED: TabId[] = ['home', 'skills', 'friends', 'arena']

export const useNavCustomizationStore = create<NavCustomizationState>()(
  persist(
    (set) => ({
      pinnedTabs: DEFAULT_PINNED,
      lockedTabs: [],
      setPinnedTabs: (pinnedTabs) => set({ pinnedTabs }),
      setLockedTabs: (lockedTabs) => set({ lockedTabs }),
      unlockTab: (tab) => set((s) => ({ lockedTabs: s.lockedTabs.filter((t) => t !== tab) })),
      unlockAllAdvanced: () => set((s) => ({ lockedTabs: s.lockedTabs.filter((t) => !ADVANCED_TABS.includes(t)) })),
    }),
    { name: 'grindly_nav_customization' }
  )
)
