import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore } from '../stores/notificationStore'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string }
  | { phase: 'ready'; version: string }

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.updater?.onStatus) return
    const unsub = api.updater.onStatus((info) => {
      if (info.status === 'downloading') {
        setDismissed(false)
        setUpdate({ phase: 'downloading', version: info.version || '' })
      } else if (info.status === 'ready') {
        setDismissed(false)
        setUpdate({ phase: 'ready', version: info.version || '' })
        useNotificationStore.getState().push({
          type: 'update',
          icon: '⬇️',
          title: 'Update ready to install',
          body: info.version ? `Version ${info.version} downloaded` : 'A new version is ready',
        })
      }
    })
    return unsub
  }, [])

  const visible = !dismissed && update.phase !== 'idle'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-accent/15 border-b border-accent/30">
            {update.phase === 'downloading' ? (
              <>
                <span className="text-sm animate-spin">⟳</span>
                <p className="flex-1 text-xs text-white/80">
                  Downloading update
                  {update.version && (
                    <> <span className="font-mono text-accent font-bold">{update.version}</span></>
                  )}…
                </p>
              </>
            ) : (
              <>
                <span className="text-sm">⬇️</span>
                <p className="flex-1 text-xs text-white/80">
                  Update{' '}
                  {update.version && (
                    <span className="font-mono text-accent font-bold">{update.version}</span>
                  )}{' '}
                  ready
                </p>
                <button
                  onClick={() => window.electronAPI?.updater?.install?.()}
                  className="shrink-0 px-2.5 py-1 rounded bg-accent text-white text-caption font-semibold hover:bg-accent-hover transition-colors"
                >
                  Restart & Install
                </button>
              </>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 text-white/40 hover:text-white/70 transition-colors text-base leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
