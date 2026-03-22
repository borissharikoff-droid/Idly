import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TabId } from '../App'

interface NavCustomizationState {
  pinnedTabs: TabId[]
  setPinnedTabs: (tabs: TabId[]) => void
}

export const DEFAULT_PINNED: TabId[] = ['home', 'skills', 'friends', 'arena']

export const useNavCustomizationStore = create<NavCustomizationState>()(
  persist(
    (set) => ({
      pinnedTabs: DEFAULT_PINNED,
      setPinnedTabs: (pinnedTabs) => set({ pinnedTabs }),
    }),
    { name: 'grindly_nav_customization' }
  )
)
