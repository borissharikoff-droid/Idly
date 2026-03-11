import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ACHIEVEMENTS, getAchievementProgress, type AchievementProgressContext } from '../../lib/xp'
import { computeTotalSkillLevel, MAX_TOTAL_SKILL_LEVEL, skillLevelFromXP } from '../../lib/skills'
import type { AchievementDef } from '../../lib/xp'
import { useAlertStore } from '../../stores/alertStore'
import { playClickSound } from '../../lib/sounds'
import { detectPersona } from '../../lib/persona'
import { BADGES, FRAMES, FREE_AVATARS, LOCKED_AVATARS, ACHIEVEMENT_COSMETIC_UNLOCKS, getUnlockedBadges, getUnlockedFrames, getEquippedBadges, getEquippedFrame, equipBadge, unequipBadge, equipFrame, getUnlockedAvatarEmojis, unlockCosmeticsFromAchievement, ensureCosmeticsForUnlockedAchievements } from '../../lib/cosmetics'
import { syncCosmeticsToSupabase } from '../../services/supabaseSync'
import { PageHeader } from '../shared/PageHeader'
import { InlineSuccess } from '../shared/InlineSuccess'
import { getEquippedPerkRuntime, getItemPower, getRarityTheme, LOOT_ITEMS, type LootSlot } from '../../lib/loot'
import { computePlayerStats } from '../../lib/combat'
import { useGoldStore } from '../../stores/goldStore'
import { useArenaStore } from '../../stores/arenaStore'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { getDailyActivities, getWeeklyActivities } from '../../services/dailyActivityService'
import { QuestsSection } from '../quests/QuestsSection'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { ItemInspectModal } from '../shared/ItemInspectModal'



type ProfileTab = 'achievements' | 'cosmetics'

