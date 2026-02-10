import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.updater?.onStatus) return
    const unsub = api.updater.onStatus((info) => {
      if (info.status === 'ready') {
        setUpdateReady(true)
        setVersion(info.version || '')
      }
    })
    return unsub
  }, [])

  const handleInstall = () => {
    window.electronAPI?.updater?.install()
  }

  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-between gap-3 px-4 py-2 bg-discord-accent/15 border-b border-discord-accent/30"
        >
          <p className="text-xs text-white">
            Update <span className="font-mono text-discord-accent font-bold">{version}</span> ready
          </p>
          <button
            onClick={handleInstall}
            aria-label="Restart app to install update"
            className="text-[10px] font-bold px-3 py-1 rounded-lg bg-discord-accent text-white hover:bg-discord-accent/80 transition-colors"
          >
            Restart
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
