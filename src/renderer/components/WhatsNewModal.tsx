import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getLatestPatch, getAppVersion, CHANGE_TYPE_META, type PatchNote } from '../lib/changelog'
import { useNotificationStore } from '../stores/notificationStore'
import { playClickSound } from '../lib/sounds'

const SEEN_KEY = 'grindly_last_seen_version'

function pushPatchNotification(patch: PatchNote) {
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

export function useWhatsNew() {
  const [showModal, setShowModal] = useState(false)
  const [patch, setPatch] = useState<PatchNote | null>(null)

  useEffect(() => {
    const current = getAppVersion()
    if (current === '0.0.0') return // dev mode, skip
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen === current) return

    const latest = getLatestPatch()
    if (latest.version === current || !seen) {
      // First install or matching version — show modal
      setPatch(latest)
      if (seen) {
        // Not first install — show modal + notification
        setShowModal(true)
        pushPatchNotification(latest)
      }
      localStorage.setItem(SEEN_KEY, current)
    } else {
      // Version mismatch but no matching changelog entry — just mark seen
      localStorage.setItem(SEEN_KEY, current)
    }
  }, [])

  const showRemotePatch = (p: PatchNote) => {
    setPatch(p)
    setShowModal(true)
  }

  return { showModal, patch, closeModal: () => setShowModal(false), showRemotePatch }
}

/** Standalone trigger — call to show patch notes on demand (e.g. from Settings). */
export function showPatchNotes(setPatch: (p: PatchNote) => void, setShow: (v: boolean) => void) {
  setPatch(getLatestPatch())
  setShow(true)
}

export function WhatsNewModal({ patch, open, onClose }: { patch: PatchNote | null; open: boolean; onClose: () => void }) {
  if (!patch) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[200] bg-black/70"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          >
            <div
              className="pointer-events-auto w-full max-w-[340px] rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'rgba(16,16,28,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🎉</span>
                  <h2 className="text-[16px] font-bold text-white">What's New</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md"
                    style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    v{patch.version}
                  </span>
                  <span className="text-[11px] text-gray-400">{patch.title}</span>
                  <span className="text-[10px] text-gray-600 ml-auto font-mono">{patch.date}</span>
                </div>
              </div>

              {/* Changes list */}
              <div className="px-5 pb-2 max-h-[45vh] overflow-y-auto">
                <div className="space-y-1.5">
                  {patch.items.map((item, i) => {
                    const meta = CHANGE_TYPE_META[item.type]
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + i * 0.03, duration: 0.2 }}
                        className="flex items-start gap-2"
                      >
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 shrink-0"
                          style={{ color: meta.color, background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-gray-300 leading-snug">{item.text}</span>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { playClickSound(); onClose() }}
                  className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    boxShadow: '0 4px 16px rgba(34,197,94,0.2)',
                  }}
                >
                  Let's go!
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
