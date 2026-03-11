import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAchievementStatsStore } from './achievementStatsStore'

interface GoldState {
  gold: number
  setGold: (amount: number) => void
  addGold: (amount: number) => void
  syncFromSupabase: (userId: string) => Promise<void>
  syncToSupabase: (userId: string) => Promise<void>
}

export const useGoldStore = create<GoldState>((set, get) => ({
  gold: 0,

  setGold(amount: number) {
    set({ gold: Math.max(0, amount) })
  },

  addGold(amount: number) {
    set((s) => {
      const newGold = Math.max(0, s.gold + amount)
      if (newGold > 0) useAchievementStatsStore.getState().updateMaxGold(newGold)
      return { gold: newGold }
    })
  },

  async syncFromSupabase(userId: string) {
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single()
    if (data && typeof (data as { gold?: number }).gold === 'number') {
      set({ gold: Math.max(0, (data as { gold: number }).gold) })
    }
  },

  async syncToSupabase(userId: string) {
    if (!supabase) return
    const { gold } = get()
    const { error } = await supabase
      .from('profiles')
      .update({ gold: Math.max(0, gold), updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) {
      console.warn('[goldStore] syncToSupabase failed:', error.message)
    }
  },
}))
