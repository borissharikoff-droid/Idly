import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { triggerEscape } from '../lib/escapeStack'
import type { TabId } from '../App'

// Fixed number→tab mapping shown as hints in BottomNav
export const TAB_SHORTCUTS: Partial<Record<TabId, string>> = {
  home:        '1',
  skills:      '2',
  friends:     '3',
  inventory:   '4',
  marketplace: '5',
  arena:       '6',
  farm:        '7',
  craft:       '8',
  cooking:     '9',
}

const SHORTCUT_TO_TAB: Record<string, TabId> = Object.fromEntries(
  Object.entries(TAB_SHORTCUTS).map(([tab, key]) => [key, tab as TabId]),
)

interface KeyboardShortcutOptions {
  onEscapeToHome?: () => void
  onTabChange?: (tab: TabId) => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}) {
  const { status, start, stop, pause, resume } = useSessionStore()
  const { onEscapeToHome, onTabChange } = options

  useEffect(() => {
    const enabled = localStorage.getItem('grindly_shortcuts_enabled') !== 'false'
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Don't trigger in input fields
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'Escape') {
        if (!triggerEscape()) onEscapeToHome?.()
        return
      }

      // Number keys 1-9 — switch tabs (no modifiers)
      if (!e.ctrlKey && !e.altKey && !e.metaKey && SHORTCUT_TO_TAB[e.key]) {
        onTabChange?.(SHORTCUT_TO_TAB[e.key])
        return
      }

      // Ctrl+S — Start / Stop session
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (status === 'idle') {
          start()
        } else {
          stop()
        }
      }

      // Ctrl+P — Pause / Resume
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (status === 'running') {
          pause()
        } else if (status === 'paused') {
          resume()
        }
      }
    }

    // capture:true so Escape fires even when focus is inside a modal/dialog
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [status, start, stop, pause, resume, onEscapeToHome, onTabChange])
}
