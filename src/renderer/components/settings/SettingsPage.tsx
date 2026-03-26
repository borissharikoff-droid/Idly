declare const __APP_VERSION__: string
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSoundSettings, setSoundVolume, setSoundMuted, playClickSound } from '../../lib/sounds'
import { getFontScalePreset, setFontScale, FONT_SCALE_PRESETS, type FontScalePreset } from '../../lib/fontScale'
import { MOTION } from '../../lib/motion'
import { PageHeader } from '../shared/PageHeader'
import { Settings as SettingsIcon } from '../../lib/icons'
import { InlineSuccess } from '../shared/InlineSuccess'

// ─── Helpers ───────────────────────────────────────────────
function loadBool(key: string, fallback = true): boolean {
  try { return localStorage.getItem(key) !== 'false' } catch { return fallback }
}

function saveBool(key: string, value: boolean, syncDb = false) {
  localStorage.setItem(key, String(value))
  if (syncDb) window.electronAPI?.db?.setLocalStat(key, String(value))
}

// ─── Main Component ─────────────────────────────────────────
export function SettingsPage() {
  const { user, signOut } = useAuthStore()
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Sound
  const [soundMuted, setSoundMutedState] = useState(false)
  const [soundVolume, setSoundVolumeState] = useState(0.5)

  // General
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [fontScale, setFontScaleState] = useState<FontScalePreset>(() => getFontScalePreset())

  // Notifications — master
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // Notifications — desktop per-type
  const [notifDesktopLevelUp, setNotifDesktopLevelUp] = useState(true)
  const [notifDesktopAchievement, setNotifDesktopAchievement] = useState(true)
  const [notifDesktopProgression, setNotifDesktopProgression] = useState(true)
  const [notifDesktopFriend, setNotifDesktopFriend] = useState(true)

  // Notifications — smart (main process)
  const [notifGrindReminder, setNotifGrindReminder] = useState(true)
  const [notifStreakWarning, setNotifStreakWarning] = useState(true)
  const [notifDistraction, setNotifDistraction] = useState(true)
  const [notifPraise, setNotifPraise] = useState(true)

  // Window behavior
  const [showWindowOnSessionEnd, setShowWindowOnSessionEnd] = useState(true)

  // Accordion — persisted
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('grindly_settings_open_sections')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch { /* ignore */ }
    return new Set(['links', 'general', 'notifications'])
  })
  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('grindly_settings_open_sections', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  // Load all settings
  useEffect(() => {
    const sound = getSoundSettings()
    setSoundMutedState(sound.muted)
    setSoundVolumeState(sound.volume)
    setShortcutsEnabled(loadBool('grindly_shortcuts_enabled'))
    setNotificationsEnabled(loadBool('grindly_notifications_enabled'))
    setShowWindowOnSessionEnd(loadBool('grindly_show_window_on_session_end'))

    // Desktop per-type
    setNotifDesktopLevelUp(loadBool('grindly_notif_desktop_level_up'))
    setNotifDesktopAchievement(loadBool('grindly_notif_desktop_achievement'))
    setNotifDesktopProgression(loadBool('grindly_notif_desktop_progression'))
    setNotifDesktopFriend(loadBool('grindly_notif_desktop_friend'))

    // Smart notifications
    setNotifGrindReminder(loadBool('grindly_notif_grind_reminder'))
    setNotifStreakWarning(loadBool('grindly_notif_streak_warning'))
    setNotifDistraction(loadBool('grindly_notif_distraction'))
    setNotifPraise(loadBool('grindly_notif_praise'))

    // Electron-only settings
    window.electronAPI?.settings?.getAutoLaunch?.().then(setAutoLaunch)
    window.electronAPI?.window?.getAlwaysOnTop?.().then(setAlwaysOnTop)
  }, [])

  // ─── Handlers ─────────────────────────────────────────────
  const handleAutoLaunch = (enabled: boolean) => {
    setAutoLaunch(enabled)
    window.electronAPI?.settings?.setAutoLaunch?.(enabled)
  }

  const handleAlwaysOnTop = (enabled: boolean) => {
    setAlwaysOnTop(enabled)
    window.electronAPI?.window?.setAlwaysOnTop?.(enabled)
  }

  const handleFontScale = (preset: FontScalePreset) => {
    playClickSound()
    setFontScaleState(preset)
    setFontScale(preset)
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

  const handleNotifications = (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    saveBool('grindly_notifications_enabled', enabled, true)
  }

  const makeToggle = (key: string, setter: (v: boolean) => void, syncDb = false) => (enabled: boolean) => {
    setter(enabled)
    saveBool(key, enabled, syncDb)
  }

  const handleExport = async (format: 'csv' | 'json') => {
    if (!window.electronAPI?.data?.exportSessions) return
    try {
      const result = await window.electronAPI.data.exportSessions(format)
      if (result) setMessage({ type: 'ok', text: `Exported to ${result}` })
    } catch {
      setMessage({ type: 'err', text: 'Export failed.' })
    }
  }

  return (
    <motion.div
      initial={MOTION.page.initial}
      animate={MOTION.page.animate}
      exit={MOTION.page.exit}
      className="p-4 pb-2 space-y-3 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 60px)' }}
    >
      <PageHeader title="Settings" icon={<SettingsIcon className="w-4 h-4 text-gray-400" />} />

      {/* ─── LINKS ──────────────────────────────────────────── */}
      <Section id="links" title="Links & Resources" icon="link" open={openSections.has('links')} onToggle={toggleSection}>
        <LinkRow
          icon={<XLogo />}
          label="Follow on X"
          sublabel="Updates, sneak peeks & community"
          url="https://x.com/GrindlyIdle"
        />
        <LinkRow
          icon="📖"
          label="Grindly Wiki"
          sublabel="Items, recipes, arena guides & roadmap"
          url="https://borissharikoff-droid.github.io/Grindly-Wiki/"
        />
        <LinkRow
          icon="🗺️"
          label="Roadmap"
          sublabel="Planned features & development timeline"
          url="https://borissharikoff-droid.github.io/Grindly-Wiki/roadmap.html"
        />
        <LinkRow
          icon="📋"
          label="Patch Notes"
          sublabel="Latest updates & changelogs"
          url="https://borissharikoff-droid.github.io/Grindly-Wiki/patches.html"
        />
      </Section>

      {/* ─── SOUND ──────────────────────────────────────────── */}
      <Section id="sound" title="Sound & Audio" icon="volume" open={openSections.has('sound')} onToggle={toggleSection}>
        <ToggleRow
          label="Sound effects"
          sublabel="UI clicks, session sounds"
          enabled={!soundMuted}
          onChange={(v) => handleSoundMuted(!v)}
        />
        <AnimatePresence initial={false}>
          {!soundMuted && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <SliderRow
                label="Volume"
                value={soundVolume}
                onChange={handleSoundVolume}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {/* ─── GENERAL ────────────────────────────────────────── */}
      <Section id="general" title="General" icon="settings" open={openSections.has('general')} onToggle={toggleSection}>
        <ToggleRow
          label="Start with Windows"
          sublabel="Launch Grindly on PC boot"
          enabled={autoLaunch}
          onChange={handleAutoLaunch}
        />
        <ToggleRow
          label="Keyboard shortcuts"
          sublabel="Ctrl+S start/stop, Ctrl+P pause"
          enabled={shortcutsEnabled}
          onChange={makeToggle('grindly_shortcuts_enabled', setShortcutsEnabled)}
        />
        <ToggleRow
          label="Always on top"
          sublabel="Keep Grindly above other windows"
          enabled={alwaysOnTop}
          onChange={handleAlwaysOnTop}
        />
        <FontScaleRow value={fontScale} onChange={handleFontScale} />
      </Section>

      {/* ─── NOTIFICATIONS ──────────────────────────────────── */}
      <Section id="notifications" title="Notifications" icon="bell" open={openSections.has('notifications')} onToggle={toggleSection}>
        <ToggleRow
          label="Desktop notifications"
          sublabel="System-level toast popups"
          enabled={notificationsEnabled}
          onChange={handleNotifications}
          accent
        />
        <AnimatePresence initial={false}>
          {notificationsEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pl-3 border-l border-white/5">
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono mt-1">Desktop popup per event</p>
                <ToggleRow
                  label="Level ups"
                  sublabel="When a skill levels up"
                  enabled={notifDesktopLevelUp}
                  onChange={makeToggle('grindly_notif_desktop_level_up', setNotifDesktopLevelUp)}
                  compact
                />
                <ToggleRow
                  label="Achievements"
                  sublabel="New achievement unlocked"
                  enabled={notifDesktopAchievement}
                  onChange={makeToggle('grindly_notif_desktop_achievement', setNotifDesktopAchievement)}
                  compact
                />
                <ToggleRow
                  label="Session milestones"
                  sublabel="XP gains, streak info"
                  enabled={notifDesktopProgression}
                  onChange={makeToggle('grindly_notif_desktop_progression', setNotifDesktopProgression)}
                  compact
                />
                <ToggleRow
                  label="Friend activity"
                  sublabel="When friends level up"
                  enabled={notifDesktopFriend}
                  onChange={makeToggle('grindly_notif_desktop_friend', setNotifDesktopFriend)}
                  compact
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Divider />

        <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Smart reminders</p>
        <ToggleRow
          label="Grind reminder"
          sublabel="Nudge if no session today"
          enabled={notifGrindReminder}
          onChange={makeToggle('grindly_notif_grind_reminder', setNotifGrindReminder, true)}
        />
        <ToggleRow
          label="Streak warning"
          sublabel="Alert when streak is at risk"
          enabled={notifStreakWarning}
          onChange={makeToggle('grindly_notif_streak_warning', setNotifStreakWarning, true)}
        />
        <ToggleRow
          label="Distraction alert"
          sublabel="Nudge when too much social/games"
          enabled={notifDistraction}
          onChange={makeToggle('grindly_notif_distraction', setNotifDistraction, true)}
        />
        <ToggleRow
          label="Focus praise"
          sublabel="Praise for sustained focus"
          enabled={notifPraise}
          onChange={makeToggle('grindly_notif_praise', setNotifPraise, true)}
        />
      </Section>

      {/* ─── WINDOW BEHAVIOR ───────────────────────────────── */}
      <Section id="window" title="Window Behavior" icon="window" open={openSections.has('window')} onToggle={toggleSection}>
        <ToggleRow
          label="Pop up on session end"
          sublabel="Bring Grindly to front when session finishes"
          enabled={showWindowOnSessionEnd}
          onChange={makeToggle('grindly_show_window_on_session_end', setShowWindowOnSessionEnd)}
        />
      </Section>

      {/* ─── DATA ───────────────────────────────────────────── */}
      <Section id="data" title="Data & Export" icon="data" open={openSections.has('data')} onToggle={toggleSection}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Cloud sync</span>
          <StatusBadge connected={!!supabase} />
        </div>
        <p className="text-xs text-gray-500 -mt-1">Download your grind history.</p>
        <div className="flex gap-2">
          <ActionButton label="Export JSON" onClick={() => handleExport('json')} />
          <ActionButton label="Export CSV" onClick={() => handleExport('csv')} />
        </div>
        {message && (
          message.type === 'ok'
            ? <InlineSuccess message={message.text} />
            : <p className="text-xs text-red-500">{message.text}</p>
        )}
      </Section>

      {/* ─── ACCOUNT ────────────────────────────────────────── */}
      {supabase && user && (
        <motion.button
          whileTap={MOTION.interactive.tap}
          onClick={() => signOut()}
          className="w-full py-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-500 font-semibold text-sm hover:bg-red-500/20 transition-colors"
        >
          Sign Out
        </motion.button>
      )}

      <p className="text-center text-caption text-gray-600 pb-2 font-mono">
        Grindly v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}
      </p>
    </motion.div>
  )
}

// ─── Section ────────────────────────────────────────────────
const SECTION_ICONS: Record<string, string> = {
  volume: '\u{1F50A}',
  settings: '\u{2699}',
  bell: '\u{1F514}',
  window: '\u{1F5D4}',
  data: '\u{1F4BE}',
  link: '\u{1F517}',
}

function Section({ id, title, icon, open, onToggle, children }: {
  id: string
  title: string
  icon?: string
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-card bg-surface-2/80 border border-white/[0.06] overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-sm opacity-60">{SECTION_ICONS[icon] ?? ''}</span>}
          <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{title}</p>
        </div>
        <span className={`text-gray-600 text-xs transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>&rsaquo;</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 space-y-2.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── ToggleRow ──────────────────────────────────────────────
function ToggleRow({ label, sublabel, enabled, onChange, compact, accent }: {
  label: string
  sublabel?: string
  enabled: boolean
  onChange: (v: boolean) => void
  compact?: boolean
  accent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${compact ? 'py-0.5' : ''}`}>
      <div className="min-w-0 mr-3">
        <p className={`text-white ${compact ? 'text-xs' : 'text-sm'} ${accent ? 'font-semibold' : ''} truncate`}>{label}</p>
        {sublabel && <p className={`text-gray-500 truncate ${compact ? 'text-micro' : 'text-xs'}`}>{sublabel}</p>}
      </div>
      <button
        onClick={() => { onChange(!enabled); playClickSound() }}
        className={`w-9 h-[22px] rounded-full relative transition-colors shrink-0 ${
          enabled ? 'bg-accent/40' : 'bg-surface-0 border border-white/10'
        }`}
      >
        <motion.div
          animate={{ x: enabled ? 16 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`absolute top-[3px] w-4 h-4 rounded-full shadow-sm ${
            enabled ? 'bg-accent' : 'bg-gray-500'
          }`}
        />
      </button>
    </div>
  )
}

// ─── SliderRow ──────────────────────────────────────────────
function SliderRow({ label, value, onChange }: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-14">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-accent h-1"
      />
      <span className="text-xs text-gray-500 w-8 text-right font-mono">
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

// ─── FontScaleRow ────────────────────────────────────────────
function FontScaleRow({ value, onChange }: { value: FontScalePreset; onChange: (v: FontScalePreset) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0 mr-3">
        <p className="text-sm text-white">Font size</p>
        <p className="text-xs text-gray-500">Scales all text and UI elements</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {FONT_SCALE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onChange(preset.id)}
            className={[
              'w-8 h-7 rounded text-xs font-bold transition-colors',
              value === preset.id
                ? 'bg-accent text-white'
                : 'bg-surface-0 border border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200',
            ].join(' ')}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Small Helpers ──────────────────────────────────────────
function Divider() {
  return <div className="border-t border-white/5 my-1" />
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono ${connected ? 'text-accent' : 'text-gray-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-gray-600'}`} />
      {connected ? 'connected' : 'offline'}
    </span>
  )
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={MOTION.interactive.tap}
      onClick={onClick}
      className="flex-1 py-2 rounded bg-surface-0 border border-white/[0.06] text-sm text-white font-medium hover:border-white/15 transition-colors"
    >
      {label}
    </motion.button>
  )
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkRow({ icon, label, sublabel, url }: { icon: React.ReactNode; label: string; sublabel: string; url: string }) {
  return (
    <button
      onClick={() => window.open(url, '_blank')}
      className="w-full flex items-center gap-3 py-1.5 text-left group"
    >
      <span className="text-base flex items-center justify-center w-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white group-hover:text-accent transition-colors truncate">{label}</p>
        <p className="text-caption text-gray-500 truncate">{sublabel}</p>
      </div>
      <span className="text-gray-600 group-hover:text-gray-400 text-xs transition-colors">↗</span>
    </button>
  )
}
