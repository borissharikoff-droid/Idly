import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ACHIEVEMENTS, levelFromTotalXP, xpProgressInLevel } from '../../lib/xp'
import type { AchievementDef } from '../../lib/xp'
import { useAlertStore } from '../../stores/alertStore'
import { playClickSound } from '../../lib/sounds'
import { detectPersona } from '../../lib/persona'
import { useNavBadgeStore } from '../../stores/navBadgeStore'
import { BADGES, FRAMES, FREE_AVATARS, LOCKED_AVATARS, getUnlockedBadges, getUnlockedFrames, getEquippedBadges, getEquippedFrame, equipBadge, unequipBadge, equipFrame, getUnlockedAvatarEmojis } from '../../lib/cosmetics'

const CATEGORY_LABELS: Record<string, string> = {
  grind: '⚡ Grind',
  streak: '🔥 Streak',
  social: '🤝 Social',
  special: '✨ Special',
  skill: '⚡ Skills',
}

type ProfileTab = 'overview' | 'achievements' | 'cosmetics'

export function ProfilePage({ onBack }: { onBack?: () => void }) {
  const { user } = useAuthStore()
  const pushAlert = useAlertStore((s) => s.push)

  // Profile data
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('🤖')
  const [originalUsername, setOriginalUsername] = useState('')
  const [originalAvatar, setOriginalAvatar] = useState('🤖')
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Stats
  const [totalXP, setTotalXP] = useState(0)
  const [persona, setPersona] = useState<{ emoji: string; label: string; description: string } | null>(null)

  // Achievements
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])
  const [claimedIds, setClaimedIds] = useState<string[]>([])

  // Cosmetics
  const [equippedBadges, setEquippedBadges] = useState<string[]>([])
  const [equippedFrameId, setEquippedFrameId] = useState<string | null>(null)
  const [unlockedBadgeIds, setUnlockedBadgeIds] = useState<string[]>([])
  const [unlockedFrameIds, setUnlockedFrameIds] = useState<string[]>([])

  // Tab
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')

  useEffect(() => {
    // Load profile
    if (supabase && user) {
      supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setUsername(data.username || '')
          setAvatar(data.avatar_url || '🤖')
          setOriginalUsername(data.username || '')
          setOriginalAvatar(data.avatar_url || '🤖')
        }
        setProfileLoaded(true)
      }).catch(() => setProfileLoaded(true))
    } else {
      setProfileLoaded(true)
    }

    // Load local stats
    const api = window.electronAPI
    if (api?.db) {
      api.db.getLocalStat('total_xp').then((v) => setTotalXP(parseInt(v || '0', 10)))
      api.db.getUnlockedAchievements().then(setUnlockedIds)
    } else {
      setTotalXP(parseInt(localStorage.getItem('idly_total_xp') || '0', 10))
      setUnlockedIds(JSON.parse(localStorage.getItem('idly_unlocked_achievements') || '[]'))
    }

    setClaimedIds(JSON.parse(localStorage.getItem('idly_claimed_achievements') || '[]'))

    // Persona
    if (api?.db?.getCategoryStats) {
      api.db.getCategoryStats().then((cats) => {
        setPersona(detectPersona((cats || []) as { category: string; total_ms: number }[]))
      })
    } else {
      setPersona(detectPersona([]))
    }

    // Cosmetics
    setEquippedBadges(getEquippedBadges())
    setEquippedFrameId(getEquippedFrame())
    setUnlockedBadgeIds(getUnlockedBadges())
    setUnlockedFrameIds(getUnlockedFrames())
  }, [user])

  const level = levelFromTotalXP(totalXP)
  const { current, needed } = xpProgressInLevel(totalXP)
  const pct = Math.min(100, (current / needed) * 100)
  const hasChanges = profileLoaded && (username !== originalUsername || avatar !== originalAvatar)

  // Compute unclaimed loot count and push to nav badge store
  const unclaimedCount = ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id) && !claimedIds.includes(a.id) && a.reward).length
  useEffect(() => {
    useNavBadgeStore.getState().setUnclaimedLootCount(unclaimedCount)
  }, [unclaimedCount])

  const saveProfile = async () => {
    if (!supabase || !user || !hasChanges) return
    setSaving(true)
    setMessage(null)
    if (username.trim().length < 3) {
      setMessage({ type: 'err', text: 'Min 3 characters.' })
      setSaving(false)
      return
    }
    if (username !== originalUsername) {
      const { data } = await supabase.from('profiles').select('id').eq('username', username.trim()).limit(1)
      if (data && data.length > 0 && data[0].id !== user.id) {
        setMessage({ type: 'err', text: 'Username taken.' })
        setSaving(false)
        return
      }
    }
    const { error } = await supabase.from('profiles').update({
      username: username.trim(),
      avatar_url: avatar,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (error) {
      setMessage({ type: 'err', text: error.message })
    } else {
      setMessage({ type: 'ok', text: 'Saved!' })
      setOriginalUsername(username.trim())
      setOriginalAvatar(avatar)
    }
    setSaving(false)
  }

  const handleClaim = (def: AchievementDef) => {
    playClickSound()
    const updated = [...claimedIds, def.id]
    setClaimedIds(updated)
    localStorage.setItem('idly_claimed_achievements', JSON.stringify(updated))
    pushAlert(def)
  }

  const syncCosmeticsToSupabase = (badges: string[], frame: string | null) => {
    if (supabase && user) {
      // Try to sync — columns may not exist yet in Supabase
      try {
        supabase.from('profiles').update({
          equipped_badges: badges,
          equipped_frame: frame,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id).then(() => {})
      } catch {
        // columns may not exist — ignore
      }
    }
  }

  const handleEquipBadge = (badgeId: string) => {
    playClickSound()
    let newBadges: string[]
    if (equippedBadges.includes(badgeId)) {
      unequipBadge(badgeId)
      newBadges = equippedBadges.filter(b => b !== badgeId)
    } else {
      if (equippedBadges.length >= 3) {
        setMessage({ type: 'err', text: 'Max 3 badges equipped.' })
        return
      }
      equipBadge(badgeId)
      newBadges = [...equippedBadges, badgeId]
    }
    setEquippedBadges(newBadges)
    syncCosmeticsToSupabase(newBadges, equippedFrameId)
  }

  const handleEquipFrame = (frameId: string) => {
    playClickSound()
    const newFrame = equippedFrameId === frameId ? null : frameId
    equipFrame(newFrame)
    setEquippedFrameId(newFrame)
    syncCosmeticsToSupabase(equippedBadges, newFrame)
  }

  // Find the active frame
  const activeFrame = FRAMES.find(f => f.id === equippedFrameId)

  const categories = ['grind', 'streak', 'social', 'special', 'skill']
  const unlockedCount = ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id)).length

  return (
    <div
      className={`p-4 pb-20 space-y-4 overflow-auto transition-opacity duration-150 ${profileLoaded ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        )}
        <h2 className="text-lg font-bold text-white">Profile</h2>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl bg-gradient-to-br from-discord-card/90 to-discord-card/60 border border-white/10 p-5 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, white 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, white 0px, transparent 1px, transparent 20px)' }} />

        <div className="relative flex items-center gap-4">
          {/* Avatar with frame */}
          <div className="relative shrink-0">
            {activeFrame && (
              <div
                className="absolute -inset-1.5 rounded-2xl"
                style={{
                  background: activeFrame.gradient,
                  opacity: 0.8,
                }}
              />
            )}
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl relative ${
              activeFrame ? 'border-2' : 'border border-white/10'
            } bg-discord-darker`}
              style={activeFrame ? { borderColor: activeFrame.color } : undefined}
            >
              {avatar}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-base truncate">{username || 'Idly'}</span>
              <span className="text-cyber-neon font-mono text-xs">Lv.{level}</span>
            </div>

            {/* Equipped badges */}
            {equippedBadges.length > 0 && (
              <div className="flex items-center gap-1 mb-1.5">
                {equippedBadges.map(bId => {
                  const badge = BADGES.find(b => b.id === bId)
                  return badge ? (
                    <span
                      key={bId}
                      className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium"
                      style={{ borderColor: `${badge.color}40`, backgroundColor: `${badge.color}15`, color: badge.color }}
                      title={badge.name}
                    >
                      {badge.icon} {badge.label}
                    </span>
                  ) : null
                })}
              </div>
            )}

            {persona && (
              <span className="text-[10px] text-gray-500">{persona.emoji} {persona.label}</span>
            )}

            {/* XP bar */}
            <div className="mt-1.5">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-cyber-neon to-discord-accent"
                />
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[9px] text-gray-600 font-mono">{current}/{needed} XP</span>
                <span className="text-[9px] text-gray-600 font-mono">{totalXP} total</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-discord-darker/50 rounded-xl p-1">
        {([
          { id: 'overview' as const, label: 'Edit', icon: '✏️', hasNotif: false },
          { id: 'achievements' as const, label: `Loot (${unlockedCount}/${ACHIEVEMENTS.length})`, icon: '🏆', hasNotif: unclaimedCount > 0 },
          { id: 'cosmetics' as const, label: 'Cosmetics', icon: '✨', hasNotif: false },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); playClickSound() }}
            className={`relative flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-discord-card text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
            {tab.hasNotif && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* EDIT TAB */}
        {activeTab === 'overview' && (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {/* Avatar selection */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Avatar</p>
              <div className="flex flex-wrap gap-1.5">
                {/* Free avatars */}
                {FREE_AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => { setAvatar(a); playClickSound() }}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90 ${
                      avatar === a
                        ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                        : 'bg-discord-dark border border-white/10 hover:border-white/20'
                    }`}
                  >
                    {a}
                  </button>
                ))}
                {/* Locked avatars */}
                {LOCKED_AVATARS.map((la) => {
                  const isUnlocked = unlockedIds.includes(la.achievementId) || getUnlockedAvatarEmojis().includes(la.emoji)
                  return (
                    <button
                      type="button"
                      key={la.emoji}
                      onClick={() => { if (isUnlocked) { setAvatar(la.emoji); playClickSound() } }}
                      disabled={!isUnlocked}
                      title={isUnlocked ? la.emoji : la.unlockHint}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all relative ${
                        isUnlocked
                          ? avatar === la.emoji
                            ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm active:scale-90'
                            : 'bg-discord-dark border border-white/10 hover:border-white/20 active:scale-90'
                          : 'bg-discord-dark/50 border border-white/5 cursor-not-allowed'
                      }`}
                    >
                      <span style={{ opacity: isUnlocked ? 1 : 0.25 }}>{la.emoji}</span>
                      {!isUnlocked && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px]">🔒</span>
                      )}
                    </button>
                  )
                })}
                {/* Bonus avatars (unlocked outside base set) */}
                {getUnlockedAvatarEmojis()
                  .filter(a => !FREE_AVATARS.includes(a) && !LOCKED_AVATARS.some(la => la.emoji === a))
                  .map((a) => (
                    <button
                      type="button"
                      key={a}
                      onClick={() => { setAvatar(a); playClickSound() }}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90 ${
                        avatar === a
                          ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                          : 'bg-discord-dark border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
              </div>
            </div>

            {/* Username */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Username</p>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2 text-white text-sm focus:border-cyber-neon/50 outline-none transition-colors"
                placeholder="Your username"
              />
            </div>

            {hasChanges && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
                onClick={saveProfile}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-cyber-neon text-discord-darker font-bold text-sm hover:shadow-glow disabled:opacity-50 transition-shadow"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </motion.button>
            )}

            {message && (
              <p className={`text-xs text-center ${message.type === 'ok' ? 'text-cyber-neon' : 'text-discord-red'}`}>
                {message.text}
              </p>
            )}
          </motion.div>
        )}

        {/* ACHIEVEMENTS TAB */}
        {activeTab === 'achievements' && (
          <motion.div
            key="achievements"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {categories.map((cat) => {
              const items = ACHIEVEMENTS.filter((a) => a.category === cat)
              if (items.length === 0) return null
              const catUnlocked = items.filter((a) => unlockedIds.includes(a.id)).length
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">{catUnlocked}/{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((a, i) => {
                      const unlocked = unlockedIds.includes(a.id)
                      const claimed = claimedIds.includes(a.id)
                      const canClaim = unlocked && !claimed && a.reward
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`flex items-center gap-3 rounded-xl p-3 border ${
                            unlocked
                              ? 'border-cyber-neon/20 bg-cyber-neon/5'
                              : 'border-white/5 bg-discord-dark/50 opacity-40'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                            unlocked ? 'bg-cyber-neon/15' : 'bg-discord-dark'
                          }`}>
                            {unlocked ? a.icon : '🔒'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${unlocked ? 'text-white' : 'text-gray-400'}`}>
                              {a.name}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">{a.description}</p>
                            {a.reward && unlocked && claimed && (
                              <p className="text-[9px] text-cyber-neon/60 font-mono mt-0.5">{a.reward.value} {a.reward.label}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <span className={`text-[10px] font-mono ${unlocked ? 'text-cyber-neon' : 'text-gray-600'}`}>+{a.xpReward}</span>
                            {canClaim && (
                              <button
                                onClick={() => handleClaim(a)}
                                className="px-2 py-1 rounded-lg bg-cyber-neon text-discord-darker text-[9px] font-bold active:scale-95 transition-all hover:shadow-glow-sm animate-pulse"
                              >
                                CLAIM
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}

        {/* COSMETICS TAB (Badges + Frames) */}
        {activeTab === 'cosmetics' && (
          <motion.div
            key="cosmetics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Badges section */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Badges</p>
                <p className="text-[9px] text-gray-600 font-mono">{equippedBadges.length}/3 equipped</p>
              </div>
              <p className="text-[10px] text-gray-500">Shown next to your name. Tap to equip/unequip.</p>
              <div className="grid grid-cols-2 gap-2">
                {BADGES.map((badge) => {
                  const isUnlocked = unlockedBadgeIds.includes(badge.id)
                  const isEquipped = equippedBadges.includes(badge.id)
                  return (
                    <button
                      key={badge.id}
                      onClick={() => isUnlocked && handleEquipBadge(badge.id)}
                      disabled={!isUnlocked}
                      className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden active:scale-[0.97] ${
                        isEquipped
                          ? 'bg-discord-dark/80'
                          : isUnlocked
                            ? 'border-white/10 bg-discord-dark/50 hover:border-white/20'
                            : 'border-white/[0.06] bg-discord-dark/30'
                      }`}
                      style={{
                        borderColor: isEquipped ? `${badge.color}50` : undefined,
                        boxShadow: isEquipped ? `0 0 20px ${badge.color}20` : undefined,
                      }}
                    >
                      {isEquipped && (
                        <div className="absolute top-1.5 right-1.5">
                          <span className="text-[8px] font-mono font-bold" style={{ color: badge.color }}>ON</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5 mb-1">
                        {/* Badge preview — always colorful */}
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 border"
                          style={{
                            borderColor: `${badge.color}${isUnlocked ? '60' : '30'}`,
                            backgroundColor: `${badge.color}${isUnlocked ? '18' : '0a'}`,
                            boxShadow: isEquipped ? `0 0 12px ${badge.color}40` : `0 0 8px ${badge.color}10`,
                          }}
                        >
                          <span style={{ opacity: isUnlocked ? 1 : 0.6 }}>{badge.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[11px] font-semibold block ${isUnlocked ? 'text-white' : 'text-gray-400'}`}>{badge.name}</span>
                          {/* Preview: how badge looks next to name */}
                          <span
                            className="inline-block text-[8px] px-1 py-[1px] rounded font-medium mt-0.5"
                            style={{
                              borderWidth: 1,
                              borderColor: `${badge.color}${isUnlocked ? '40' : '20'}`,
                              backgroundColor: `${badge.color}${isUnlocked ? '15' : '08'}`,
                              color: isUnlocked ? badge.color : `${badge.color}80`,
                            }}
                          >
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                      </div>
                      <p className={`text-[9px] leading-tight ${isUnlocked ? 'text-gray-400' : 'text-gray-500'}`}>{badge.description}</p>
                      {!isUnlocked && (
                        <p className="text-[8px] font-mono mt-0.5" style={{ color: `${badge.color}60` }}>{badge.unlockHint}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Frames section */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Avatar Frames</p>
              <p className="text-[10px] text-gray-500">Exclusive borders. Tap to equip.</p>
              <div className="grid grid-cols-2 gap-3">
                {FRAMES.map((frame) => {
                  const isUnlocked = unlockedFrameIds.includes(frame.id)
                  const isActive = equippedFrameId === frame.id
                  const rarityColors: Record<string, string> = { Rare: '#4FC3F7', Epic: '#C084FC', Legendary: '#FFD700' }
                  const styleClass = `frame-style-${frame.style}`
                  return (
                    <button
                      key={frame.id}
                      onClick={() => isUnlocked && handleEquipFrame(frame.id)}
                      disabled={!isUnlocked}
                      className={`relative p-3 rounded-2xl border text-center transition-all active:scale-[0.96] overflow-hidden ${styleClass} ${
                        isActive
                          ? 'bg-discord-dark/90'
                          : isUnlocked
                            ? 'border-white/10 bg-discord-dark/60 hover:border-white/20'
                            : 'border-white/[0.06] bg-discord-dark/40'
                      }`}
                      style={{
                        borderColor: isActive ? `${frame.color}60` : undefined,
                        boxShadow: isActive ? `0 0 25px ${frame.color}30, inset 0 0 20px ${frame.color}08` : undefined,
                      }}
                    >
                      {/* Background gradient wash */}
                      <div
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        style={{
                          background: frame.gradient,
                          opacity: isActive ? 0.1 : 0.05,
                        }}
                      />

                      {/* Frame avatar preview */}
                      <div className="relative mx-auto w-16 h-16 mb-2">
                        {/* Style-specific animated ring */}
                        <div
                          className="frame-ring absolute -inset-2 rounded-2xl"
                          style={{
                            background: frame.gradient,
                            opacity: isUnlocked ? (isActive ? 0.9 : 0.65) : 0.3,
                            filter: !isUnlocked ? 'saturate(0.4) brightness(0.7)' : undefined,
                            borderColor: frame.color,
                            color: frame.color,
                          }}
                        />
                        {/* Avatar container */}
                        <div
                          className="frame-avatar relative w-16 h-16 rounded-xl bg-discord-darker flex items-center justify-center text-2xl border-2"
                          style={{ borderColor: `${frame.color}${isUnlocked ? 'b0' : '50'}` }}
                        >
                          {avatar}
                        </div>
                        {/* Lock overlay */}
                        {!isUnlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                            <span className="text-xl drop-shadow-lg">🔒</span>
                          </div>
                        )}
                        {/* Equipped checkmark */}
                        {isActive && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: frame.color, color: '#111' }}>
                            ✓
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <p className={`text-[11px] font-bold relative ${isUnlocked ? 'text-white' : 'text-gray-300'}`}>{frame.name}</p>
                      <p className="text-[8px] text-gray-500 relative capitalize">{frame.style}</p>
                      <p
                        className="text-[9px] font-bold uppercase tracking-wider relative"
                        style={{ color: rarityColors[frame.rarity] }}
                      >
                        {frame.rarity === 'Legendary' ? '★ ' : frame.rarity === 'Epic' ? '◆ ' : '● '}{frame.rarity}
                      </p>
                      {!isUnlocked && (
                        <p className="text-[8px] font-mono mt-1 relative" style={{ color: `${frame.color}90` }}>{frame.unlockHint}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
