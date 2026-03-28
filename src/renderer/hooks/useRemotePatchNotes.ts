import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificationStore } from '../stores/notificationStore'
import type { PatchNote, ChangeEntry } from '../lib/changelog'
import { getAppVersion } from '../lib/changelog'

const SEEN_KEY = 'grindly_last_seen_remote_patch'

function parsePatch(row: { version: string; title: string; date: string; items: unknown }): PatchNote {
  return {
    version: row.version,
    title: row.title,
    date: row.date,
    items: Array.isArray(row.items) ? (row.items as ChangeEntry[]) : [],
  }
}

/**
 * Fetches patch notes from Supabase and subscribes to new inserts in real-time.
 * Shows the What's New modal immediately when a new patch is published —
 * no app restart required.
 */
export function useRemotePatchNotes(
  showPatch: (patch: PatchNote) => void,
) {
  const showPatchRef = useRef(showPatch)
  useEffect(() => { showPatchRef.current = showPatch })

  useEffect(() => {
    const lastSeen = localStorage.getItem(SEEN_KEY)
    const currentVersion = getAppVersion()

    // Fetch the latest patch note from Supabase
    Promise.resolve(
      supabase
        .from('patch_notes')
        .select('version, title, date, items')
        .order('created_at', { ascending: false })
        .limit(1)
    ).then(({ data }) => {
      if (!data || data.length === 0) return
      const remote = parsePatch(data[0])
      // Don't show if already seen this version, or if it matches the installed version
      // (installed version is handled by the local useWhatsNew hook)
      if (remote.version === lastSeen) return
      if (remote.version === currentVersion) return
      // Show the remote patch notes
      localStorage.setItem(SEEN_KEY, remote.version)
      showPatchRef.current(remote)
      pushNotification(remote)
    }).catch(() => {})

    // Real-time: listen for newly published patch notes
    const channel = supabase
      .channel('grindly-patch-notes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patch_notes' },
        (payload) => {
          const row = payload.new as { version: string; title: string; date: string; items: unknown }
          const patch = parsePatch(row)
          localStorage.setItem(SEEN_KEY, patch.version)
          showPatchRef.current(patch)
          pushNotification(patch)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])
}

function pushNotification(patch: PatchNote) {
  const newCount = patch.items.filter((i) => i.type === 'new').length
  const fixCount = patch.items.filter((i) => i.type === 'fix').length
  const parts: string[] = []
  if (newCount > 0) parts.push(`${newCount} new`)
  if (fixCount > 0) parts.push(`${fixCount} fixes`)
  const body = parts.length > 0 ? parts.join(', ') : `${patch.items.length} changes`

  useNotificationStore.getState().push({
    type: 'patch_notes',
    icon: '📋',
    title: `v${patch.version} — ${patch.title}`,
    body,
    patchVersion: patch.version,
  })
}