export function ProfilePage({ onBack }: { onBack?: () => void }) {
  const inventory = useInventoryStore((s) => s.items)
  const chests = useInventoryStore((s) => s.chests)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)

  const { user } = useAuthStore()
  const pushAlert = useAlertStore((s) => s.push)

  // Profile data
  const [username, setUsername] = useState('Grindly')
  const [avatar, setAvatar] = useState('🤖')
  const [originalUsername, setOriginalUsername] = useState('Grindly')
  const [originalAvatar, setOriginalAvatar] = useState('🤖')
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false)
  const [isUsernameEditing, setIsUsernameEditing] = useState(false)
  const [draftUsername, setDraftUsername] = useState('Grindly')

  // Stats
  const [totalSkillLevel, setTotalSkillLevel] = useState(0)
  const [persona, setPersona] = useState<{ emoji: string; label: string; description: string } | null>(null)

  // Achievements
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])
  const [claimedIds, setClaimedIds] = useState<string[]>([])

  // Cosmetics
  const [equippedBadges, setEquippedBadges] = useState<string[]>([])
  const [equippedFrameId, setEquippedFrameId] = useState<string | null>(null)
  const [unlockedBadgeIds, setUnlockedBadgeIds] = useState<string[]>([])
  const [unlockedFrameIds, setUnlockedFrameIds] = useState<string[]>([])

  // Achievement progress context (for "Next Unlock" tracker)
  const [progressCtx, setProgressCtx] = useState<AchievementProgressContext>({
    totalSessions: 0, streakCount: 0, friendCount: 0, skillLevels: {},
  })

  // Tab
  const [activeTab, setActiveTab] = useState<ProfileTab>('achievements')

  useEffect(() => {
    if (user) {
      const cacheKey = `grindly_profile_cache_${user.id}`
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}') as { username?: string; avatar?: string }
        if (cached.username || cached.avatar) {
          const nextUsername = (cached.username || 'Grindly').trim()
          const nextAvatar = cached.avatar || '🤖'
          setUsername(nextUsername)
          setAvatar(nextAvatar)
          setOriginalUsername(nextUsername)
          setOriginalAvatar(nextAvatar)
          setProfileLoaded(true)
        }
      } catch {
        // ignore broken cache
      }
    }

    // Load profile
    if (supabase && user) {
      supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          const nextUsername = (data.username || 'Grindly').trim()
          const nextAvatar = data.avatar_url || '🤖'
          setUsername(nextUsername)
          setAvatar(nextAvatar)
          setOriginalUsername(nextUsername)
          setOriginalAvatar(nextAvatar)
          const cacheKey = `grindly_profile_cache_${user.id}`
          localStorage.setItem(cacheKey, JSON.stringify({ username: nextUsername, avatar: nextAvatar }))
        }
        setProfileLoaded(true)
      }).catch(() => setProfileLoaded(true))
    } else {
      setProfileLoaded(true)
    }

    // Load local stats
    const api = window.electronAPI
    if (api?.db) {
      if (api.db.getAllSkillXP) {
        api.db.getAllSkillXP().then((rows: { skill_id: string; total_xp: number }[]) => {
          setTotalSkillLevel(computeTotalSkillLevel(rows || []))
        })
      }
      api.db.getUnlockedAchievements().then((ids: string[]) => {
        setUnlockedIds(ids)
        ensureCosmeticsForUnlockedAchievements(ids)
        // Refresh cosmetic state after migration
        setUnlockedBadgeIds(getUnlockedBadges())
        setUnlockedFrameIds(getUnlockedFrames())
      })
      // Load progress context for "Next Unlock" tracker
      ;(async () => {
        let totalSessions = 0, streakCount = 0, friendCount = 0
        const skillLevels: Record<string, number> = {}
        try {
          if (api.db.getSessionCount) totalSessions = (await api.db.getSessionCount()) as number
          if (api.db.getStreak) streakCount = (await api.db.getStreak()) as number
          if (api.db.getAllSkillXP) {
            const rows = (await api.db.getAllSkillXP()) as { skill_id: string; total_xp: number }[]
            for (const r of rows) skillLevels[r.skill_id] = skillLevelFromXP(r.total_xp)
          }
        } catch { /* ignore */ }
        try {
          const stored = localStorage.getItem('grindly_friends_count')
          if (stored) friendCount = parseInt(stored, 10) || 0
        } catch { /* ignore */ }
        setProgressCtx({ totalSessions, streakCount, friendCount, skillLevels })
      })()
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
        setTotalSkillLevel(computeTotalSkillLevel(Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp }))))
      } catch {
        setTotalSkillLevel(0)
      }
      const localIds = JSON.parse(localStorage.getItem('grindly_unlocked_achievements') || '[]') as string[]
      setUnlockedIds(localIds)
      ensureCosmeticsForUnlockedAchievements(localIds)
    }

    setClaimedIds(JSON.parse(localStorage.getItem('grindly_claimed_achievements') || '[]'))

    // Persona
    if (api?.db?.getCategoryStats) {
      api.db.getCategoryStats().then((cats) => {
        setPersona(detectPersona((cats || []) as { category: string; total_ms: number }[]))
      })
    } else {
      setPersona(detectPersona([]))
    }

    // Cosmetics (loaded after migration runs above)
    setEquippedBadges(getEquippedBadges())
    setEquippedFrameId(getEquippedFrame())
    setUnlockedBadgeIds(getUnlockedBadges())
    setUnlockedFrameIds(getUnlockedFrames())
    ensureInventoryHydrated()
  }, [user])

  // Sync equipped loot to Supabase when Profile opens (so friends see loadout right away)
  useEffect(() => {
    if (!supabase || !user) return
    ensureInventoryHydrated()
    const equippedLoot = useInventoryStore.getState().equippedBySlot
    const perk = getEquippedPerkRuntime(equippedLoot)
    syncCosmeticsToSupabase(getEquippedBadges(), getEquippedFrame(), {
      equippedLoot: (equippedLoot ?? {}) as Record<string, string>,
      statusTitle: perk.statusTitle,
    }).catch(() => {})
  }, [user])

  // Ensure cosmetics are unlocked from already-unlocked achievements (source of truth).
  useEffect(() => {
    if (!unlockedIds.length) return
    for (const achievementId of unlockedIds) {
      unlockCosmeticsFromAchievement(achievementId)
    }
    setUnlockedBadgeIds(getUnlockedBadges())
    setUnlockedFrameIds(getUnlockedFrames())
  }, [unlockedIds])

  useEffect(() => {
    setDraftUsername(username)
  }, [username])

  useEffect(() => {
    setIsAvatarPickerOpen(false)
    setIsUsernameEditing(false)
  }, [activeTab])

  // Starter pack moved to InventoryPage ("Newbie Pack" claim flow)

  const persistProfile = async (nextUsername: string, nextAvatar: string) => {
    const trimmedUsername = nextUsername.trim()
    if (!user) return false

    // Always keep local state in sync even if cloud is unavailable.
    const cacheKey = `grindly_profile_cache_${user.id}`
    const applyLocal = () => {
      setUsername(trimmedUsername)
      setAvatar(nextAvatar)
      setOriginalUsername(trimmedUsername)
      setOriginalAvatar(nextAvatar)
      localStorage.setItem(cacheKey, JSON.stringify({ username: trimmedUsername, avatar: nextAvatar }))
    }

    if (!supabase) {
      applyLocal()
      setMessage({ type: 'ok', text: 'Saved locally.' })
      return true
    }

    if (trimmedUsername === originalUsername && nextAvatar === originalAvatar) return true

    setSaving(true)
    setMessage(null)
    if (trimmedUsername.length < 3) {
      setMessage({ type: 'err', text: 'Min 3 characters.' })
      setSaving(false)
      return false
    }
    if (trimmedUsername !== originalUsername) {
      const { data } = await supabase.from('profiles').select('id').eq('username', trimmedUsername).limit(1)
      if (data && data.length > 0 && data[0].id !== user.id) {
        setMessage({ type: 'err', text: 'Username taken.' })
        setSaving(false)
        return false
      }
    }
    const { error } = await supabase.from('profiles').update({
      username: trimmedUsername,
      avatar_url: nextAvatar,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (error) {
      setMessage({ type: 'err', text: error.message })
      setSaving(false)
      return false
    } else {
      applyLocal()
      setMessage({ type: 'ok', text: 'Saved.' })
    }
    setSaving(false)
    return true
  }

  const handleClaim = (def: AchievementDef) => {
    playClickSound()
    const updated = [...claimedIds, def.id]
    setClaimedIds(updated)
    localStorage.setItem('grindly_claimed_achievements', JSON.stringify(updated))
    // Ensure cosmetics are granted (safety net for pre-fix achievements)
    unlockCosmeticsFromAchievement(def.id)
    setUnlockedBadgeIds(getUnlockedBadges())
    setUnlockedFrameIds(getUnlockedFrames())
    pushAlert(def)
  }

  const persistCosmeticsToSupabase = (badges: string[], frame: string | null) => {
    if (!supabase || !user) return
    const statusTitle = equippedLootItems.find((entry) => entry.item.slot === 'ring')?.item.perkType === 'status_title'
      ? String(equippedLootItems.find((entry) => entry.item.slot === 'ring')?.item.perkValue ?? '')
      : null
    syncCosmeticsToSupabase(badges, frame, {
      equippedLoot: equippedBySlot as Record<string, string>,
      statusTitle,
    }).catch(() => {})
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
    persistCosmeticsToSupabase(newBadges, equippedFrameId)
  }

  const handleEquipFrame = (frameId: string) => {
    playClickSound()
    const newFrame = equippedFrameId === frameId ? null : frameId
    equipFrame(newFrame)
    setEquippedFrameId(newFrame)
    persistCosmeticsToSupabase(equippedBadges, newFrame)
  }

  // Find the active frame
  const activeFrame = FRAMES.find(f => f.id === equippedFrameId)
  const equippedLootItems = (Object.entries(equippedBySlot) as Array<[LootSlot, string]>)
    .map(([slot, itemId]) => ({ slot, item: LOOT_ITEMS.find((x) => x.id === itemId) }))
    .filter((entry): entry is { slot: LootSlot; item: (typeof LOOT_ITEMS)[number] } => Boolean(entry.item))


  const applyDraftUsername = async () => {
    const sanitized = draftUsername.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
    await persistProfile(sanitized || 'Grindly', avatar)
    setDraftUsername(sanitized || 'Grindly')
    setIsUsernameEditing(false)
  }

  const unlockedAvatarSet = new Set(getUnlockedAvatarEmojis())
  const bonusAvatars = getUnlockedAvatarEmojis().filter(
    (a) => !FREE_AVATARS.includes(a) && !LOCKED_AVATARS.some((la) => la.emoji === a),
  )

  const unlockedCount = ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id)).length
  const dailyActivities = useMemo(() => getDailyActivities(), [activeTab, inventory, chests])
  const weeklyActivities = useMemo(() => getWeeklyActivities(), [activeTab, inventory, chests])
  const hasClaimableQuest = dailyActivities.some((m) => m.completed && !m.claimed) || weeklyActivities.some((m) => m.completed && !m.claimed)
  const hasQuestAttention = hasClaimableQuest || dailyActivities.some((m) => !m.claimed)

  const [inspectItemId, setInspectItemId] = useState<string | null>(null)
  const inspectItem = inspectItemId ? (LOOT_ITEMS.find((x) => x.id === inspectItemId) ?? null) : null

  return (
    <div
      className="p-4 pb-20 space-y-4 overflow-auto"
    >
      {/* Header */}
      <PageHeader title="Profile" onBack={onBack} />

      {/* Flex Card — single source of truth for profile display */}
      <FlexCard
        avatar={profileLoaded ? avatar : '\uD83E\uDD16'}
        username={profileLoaded ? (username || 'Grindly') : 'Loading...'}
        frameId={equippedFrameId}
        equippedBadges={equippedBadges}
        equippedLootItems={equippedLootItems}
        unlockedCount={unlockedCount}
        totalSkillLevel={totalSkillLevel}
        onAvatarClick={() => { playClickSound(); setIsAvatarPickerOpen((v) => !v) }}
        onUsernameClick={() => { playClickSound(); setIsUsernameEditing(true); setDraftUsername(username) }}
        isUsernameEditing={isUsernameEditing}
        draftUsername={draftUsername}
        onDraftChange={setDraftUsername}
        onDraftSubmit={applyDraftUsername}
        onDraftCancel={() => { setDraftUsername(username); setIsUsernameEditing(false) }}
        onItemInspect={(itemId) => { playClickSound(); setInspectItemId(itemId) }}
        syncButton={supabase && user ? (
          <button
            type="button"
            onClick={async () => {
              ensureInventoryHydrated()
              const equippedLoot = useInventoryStore.getState().equippedBySlot
              const perk = getEquippedPerkRuntime(equippedLoot)
              const res = await syncCosmeticsToSupabase(getEquippedBadges(), getEquippedFrame(), {
                equippedLoot: (equippedLoot ?? {}) as Record<string, string>,
                statusTitle: perk.statusTitle,
              })
              playClickSound()
              setMessage(res.ok ? { type: 'ok', text: 'Cosmetics synced.' } : { type: 'err', text: res.error ?? 'Sync failed' })
            }}
            className="text-[8px] text-cyber-neon/60 hover:text-cyber-neon font-mono transition-colors"
          >
            sync to cloud
          </button>
        ) : null}
      />

      <ItemInspectModal item={inspectItem} onClose={() => setInspectItemId(null)} />

      {isAvatarPickerOpen && (
        <div className="rounded-xl bg-discord-card/90 border border-cyber-neon/20 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Choose avatar</p>
          <div className="flex flex-wrap gap-1.5">
            {FREE_AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => {
                  void persistProfile(username, a)
                  setIsAvatarPickerOpen(false)
                  playClickSound()
                }}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90 ${
                  avatar === a
                    ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                    : 'bg-discord-dark border border-white/10 hover:border-white/20'
                }`}
              >
                {a}
              </button>
            ))}
            {LOCKED_AVATARS.map((la) => {
              const isUnlocked = unlockedIds.includes(la.achievementId) || unlockedAvatarSet.has(la.emoji)
              return (
                <button
                  type="button"
                  key={la.emoji}
                  onClick={() => {
                    if (!isUnlocked) return
                    void persistProfile(username, la.emoji)
                    setIsAvatarPickerOpen(false)
                    playClickSound()
                  }}
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
                    <span className="absolute inset-0 flex items-center justify-center text-[10px]">{'\uD83D\uDD12'}</span>
                  )}
                </button>
              )
            })}
            {bonusAvatars.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => {
                  void persistProfile(username, a)
                  setIsAvatarPickerOpen(false)
                  playClickSound()
                }}
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
      )}

      {saving && (
        <p className="text-xs text-center text-cyber-neon/80 font-mono">Saving...</p>
      )}

      {message && (
        message.type === 'ok'
          ? <InlineSuccess message={message.text} className="justify-self-center text-center" />
          : <p className="text-xs text-center text-discord-red">{message.text}</p>
      )}

      {/* Next Unlock — always visible on profile */}
      <NextUnlockTracker unlockedIds={unlockedIds} progressCtx={progressCtx} />

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-discord-darker/50 rounded-xl p-1">
        {([
          { id: 'achievements' as const, label: `Quests (${unlockedCount}/${ACHIEVEMENTS.length})`, icon: '🏆' },
          { id: 'cosmetics' as const, label: 'Cosmetics', icon: '✨' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); playClickSound() }}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-discord-card text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
            {tab.id === 'achievements' && hasQuestAttention && (
              <span
                className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${hasClaimableQuest ? 'bg-cyber-neon' : 'bg-orange-400'}`}
                title={hasClaimableQuest ? 'Quests ready to claim' : 'Daily quests available'}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ACHIEVEMENTS TAB */}
        {activeTab === 'achievements' && (
          <motion.div
            key="achievements"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <QuestsSection
              unlockedIds={unlockedIds}
              claimedIds={claimedIds}
              onClaimAchievement={handleClaim}
            />
          </motion.div>
        )}

        {/* COSMETICS TAB */}
        {activeTab === 'cosmetics' && (
          <motion.div
            key="cosmetics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4 min-h-[320px]"
          >
            {/* ── Collection Progress ── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="rounded-xl bg-discord-card/80 border border-white/10 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Collection</p>
                <p className="text-[9px] text-gray-600 font-mono">
                  {unlockedBadgeIds.length + unlockedFrameIds.length + getUnlockedAvatarEmojis().length} / {BADGES.length + FRAMES.length + LOCKED_AVATARS.length} unlocked
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((unlockedBadgeIds.length + unlockedFrameIds.length + getUnlockedAvatarEmojis().length) / (BADGES.length + FRAMES.length + LOCKED_AVATARS.length)) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  className="h-full rounded-full bg-gradient-to-r from-cyber-neon/70 via-purple-400/70 to-yellow-400/70"
                />
              </div>
              <div className="flex gap-4 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyber-neon/60" />
                  <span className="text-[9px] text-gray-500 font-mono">
                    <span className="text-cyber-neon font-semibold">{unlockedFrameIds.length}</span>/{FRAMES.length} Frames
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
                  <span className="text-[9px] text-gray-500 font-mono">
                    <span className="text-yellow-400 font-semibold">{unlockedBadgeIds.length}</span>/{BADGES.length} Badges
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-400/60" />
                  <span className="text-[9px] text-gray-500 font-mono">
                    <span className="text-purple-400 font-semibold">{getUnlockedAvatarEmojis().length}</span>/{LOCKED_AVATARS.length} Avatars
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ── Rarity Breakdown ── */}
            <RarityBreakdown unlockedFrameIds={unlockedFrameIds} unlockedBadgeIds={unlockedBadgeIds} />

            {/* ── Badges section ── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Badges</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
                        style={{ backgroundColor: i < equippedBadges.length ? (BADGES.find((b) => b.id === equippedBadges[i])?.color ?? '#888') + '80' : 'rgba(255,255,255,0.08)' }}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-600 font-mono">{equippedBadges.length}/3</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BADGES.map((badge) => {
                  const isUnlocked = unlockedBadgeIds.includes(badge.id) || (badge.achievementId ? unlockedIds.includes(badge.achievementId) : false)
                  const isEquipped = equippedBadges.includes(badge.id)
                  return (
                    <motion.button
                      key={badge.id}
                      whileTap={isUnlocked ? { scale: 0.96 } : undefined}
                      onClick={() => isUnlocked && handleEquipBadge(badge.id)}
                      disabled={!isUnlocked}
                      className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
                        isEquipped
                          ? 'bg-discord-dark/80'
                          : isUnlocked
                            ? 'border-white/10 bg-discord-dark/50 hover:border-white/20'
                            : 'border-white/[0.06] bg-discord-dark/30 opacity-60'
                      }`}
                      style={{
                        borderColor: isEquipped ? `${badge.color}50` : undefined,
                        boxShadow: isEquipped ? `0 0 20px ${badge.color}18, inset 0 0 16px ${badge.color}06` : undefined,
                      }}
                    >
                      {isEquipped && (
                        <div
                          className="absolute inset-0 pointer-events-none rounded-xl"
                          style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${badge.color}12, transparent 60%)` }}
                        />
                      )}
                      {isEquipped ? (
                        <div
                          className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[7px] font-bold font-mono uppercase tracking-wider"
                          style={{ backgroundColor: `${badge.color}20`, color: badge.color, border: `1px solid ${badge.color}35` }}
                        >
                          Equipped
                        </div>
                      ) : isUnlocked ? (
                        <div className="absolute top-1.5 right-1.5 text-[8px] text-gray-600 font-mono">
                          tap to equip
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2.5 mb-1.5 relative">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 border transition-shadow"
                          style={{
                            borderColor: `${badge.color}${isUnlocked ? '60' : '25'}`,
                            backgroundColor: `${badge.color}${isUnlocked ? '18' : '08'}`,
                            boxShadow: isEquipped ? `0 0 14px ${badge.color}40` : undefined,
                          }}
                        >
                          <span style={{ opacity: isUnlocked ? 1 : 0.35, filter: !isUnlocked ? 'grayscale(0.8)' : undefined }}>{badge.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[11px] font-semibold block ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>{badge.name}</span>
                          <span
                            className="inline-block text-[8px] px-1.5 py-[2px] rounded-md font-medium mt-0.5 border"
                            style={{
                              borderColor: `${badge.color}${isUnlocked ? '40' : '18'}`,
                              backgroundColor: `${badge.color}${isUnlocked ? '15' : '06'}`,
                              color: isUnlocked ? badge.color : `${badge.color}50`,
                            }}
                          >
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                      </div>
                      <p className={`text-[9px] leading-tight relative ${isUnlocked ? 'text-gray-400' : 'text-gray-600'}`}>
                        {isUnlocked ? badge.description : badge.unlockHint}
                      </p>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>

            {/* ── Frames section ── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Avatar Frames</p>
                <p className="text-[9px] text-gray-600 font-mono">{unlockedFrameIds.length}/{FRAMES.length} unlocked</p>
              </div>

              {(['Rare', 'Epic', 'Legendary'] as const).map((rarity) => {
                const rarityFrames = FRAMES.filter((f) => f.rarity === rarity)
                if (rarityFrames.length === 0) return null
                const rarityColors: Record<string, string> = { Rare: '#4FC3F7', Epic: '#C084FC', Legendary: '#FFD700' }
                return (
                  <div key={rarity} className="space-y-2">
                    <div className="flex items-center gap-2 px-0.5">
                      <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: `${rarityColors[rarity]}90` }}>
                        {rarity === 'Legendary' ? '\u2605' : rarity === 'Epic' ? '\u25C6' : '\u25CF'} {rarity}
                      </span>
                      <div className="flex-1 h-px" style={{ backgroundColor: `${rarityColors[rarity]}15` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {rarityFrames.map((frame) => {
                        const isUnlocked = unlockedFrameIds.includes(frame.id) || (frame.achievementId ? unlockedIds.includes(frame.achievementId) : false)
                        const isActive = equippedFrameId === frame.id
                        const styleClass = `frame-style-${frame.style}`
                        return (
                          <motion.button
                            key={frame.id}
                            whileTap={isUnlocked ? { scale: 0.95 } : undefined}
                            onClick={() => isUnlocked && handleEquipFrame(frame.id)}
                            disabled={!isUnlocked}
                            className={`relative p-3 rounded-2xl border text-center transition-all overflow-hidden ${styleClass} ${
                              isActive
                                ? 'bg-discord-dark/90'
                                : isUnlocked
                                  ? 'border-white/10 bg-discord-dark/60 hover:border-white/20'
                                  : 'border-white/[0.06] bg-black/50'
                            }`}
                            style={{
                              borderColor: isActive ? `${frame.color}60` : undefined,
                              boxShadow: isActive
                                ? `0 0 28px ${frame.color}25, inset 0 0 24px ${frame.color}06`
                                : isUnlocked ? undefined : 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                              filter: !isUnlocked ? 'grayscale(0.8) saturate(0.3) brightness(0.6)' : undefined,
                            }}
                          >
                            <div
                              className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300"
                              style={{ background: frame.gradient, opacity: isActive ? 0.12 : isUnlocked ? 0.04 : 0.02 }}
                            />
                            {!isUnlocked && <div className="absolute inset-0 rounded-2xl pointer-events-none bg-black/30" />}

                            {isActive ? (
                              <span
                                className="absolute top-2 right-2 z-10 text-[7px] px-1.5 py-0.5 rounded-md font-bold font-mono uppercase tracking-wider"
                                style={{ backgroundColor: `${frame.color}20`, color: frame.color, border: `1px solid ${frame.color}35` }}
                              >
                                Active
                              </span>
                            ) : !isUnlocked ? (
                              <span className="absolute top-2 right-2 z-10 text-[9px] opacity-60">{'\uD83D\uDD12'}</span>
                            ) : null}

                            <div className="relative mx-auto w-14 h-14 mb-2">
                              <div
                                className="frame-ring absolute -inset-[6px] rounded-xl"
                                style={{
                                  background: frame.gradient,
                                  opacity: isUnlocked ? (isActive ? 0.95 : 0.6) : 0.25,
                                  borderColor: frame.color,
                                  color: frame.color,
                                }}
                              />
                              <div
                                className="frame-avatar relative w-14 h-14 rounded-lg bg-discord-darker flex items-center justify-center text-xl border-2"
                                style={{ borderColor: `${frame.color}${isUnlocked ? 'b0' : '40'}` }}
                              >
                                {isUnlocked ? avatar : <span className="text-gray-600">?</span>}
                              </div>
                            </div>

                            <p className={`text-[11px] font-bold relative ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>{frame.name}</p>
                            <p className="text-[8px] font-mono relative mt-0.5 capitalize" style={{ color: `${frame.color}${isUnlocked ? '80' : '50'}` }}>
                              {frame.style}
                            </p>
                            {!isUnlocked && (
                              <p className="text-[8px] font-mono mt-1 relative text-gray-500/80">{frame.unlockHint}</p>
                            )}
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </motion.div>

            {/* ── Avatars section ── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Avatars</p>
                <p className="text-[9px] text-gray-600 font-mono">{FREE_AVATARS.length + getUnlockedAvatarEmojis().length} available</p>
              </div>

              <div>
                <p className="text-[8px] text-gray-600 font-mono mb-1.5 uppercase tracking-wider">Default</p>
                <div className="flex flex-wrap gap-1.5">
                  {FREE_AVATARS.map((a) => {
                    const isCurrent = avatar === a
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => { void persistProfile(username, a); playClickSound() }}
                        className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all active:scale-90 relative ${
                          isCurrent
                            ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                            : 'bg-discord-dark border border-white/10 hover:border-white/20 hover:bg-discord-dark/80'
                        }`}
                      >
                        {a}
                        {isCurrent && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyber-neon" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="text-[8px] text-gray-600 font-mono mb-1.5 uppercase tracking-wider">Achievements</p>
                <div className="flex flex-wrap gap-1.5">
                  {LOCKED_AVATARS.map((la) => {
                    const isUnlocked = unlockedIds.includes(la.achievementId) || unlockedAvatarSet.has(la.emoji)
                    const isCurrent = avatar === la.emoji
                    return (
                      <div key={la.emoji} className="relative group">
                        <button
                          type="button"
                          onClick={() => { if (!isUnlocked) return; void persistProfile(username, la.emoji); playClickSound() }}
                          disabled={!isUnlocked}
                          className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all relative ${
                            isUnlocked
                              ? isCurrent
                                ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm active:scale-90'
                                : 'bg-discord-dark border border-white/10 hover:border-white/20 hover:bg-discord-dark/80 active:scale-90'
                              : 'bg-discord-dark/30 border border-white/5 cursor-not-allowed'
                          }`}
                        >
                          <span style={{ opacity: isUnlocked ? 1 : 0.15 }}>{la.emoji}</span>
                          {!isUnlocked && (
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] opacity-70">{'\uD83D\uDD12'}</span>
                          )}
                          {isCurrent && isUnlocked && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyber-neon" />}
                        </button>
                        {!isUnlocked && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md bg-discord-darker border border-white/10 text-[8px] text-gray-400 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                            {la.unlockHint}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {bonusAvatars.length > 0 && (
                <div>
                  <p className="text-[8px] text-purple-400/60 font-mono mb-1.5 uppercase tracking-wider">Bonus</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bonusAvatars.map((a) => {
                      const isCurrent = avatar === a
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => { void persistProfile(username, a); playClickSound() }}
                          className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all active:scale-90 relative ${
                            isCurrent
                              ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                              : 'bg-discord-dark border border-purple-500/20 hover:border-purple-500/40'
                          }`}
                          title="Bonus avatar"
                        >
                          {a}
                          {isCurrent && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyber-neon" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Flex Card ─────────────────────────────────────────────────────────────────

function FlexCard({ avatar, username, frameId, equippedBadges, equippedLootItems, unlockedCount, totalSkillLevel,
  onAvatarClick, onUsernameClick, isUsernameEditing, draftUsername, onDraftChange, onDraftSubmit, onDraftCancel, syncButton, onItemInspect,
}: {
  avatar: string
  username: string
  frameId: string | null
  equippedBadges: string[]
  equippedLootItems: { slot: LootSlot; item: (typeof LOOT_ITEMS)[number] }[]
  unlockedCount: number
  totalSkillLevel: number
  onAvatarClick?: () => void
  onUsernameClick?: () => void
  isUsernameEditing?: boolean
  draftUsername?: string
  onDraftChange?: (v: string) => void
  onDraftSubmit?: () => void
  onDraftCancel?: () => void
  syncButton?: React.ReactNode
  onItemInspect?: (itemId: string) => void
}) {
  const gold = useGoldStore((s) => s.gold)
  const killCounts = useArenaStore((s) => s.killCounts)
  const clearedZones = useArenaStore((s) => s.clearedZones)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)

  const [grindStats, setGrindStats] = useState({ totalSessions: 0, totalHours: 0, totalKeys: 0, streak: 0 })

  useEffect(() => {
    const load = async () => {
      const api = window.electronAPI
      if (!api?.db) return
      try {
        const [sessions, seconds, keys, streak] = await Promise.all([
          api.db.getSessionCount?.() ?? 0,
          api.db.getTotalSeconds?.() ?? 0,
          api.db.getTotalKeystrokes?.() ?? 0,
          api.db.getStreak?.() ?? 0,
        ])
        setGrindStats({
          totalSessions: sessions as number,
          totalHours: Math.floor((seconds as number) / 3600),
          totalKeys: keys as number,
          streak: streak as number,
        })
      } catch { /* ignore */ }
    }
    load()
  }, [])

  // Combat stats
  const combat = computePlayerStats(equippedBySlot, permanentStats)
  const totalBossKills = Object.values(killCounts).reduce((a, b) => a + b, 0)

  // Total Item Power
  const totalIP = equippedLootItems.reduce((sum, { item }) => sum + getItemPower(item), 0)

  // Rarest equipped item
  const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic']
  const rarestItem = equippedLootItems.length > 0
    ? equippedLootItems.reduce((best, cur) =>
        rarityOrder.indexOf(cur.item.rarity) > rarityOrder.indexOf(best.item.rarity) ? cur : best
      )
    : null

  const frame = FRAMES.find((f) => f.id === frameId)

  const formatKeys = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-2xl border border-white/10 relative overflow-hidden"
      style={{
        background: frame
          ? `linear-gradient(160deg, ${frame.color}10 0%, rgba(22,23,28,0.97) 50%)`
          : 'linear-gradient(160deg, rgba(0,255,136,0.03) 0%, rgba(22,23,28,0.97) 50%)',
      }}
    >
      {/* Ambient glow */}
      {frame && (
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: `${frame.color}10` }}
        />
      )}

      {/* Top: identity row */}
      <div className="flex items-center gap-3.5 p-4 pb-3 relative">
        {onAvatarClick ? (
          <button type="button" onClick={onAvatarClick} className="relative group shrink-0">
            <AvatarWithFrame
              avatar={avatar}
              frameId={frameId}
              sizeClass="w-14 h-14"
              textClass="text-2xl"
              roundedClass="rounded-xl"
              ringInsetClass="-inset-1"
              ringOpacity={0.9}
            />
            <span className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 text-[10px] text-white/80 font-mono">edit</span>
          </button>
        ) : (
          <AvatarWithFrame
            avatar={avatar}
            frameId={frameId}
            sizeClass="w-14 h-14"
            textClass="text-2xl"
            roundedClass="rounded-xl"
            ringInsetClass="-inset-1"
            ringOpacity={0.9}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isUsernameEditing ? (
              <input
                autoFocus
                value={draftUsername ?? ''}
                onChange={(e) => onDraftChange?.(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onDraftSubmit?.(); if (e.key === 'Escape') onDraftCancel?.() }}
                onBlur={() => onDraftCancel?.()}
                className="text-[13px] font-bold text-white bg-discord-darker/80 border border-cyber-neon/30 rounded-md px-1.5 py-0.5 outline-none focus:border-cyber-neon/60 w-28"
                maxLength={20}
              />
            ) : (
              <button type="button" onClick={onUsernameClick} className="text-[13px] font-bold text-white hover:text-cyber-neon transition-colors cursor-pointer" title="Click to edit">{username}</button>
            )}
            {equippedBadges.map((bid) => {
              const b = BADGES.find((x) => x.id === bid)
              return b ? (
                <span key={bid} className="text-[7px] px-1.5 py-[2px] rounded-md font-semibold border" style={{ borderColor: `${b.color}40`, backgroundColor: `${b.color}15`, color: b.color }}>
                  {b.icon} {b.label}
                </span>
              ) : null
            })}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {frame && (
              <span className="inline-flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded-md border" style={{ color: frame.color, borderColor: `${frame.color}20`, backgroundColor: `${frame.color}06` }}>
                <span className="w-2.5 h-2.5 rounded-[2px] inline-block" style={{ background: frame.gradient, border: `1px solid ${frame.color}50` }} />
                {frame.name}
              </span>
            )}
            {totalIP > 0 && (
              <span className="text-[8px] font-mono text-amber-400/80 px-1.5 py-0.5 rounded-md border border-amber-400/15 bg-amber-400/5">
                {totalIP} IP
              </span>
            )}
            {syncButton && <span className="ml-auto">{syncButton}</span>}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-4 gap-px bg-white/[0.04] mx-4 mb-4 rounded-xl overflow-hidden">
        <StatCell icon={'\u26A1'} value={String(totalSkillLevel)} label="Skill LVL" color="#00FF88" />
        <StatCell icon={'\uD83C\uDFC6'} value={`${unlockedCount}/${ACHIEVEMENTS.length}`} label="Achieves" color="#FACC15" />
        <StatCell icon={'\uD83D\uDD25'} value={grindStats.streak > 0 ? `${grindStats.streak}d` : '-'} label="Streak" color="#FF6B35" />
        <StatCell icon={'\uD83E\uDE99'} value={gold > 0 ? gold.toLocaleString() : '-'} label="Gold" color="#F59E0B" />
        <StatCell icon={'\u23F1\uFE0F'} value={grindStats.totalHours > 0 ? `${grindStats.totalHours}h` : '-'} label="Grind" color="#818CF8" />
        <StatCell icon={'\u2328\uFE0F'} value={grindStats.totalKeys > 0 ? formatKeys(grindStats.totalKeys) : '-'} label="Keys" color="#67E8F9" />
        <StatCell icon={'\u2694\uFE0F'} value={combat.atk > 0 ? `${combat.atk}` : '-'} label="ATK" color="#F87171" />
        <StatCell icon={'\u2764\uFE0F'} value={combat.hp > 0 ? `${combat.hp}` : '-'} label="HP" color="#34D399" />
        <StatCell icon={'\uD83D\uDEE1'} value={combat.def > 0 ? `${combat.def}` : '-'} label="DEF" color="#818CF8" />
      </div>

      {/* Equipped gear strip */}
      {equippedLootItems.length > 0 && (
        <div className="px-4 pb-3 relative">
          <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {equippedLootItems.map(({ slot, item }) => {
              const rt = getRarityTheme(item.rarity)
              return (
                <button
                  type="button"
                  key={slot}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border shrink-0 hover:brightness-125 transition-all active:scale-[0.97] cursor-pointer"
                  style={{ borderColor: `${rt.color}20`, backgroundColor: `${rt.color}06` }}
                  title={`${item.name} (${item.rarity}) \u2014 ${slot}`}
                  onClick={() => onItemInspect?.(item.id)}
                >
                  {item.image
                    ? <img src={item.image} alt="" className="w-4 h-4 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                    : <span className="text-sm leading-none">{item.icon}</span>}
                  <div className="min-w-0 text-left">
                    <p className="text-[9px] font-medium text-white/90 truncate max-w-[65px]">{item.name}</p>
                    <p className="text-[7px] font-mono uppercase" style={{ color: rt.color }}>{item.rarity}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom: kill/dungeon flex */}
      {(totalBossKills > 0 || clearedZones.length > 0) && (
        <div className="px-4 pb-3 flex items-center gap-3 relative">
          {totalBossKills > 0 && (
            <span className="text-[8px] font-mono text-red-400/70 inline-flex items-center gap-1">
              {'\uD83D\uDC80'} {totalBossKills} boss kills
            </span>
          )}
          {clearedZones.length > 0 && (
            <span className="text-[8px] font-mono text-purple-400/70 inline-flex items-center gap-1">
              {'\uD83C\uDFF0'} {clearedZones.length} dungeons cleared
            </span>
          )}
          {rarestItem && (
            <span className="text-[8px] font-mono inline-flex items-center gap-1 ml-auto" style={{ color: getRarityTheme(rarestItem.item.rarity).color }}>
              {'\u2B50'} {rarestItem.item.rarity}
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}

function StatCell({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-2.5 px-1 bg-discord-darker/60">
      <span className="text-[10px] leading-none mb-0.5">{icon}</span>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[7px] font-mono text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ── Next Unlock Tracker ──────────────────────────────────────────────────────

/** Actionable hint for each achievement type */
function getActionHint(achievementId: string, progress: { current: number; target: number }): string {
  const remaining = progress.target - progress.current
  if (achievementId.startsWith('streak_')) return remaining === 1 ? 'Come back tomorrow!' : `${remaining} more days \u2014 keep the streak alive!`
  if (achievementId.startsWith('skill_developer')) return 'Code more to level up Developer'
  if (achievementId.startsWith('skill_designer')) return 'Design work levels up Designer'
  if (achievementId.startsWith('skill_gamer')) return 'Game time levels up Gamer'
  if (achievementId === 'polymath') return `Get ${remaining} more skill${remaining > 1 ? 's' : ''} to LVL 25`
  if (achievementId === 'jack_of_all_trades') return `${remaining} skill${remaining > 1 ? 's' : ''} still below LVL 10`
  if (achievementId.includes('friend')) return remaining === 1 ? 'Add 1 more friend' : `Add ${remaining} more friends`
  if (achievementId === 'social_butterfly') return `${remaining} more friend${remaining > 1 ? 's' : ''} to go`
  if (achievementId.includes('session')) return remaining === 1 ? 'Start 1 more session!' : `${remaining} sessions to go \u2014 start one now!`
  if (achievementId === 'marathon' || achievementId === 'code_warrior') return 'Start a long session to unlock'
  return 'Keep grinding!'
}

function NextUnlockTracker({ unlockedIds, progressCtx }: {
  unlockedIds: string[]
  progressCtx: AchievementProgressContext
}) {
  const candidates = ACHIEVEMENTS
    .filter((a) => !unlockedIds.includes(a.id) && ACHIEVEMENT_COSMETIC_UNLOCKS[a.id])
    .map((a) => {
      const progress = getAchievementProgress(a.id, progressCtx)
      const cosmetic = ACHIEVEMENT_COSMETIC_UNLOCKS[a.id]
      const pct = progress ? Math.min(100, (progress.current / progress.target) * 100) : 0
      return { achievement: a, progress, cosmetic, pct }
    })
    .filter((c) => c.progress && c.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)

  if (candidates.length === 0) return null

  // Highlight the closest one
  const closest = candidates[0]
  const isAlmostThere = closest.pct >= 70

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className={`rounded-xl border p-3 space-y-2.5 ${
        isAlmostThere
          ? 'bg-cyber-neon/[0.03] border-cyber-neon/20'
          : 'bg-discord-card/80 border-white/10'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
          {isAlmostThere ? '\u26A1 Almost there' : 'Next unlocks'}
        </p>
        {isAlmostThere && (
          <span className="text-[8px] font-mono text-cyber-neon/70 animate-pulse">{Math.round(closest.pct)}% complete</span>
        )}
      </div>
      {candidates.map(({ achievement, progress, cosmetic, pct }, i) => {
        const frame = cosmetic.frameId ? FRAMES.find((f) => f.id === cosmetic.frameId) : null
        const badge = cosmetic.badgeId ? BADGES.find((b) => b.id === cosmetic.badgeId) : null
        const rewardColor = frame?.color ?? badge?.color ?? '#00FF88'
        const hint = getActionHint(achievement.id, progress!)
        return (
          <div key={achievement.id} className={`rounded-lg border p-2.5 ${
            i === 0 && isAlmostThere
              ? 'border-cyber-neon/15 bg-cyber-neon/[0.03]'
              : 'border-white/5 bg-discord-darker/40'
          }`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm leading-none">{achievement.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium text-white truncate">{achievement.name}</span>
                  <span className="text-[8px] font-mono tabular-nums" style={{ color: rewardColor }}>{Math.round(pct)}%</span>
                </div>
                <span className="text-[8px] text-gray-500">{progress!.label}</span>
              </div>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden mb-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: `${rewardColor}90` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {frame && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
                    style={{ borderColor: `${frame.color}30`, color: frame.color, backgroundColor: `${frame.color}08` }}>
                    {frame.name} frame
                  </span>
                )}
                {badge && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
                    style={{ borderColor: `${badge.color}30`, color: badge.color, backgroundColor: `${badge.color}08` }}>
                    {badge.icon} {badge.name}
                  </span>
                )}
                {cosmetic.avatarEmoji && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-400">
                    {cosmetic.avatarEmoji} avatar
                  </span>
                )}
              </div>
              <span className="text-[8px] text-gray-500 italic shrink-0">{hint}</span>
            </div>
          </div>
        )
      })}
    </motion.div>
  )
}

// ── Rarity Breakdown ─────────────────────────────────────────────────────────

function RarityBreakdown({ unlockedFrameIds, unlockedBadgeIds }: {
  unlockedFrameIds: string[]
  unlockedBadgeIds: string[]
}) {
  const rarities = ['Rare', 'Epic', 'Legendary'] as const
  const rarityColors: Record<string, string> = { Rare: '#4FC3F7', Epic: '#C084FC', Legendary: '#FFD700' }
  const rarityIcons: Record<string, string> = { Rare: '\u25CF', Epic: '\u25C6', Legendary: '\u2605' }

  const rows = rarities.map((rarity) => {
    const totalFrames = FRAMES.filter((f) => f.rarity === rarity).length
    const ownedFrames = FRAMES.filter((f) => f.rarity === rarity && unlockedFrameIds.includes(f.id)).length
    return { rarity, totalFrames, ownedFrames }
  })

  const totalBadgesOwned = unlockedBadgeIds.length
  const totalBadges = BADGES.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-xl bg-discord-card/80 border border-white/10 p-3 space-y-2.5"
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Collection by rarity</p>

      <div className="space-y-1.5">
        {rows.map(({ rarity, totalFrames, ownedFrames }) => {
          const color = rarityColors[rarity]
          const pct = totalFrames > 0 ? (ownedFrames / totalFrames) * 100 : 0
          return (
            <div key={rarity} className="flex items-center gap-2">
              <span className="text-[8px] font-mono w-[70px] shrink-0" style={{ color: `${color}b0` }}>
                {rarityIcons[rarity]} {rarity}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: `${color}80` }}
                />
              </div>
              <span className="text-[8px] font-mono tabular-nums w-8 text-right" style={{ color: ownedFrames === totalFrames && totalFrames > 0 ? color : '#6B7280' }}>
                {ownedFrames}/{totalFrames}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 pt-0.5 border-t border-white/5">
        <span className="text-[8px] font-mono w-[70px] shrink-0 text-amber-400/80">
          {'\uD83C\uDFC5'} Badges
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${totalBadges > 0 ? (totalBadgesOwned / totalBadges) * 100 : 0}%`, backgroundColor: '#F59E0B80' }}
          />
        </div>
        <span className="text-[8px] font-mono tabular-nums w-8 text-right" style={{ color: totalBadgesOwned === totalBadges && totalBadges > 0 ? '#F59E0B' : '#6B7280' }}>
          {totalBadgesOwned}/{totalBadges}
        </span>
      </div>
    </motion.div>
  )
}
