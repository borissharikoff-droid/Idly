import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSessionStore } from '../../stores/sessionStore'
import { getSoundSettings, setSoundVolume, setSoundMuted, playClickSound } from '../../lib/sounds'

export function SettingsPage() {
  const { user, signOut } = useAuthStore()

  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Preferences
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [soundMuted, setSoundMutedState] = useState(false)
  const [soundVolume, setSoundVolumeState] = useState(0.5)
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [afkEnabled, setAfkEnabled] = useState(true)
  const [afkTimeout, setAfkTimeout] = useState(3) // minutes

  // Notification toggles (smart notifications)
  const [notifGrindReminder, setNotifGrindReminder] = useState(true)
  const [notifStreakWarning, setNotifStreakWarning] = useState(true)
  const [notifDistraction, setNotifDistraction] = useState(true)
  const [notifPraise, setNotifPraise] = useState(true)

  // Load local preferences
  useEffect(() => {
    const sound = getSoundSettings()
    setSoundMutedState(sound.muted)
    setSoundVolumeState(sound.volume)
    setShortcutsEnabled(localStorage.getItem('grinder_shortcuts_enabled') !== 'false')
    setNotificationsEnabled(localStorage.getItem('grinder_notifications_enabled') !== 'false')
    setAfkEnabled(localStorage.getItem('grinder_afk_enabled') !== 'false')
    const savedAfk = localStorage.getItem('grinder_afk_timeout_min')
    if (savedAfk) setAfkTimeout(parseInt(savedAfk, 10) || 3)

    // Smart notification toggles
    setNotifGrindReminder(localStorage.getItem('grinder_notif_grind_reminder') !== 'false')
    setNotifStreakWarning(localStorage.getItem('grinder_notif_streak_warning') !== 'false')
    setNotifDistraction(localStorage.getItem('grinder_notif_distraction') !== 'false')
    setNotifPraise(localStorage.getItem('grinder_notif_praise') !== 'false')

    // Check auto-launch status
    if (window.electronAPI?.settings?.getAutoLaunch) {
      window.electronAPI.settings.getAutoLaunch().then(setAutoLaunch)
    }
  }, [])

  const handleAutoLaunch = async (enabled: boolean) => {
    setAutoLaunch(enabled)
    if (window.electronAPI?.settings?.setAutoLaunch) {
      window.electronAPI.settings.setAutoLaunch(enabled)
    }
  }

  const handleSoundMuted = (muted: boolean) => {
    setSoundMutedState(muted)
    setSoundMuted(muted)
    if (!muted) playClickSound()
  }

  const handleSoundVolume = (vol: number) => {
    setSoundVolumeState(vol)
    setSoundVolume(vol)
  }

  const handleShortcuts = (enabled: boolean) => {
    setShortcutsEnabled(enabled)
    localStorage.setItem('grinder_shortcuts_enabled', String(enabled))
  }

  const handleNotifications = (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    localStorage.setItem('grinder_notifications_enabled', String(enabled))
    // Sync to DB so main process can read it without executeJavaScript
    window.electronAPI?.db?.setLocalStat('grinder_notifications_enabled', String(enabled))
  }

  const handleAfkEnabled = (enabled: boolean) => {
    setAfkEnabled(enabled)
    localStorage.setItem('grinder_afk_enabled', String(enabled))
    if (!enabled) {
      useSessionStore.getState().resume()
      useSessionStore.setState({ isAfkPaused: false })
    }
  }

  const handleAfkTimeout = (min: number) => {
    setAfkTimeout(min)
    localStorage.setItem('grinder_afk_timeout_min', String(min))
    if (window.electronAPI?.tracker?.setAfkThreshold) {
      window.electronAPI.tracker.setAfkThreshold(min * 60 * 1000)
    }
  }

  const handleNotifToggle = (key: string, setter: (v: boolean) => void) => (enabled: boolean) => {
    setter(enabled)
    localStorage.setItem(key, String(enabled))
    // Sync to DB so main process can read it without executeJavaScript
    window.electronAPI?.db?.setLocalStat(key, String(enabled))
  }

  const handleExport = async (format: 'csv' | 'json') => {
    if (!window.electronAPI?.data?.exportSessions) return
    try {
      const result = await window.electronAPI.data.exportSessions(format)
      if (result) {
        setMessage({ type: 'ok', text: `Exported to ${result}` })
      }
    } catch {
      setMessage({ type: 'err', text: 'Export failed.' })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="p-4 pb-2 space-y-4"
    >
      <h2 className="text-lg font-bold text-white">Settings</h2>

      {/* Sound Settings */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-mono">[ sound ]</p>
        <ToggleRow
          label="Sound effects"
          enabled={!soundMuted}
          onChange={(v) => handleSoundMuted(!v)}
        />
        {!soundMuted && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-14">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={soundVolume}
              onChange={(e) => handleSoundVolume(parseFloat(e.target.value))}
              className="flex-1 accent-cyber-neon h-1"
            />
            <span className="text-xs text-gray-500 w-8 text-right font-mono">
              {Math.round(soundVolume * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-mono">[ preferences ]</p>
        <ToggleRow
          label="Keyboard shortcuts"
          sublabel="Ctrl+S start/stop, Ctrl+P pause"
          enabled={shortcutsEnabled}
          onChange={handleShortcuts}
        />
        <ToggleRow
          label="Desktop notifications"
          sublabel="Achievements & streak milestones"
          enabled={notificationsEnabled}
          onChange={handleNotifications}
        />
        <ToggleRow
          label="Start with Windows"
          sublabel="Launch Grinder on PC boot"
          enabled={autoLaunch}
          onChange={handleAutoLaunch}
        />
      </div>

      {/* AFK Detection */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-mono">[ afk detection ]</p>
        <p className="text-xs text-gray-500">Auto-pause session when no input detected. AFK turns off automatically when you move the mouse or use the keyboard.</p>
        <ToggleRow
          label="Enable AFK pause"
          sublabel="Pause grind when idle"
          enabled={afkEnabled}
          onChange={handleAfkEnabled}
        />
        {afkEnabled && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-20">AFK timeout</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={afkTimeout}
            onChange={(e) => handleAfkTimeout(parseInt(e.target.value, 10))}
            className="flex-1 accent-cyber-neon h-1"
          />
          <span className="text-xs text-gray-500 w-12 text-right font-mono">
            {afkTimeout} min
          </span>
        </div>
        )}
      </div>

      {/* Smart Notifications */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-mono">[ smart notifications ]</p>
        <ToggleRow
          label="Grind reminder"
          sublabel="Nudge if no session today"
          enabled={notifGrindReminder}
          onChange={handleNotifToggle('grinder_notif_grind_reminder', setNotifGrindReminder)}
        />
        <ToggleRow
          label="Streak warning"
          sublabel="Alert when streak is at risk"
          enabled={notifStreakWarning}
          onChange={handleNotifToggle('grinder_notif_streak_warning', setNotifStreakWarning)}
        />
        <ToggleRow
          label="Distraction alert"
          sublabel="Nudge when too much social/games"
          enabled={notifDistraction}
          onChange={handleNotifToggle('grinder_notif_distraction', setNotifDistraction)}
        />
        <ToggleRow
          label="Focus praise"
          sublabel="Praise for sustained focus"
          enabled={notifPraise}
          onChange={handleNotifToggle('grinder_notif_praise', setNotifPraise)}
        />
      </div>

      {/* Data Export */}
      <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-mono">[ data export ]</p>
        <p className="text-xs text-gray-500">Download your grind history. Flex with data.</p>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => handleExport('json')}
            className="flex-1 py-2 rounded-lg bg-discord-darker border border-white/10 text-sm text-white font-medium hover:border-white/20 transition-colors"
          >
            Export JSON
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => handleExport('csv')}
            className="flex-1 py-2 rounded-lg bg-discord-darker border border-white/10 text-sm text-white font-medium hover:border-white/20 transition-colors"
          >
            Export CSV
          </motion.button>
        </div>
        {message && (
          <p className={`text-xs ${message.type === 'ok' ? 'text-cyber-neon' : 'text-discord-red'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Sign Out */}
      {supabase && user && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => signOut()}
          className="w-full py-2.5 rounded-xl bg-discord-red/20 border border-discord-red/30 text-discord-red font-semibold text-sm hover:bg-discord-red/30 transition-colors"
        >
          Sign Out
        </motion.button>
      )}

      <p className="text-center text-xs text-gray-600 pb-2">Grinder v0.1.0</p>
    </motion.div>
  )
}

function ToggleRow({ label, sublabel, enabled, onChange }: {
  label: string
  sublabel?: string
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-white">{label}</p>
        {sublabel && <p className="text-xs text-gray-500">{sublabel}</p>}
      </div>
      <button
        onClick={() => { onChange(!enabled); playClickSound() }}
        className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${
          enabled ? 'bg-cyber-neon/40' : 'bg-discord-darker border border-white/10'
        }`}
      >
        <motion.div
          animate={{ x: enabled ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`absolute top-1 w-4 h-4 rounded-full shadow-sm ${
            enabled ? 'bg-cyber-neon' : 'bg-gray-500'
          }`}
        />
      </button>
    </div>
  )
}
