import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthStore {
  user: User | null
  loading: boolean
  init: () => void
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, username?: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,

  init() {
    if (!supabase) {
      set({ loading: false })
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const rememberMe = typeof localStorage !== 'undefined' ? localStorage.getItem('grindly_remember_me') : null
      if (session?.user && rememberMe === 'false') {
        supabase.auth.signOut().then(() => set({ user: null, loading: false }))
      } else {
        set({ user: session?.user ?? null, loading: false })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null })
    })
    // Store for cleanup (best-effort; Electron renderer lives for the full app lifetime)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => subscription.unsubscribe(), { once: true })
    }
  },

  async signIn(email: string, password: string) {
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ?? null }
  },

  async signUp(email: string, password: string, username?: string) {
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    return { error: error ?? null }
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut()
    set({ user: null })
  },
}))
