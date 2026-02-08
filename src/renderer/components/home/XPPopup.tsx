import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'

export function XPPopup() {
    const xpPopups = useSessionStore((s) => s.xpPopups)

    return (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-20 pointer-events-none z-40">
            <AnimatePresence>
                {xpPopups.map((popup, index) => (
                    <motion.div
                        key={popup.id}
                        initial={{ opacity: 0, y: 0, scale: 0.8 }}
                        animate={{ opacity: 1, y: -40 - index * 24, scale: 1 }}
                        exit={{ opacity: 0, y: -60 - index * 24, scale: 0.9 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
                    >
                        <span className="text-cyber-neon font-mono font-bold text-sm drop-shadow-[0_0_8px_rgba(0,255,136,0.6)]">
                            +{popup.amount} XP
                        </span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
