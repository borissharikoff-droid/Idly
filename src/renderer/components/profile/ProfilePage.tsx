import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ACHIEVEMENTS, getAchievementProgress, type AchievementProgressContext } from '../../lib/xp'
import { computeTotalSkillLevel, skillLevelFromXP, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import type { AchievementDef } from '../../lib/xp'
import { useAlertStore } from '../../stores/alertStore'
import { playClickSound } from '../../lib/sounds'
import { detectPersona } from '../../lib/persona'
import { BADGES, FRAMES, FREE_AVATARS, LOCKED_AVATARS, ACHIEVEMENT_COSMETIC_UNLOCKS, getUnlockedFrames, getEquippedFrame, equipFrame, getUnlockedAvatarEmojis, unlockCosmeticsFromAchievement, ensureCosmeticsForUnlockedAchievements } from '../../lib/cosmetics'
import { syncCosmeticsToSupabase } from '../../services/supabaseSync'
import { PageHeader } from '../shared/PageHeader'
import { User } from '../../lib/icons'
import { InlineSuccess } from '../shared/InlineSuccess'
import { getEquippedPerkRuntime, getItemPower, getRarityTheme, LOOT_ITEMS, CHEST_DEFS, RARITY_COLORS, type LootSlot, type ChestType, type LootItemDef, type BonusMaterial } from '../../lib/loot'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { getDailyActivities, getWeeklyActivities } from '../../services/dailyActivityService'
import { QuestsSection } from '../quests/QuestsSection'
import { DailyLoginTrigger, DailyLoginCalendar } from '../quests/DailyLoginCalendar'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { ItemInspectModal } from '../shared/ItemInspectModal'
import { useBountyStore } from '../../stores/bountyStore'
import { useWeeklyStore } from '../../stores/weeklyStore'
import { hotZoneResetsInDays } from '../../lib/hotZone'
import { useNavigationStore } from '../../stores/navigationStore'
import { useGuildStore } from '../../stores/guildStore'

type ProfileTab = 'quests' | 'achievements' | 'cosmetics'

export function ProfilePage({ onBack }: { onBack?: () => void }) {
  const inventory = useInventoryStore((s) => s.items)
  const chests = useInventoryStore((s) => s.chests)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)

  const { user } = useAuthStore()
  const pushAlert = useAlertStore((s) => s.push)
  const myGuildTag = useGuildStore((s) => s.myGuild?.tag ?? null)

  // Profile data
  const [username, setUsername] = useState('Grindly')
  const [avatar, setAvatar] = useState('🤖')
  const [originalUsername, setOriginalUsername] = useState('Grindly')
  const [originalAvatar, setOriginalAvatar] = useState('🤖')
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false)
  const [profileEditTab, setProfileEditTab] = useState<'avatar' | 'frame'>('avatar')
  const [isUsernameEditing, setIsUsernameEditing] = useState(false)
  const [draftUsername, setDraftUsername] = useState('Grindly')

  // Stats
  const [totalSkillLevel, setTotalSkillLevel] = useState(0)
  const [_persona, setPersona] = useState<{ emoji: string; label: string; description: string } | null>(null)

  // Achievements
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])
  const [claimedIds, setClaimedIds] = useState<string[]>([])

  // Cosmetics
  const [equippedFrameId, setEquippedFrameId] = useState<string | null>(null)
  const [unlockedFrameIds, setUnlockedFrameIds] = useState<string[]>([])

  // Achievement progress context (for "Next Unlock" tracker)
  const [progressCtx, setProgressCtx] = useState<AchievementProgressContext>({
    totalSessions: 0, streakCount: 0, friendCount: 0, skillLevels: {},
  })

  // Tab — respect profileInitialTab from navigationStore (set by other pages)
  const profileInitialTab = useNavigationStore((s) => s.profileInitialTab)
  const setProfileInitialTab = useNavigationStore((s) => s.setProfileInitialTab)
  const initialTabApplied = useRef(false)
  const [activeTab, setActiveTab] = useState<ProfileTab>('quests')
  useEffect(() => {
    if (!initialTabApplied.current && profileInitialTab) {
      initialTabApplied.current = true
      setActiveTab(profileInitialTab as ProfileTab)
      setProfileInitialTab(null)
    }
  }, [profileInitialTab, setProfileInitialTab])

  // Bounty chest modal
  const [bountyModal, setBountyModal] = useState<{
    chestType: ChestType; item: LootItemDef | null; goldDropped: number; bonusMaterials: BonusMaterial[]
  } | null>(null)

  // Daily bounties
  const bounties = useBountyStore((s) => s.bounties)
  const ensureToday = useBountyStore((s) => s.ensureToday)
  const claimBounty = useBountyStore((s) => s.claimBounty)
  useEffect(() => { ensureToday() }, [ensureToday])

  // Weekly challenges
  const weeklyBounties = useWeeklyStore((s) => s.bounties)
  const ensureThisWeek = useWeeklyStore((s) => s.ensureThisWeek)
  const claimWeekly = useWeeklyStore((s) => s.claimWeekly)
  useEffect(() => { ensureThisWeek() }, [ensureThisWeek])
  const weeklyDaysLeft = useMemo(() => hotZoneResetsInDays(), [])

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
      void Promise.resolve(supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single()).then(({ data }) => {
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
    setEquippedFrameId(getEquippedFrame())
    setUnlockedFrameIds(getUnlockedFrames())
    ensureInventoryHydrated()
  }, [user])

  // Sync equipped loot to Supabase when Profile opens (so friends see loadout right away)
  useEffect(() => {
    if (!supabase || !user) return
    ensureInventoryHydrated()
    const equippedLoot = useInventoryStore.getState().equippedBySlot
    const perk = getEquippedPerkRuntime(equippedLoot)
    syncCosmeticsToSupabase([], getEquippedFrame(), {
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
    setUnlockedFrameIds(getUnlockedFrames())
  }, [unlockedIds])

  useEffect(() => {
    setDraftUsername(username)
  }, [username])

  useEffect(() => {
    setIsProfileEditOpen(false)
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
    setUnlockedFrameIds(getUnlockedFrames())
    pushAlert(def)
  }

  const handleClaimAll = () => {
    const claimable = ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id) && !claimedIds.includes(a.id))
    if (claimable.length === 0) return
    playClickSound()
    const updated = [...claimedIds, ...claimable.map((a) => a.id)]
    setClaimedIds(updated)
    localStorage.setItem('grindly_claimed_achievements', JSON.stringify(updated))
    for (const def of claimable) unlockCosmeticsFromAchievement(def.id)
    setUnlockedFrameIds(getUnlockedFrames())
    // Show alerts for up to 3 achievements to avoid flooding
    claimable.slice(0, 3).forEach((def) => pushAlert(def))
  }

  const persistCosmeticsToSupabase = (frame: string | null) => {
    if (!supabase || !user) return
    const statusTitle = equippedLootItems.find((entry) => entry.item.slot === 'ring')?.item.perkType === 'status_title'
      ? String(equippedLootItems.find((entry) => entry.item.slot === 'ring')?.item.perkValue ?? '')
      : null
    syncCosmeticsToSupabase([], frame, {
      equippedLoot: equippedBySlot as Record<string, string>,
      statusTitle,
    }).catch(() => {})
  }

  const handleEquipFrame = (frameId: string) => {
    playClickSound()
    const newFrame = frameId === 'none' || equippedFrameId === frameId ? null : frameId
    equipFrame(newFrame)
    setEquippedFrameId(newFrame)
    persistCosmeticsToSupabase(newFrame)
  }

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

  const [inspectItemId, setInspectItemId] = useState<string | null>(null)
  const inspectItem = inspectItemId ? (LOOT_ITEMS.find((x) => x.id === inspectItemId) ?? null) : null
  const [showDailyLogin, setShowDailyLogin] = useState(false)

  return (
    <div
      className="p-4 pb-20 space-y-4 overflow-auto"
    >
      {/* Header */}
      <PageHeader title="Profile" icon={<User className="w-4 h-4 text-indigo-400" />} onBack={onBack} />

      {/* Flex Card — single source of truth for profile display */}
      <FlexCard
        avatar={profileLoaded ? avatar : '\uD83E\uDD16'}
        username={profileLoaded ? (username || 'Grindly') : 'Loading...'}
        frameId={equippedFrameId}
        equippedLootItems={equippedLootItems}
        unlockedCount={unlockedCount}
        totalSkillLevel={totalSkillLevel}
        onAvatarClick={() => { playClickSound(); setIsProfileEditOpen((v) => !v); setProfileEditTab('avatar') }}
        onUsernameClick={() => { playClickSound(); setIsUsernameEditing(true); setDraftUsername(username) }}
        isUsernameEditing={isUsernameEditing}
        draftUsername={draftUsername}
        onDraftChange={setDraftUsername}
        onDraftSubmit={applyDraftUsername}
        onDraftCancel={() => { setDraftUsername(username); setIsUsernameEditing(false) }}
        onItemInspect={(itemId) => { playClickSound(); setInspectItemId(itemId) }}
        syncButton={null}
        guildTag={myGuildTag}
      />

      <ItemInspectModal item={inspectItem} onClose={() => setInspectItemId(null)} />

      {isProfileEditOpen && (
        <div className="rounded-card border border-accent/20 bg-surface-2/95 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/[0.07]">
            {(['avatar', 'frame'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { playClickSound(); setProfileEditTab(tab) }}
                className={`flex-1 py-2 text-caption font-semibold transition-colors capitalize ${
                  profileEditTab === tab
                    ? 'text-accent bg-accent/10 border-b-2 border-accent'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab === 'avatar' ? '🤖 Avatar' : '🖼️ Frame'}
              </button>
            ))}
          </div>

          {/* Avatar picker */}
          {profileEditTab === 'avatar' && (
            <div className="p-3 space-y-2">
              <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Choose avatar</p>
              <div className="flex flex-wrap gap-1.5">
                {FREE_AVATARS.map((a) => (
                  <button type="button" key={a}
                    onClick={() => { void persistProfile(username, a); setIsProfileEditOpen(false); playClickSound() }}
                    className={`w-9 h-9 rounded text-lg flex items-center justify-center transition-all active:scale-90 ${
                      avatar === a ? 'bg-accent/20 border-2 border-accent' : 'bg-surface-1 border border-white/10 hover:border-white/20'
                    }`}
                  >{a}</button>
                ))}
                {LOCKED_AVATARS.map((la) => {
                  const isUnlocked = unlockedIds.includes(la.achievementId) || unlockedAvatarSet.has(la.emoji)
                  return (
                    <button type="button" key={la.emoji}
                      onClick={() => { if (!isUnlocked) return; void persistProfile(username, la.emoji); setIsProfileEditOpen(false); playClickSound() }}
                      disabled={!isUnlocked}
                      title={isUnlocked ? la.emoji : la.unlockHint}
                      className={`w-9 h-9 rounded text-lg flex items-center justify-center transition-all relative ${
                        isUnlocked
                          ? avatar === la.emoji ? 'bg-accent/20 border-2 border-accent active:scale-90' : 'bg-surface-1 border border-white/10 hover:border-white/20 active:scale-90'
                          : 'bg-surface-1/50 border border-white/5 cursor-not-allowed'
                      }`}
                    >
                      <span style={{ opacity: isUnlocked ? 1 : 0.25 }}>{la.emoji}</span>
                      {!isUnlocked && <span className="absolute inset-0 flex items-center justify-center text-micro">🔒</span>}
                    </button>
                  )
                })}
                {bonusAvatars.map((a) => (
                  <button type="button" key={a}
                    onClick={() => { void persistProfile(username, a); setIsProfileEditOpen(false); playClickSound() }}
                    className={`w-9 h-9 rounded text-lg flex items-center justify-center transition-all active:scale-90 ${
                      avatar === a ? 'bg-accent/20 border-2 border-accent' : 'bg-surface-1 border border-white/10 hover:border-white/20'
                    }`}
                  >{a}</button>
                ))}
              </div>
            </div>
          )}

          {/* Frame picker */}
          {profileEditTab === 'frame' && (
            <div className="p-3 space-y-2">
              <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Choose frame</p>
              <div className="grid grid-cols-4 gap-2">
                {/* No frame option */}
                <button type="button"
                  onClick={() => { handleEquipFrame('none'); setIsProfileEditOpen(false) }}
                  className={`flex flex-col items-center gap-1 p-2 rounded border transition-all ${
                    !equippedFrameId ? 'border-accent/50 bg-accent/10' : 'border-white/10 hover:border-white/20 bg-surface-1'
                  }`}
                >
                  <div className="w-10 h-10 rounded bg-surface-0 flex items-center justify-center text-lg border border-white/10">{avatar}</div>
                  <span className="text-micro font-mono text-gray-500">None</span>
                </button>
                {FRAMES.map((frame) => {
                  const isUnlocked = unlockedFrameIds.includes(frame.id) || (frame.achievementId ? unlockedIds.includes(frame.achievementId) : false)
                  const isActive = equippedFrameId === frame.id
                  return (
                    <button type="button" key={frame.id}
                      onClick={() => { if (!isUnlocked) return; handleEquipFrame(frame.id); setIsProfileEditOpen(false) }}
                      disabled={!isUnlocked}
                      className={`flex flex-col items-center gap-1 p-2 rounded border transition-all relative ${
                        isActive ? 'border-white/30 bg-surface-1' : isUnlocked ? 'border-white/10 hover:border-white/20 bg-surface-1' : 'border-white/[0.06] bg-black/30 cursor-not-allowed'
                      }`}
                      style={{ borderColor: isActive ? `${frame.color}60` : undefined }}
                    >
                      {!isUnlocked && <div className="absolute inset-0 rounded flex items-center justify-center bg-black/40 text-xs">🔒</div>}
                      <div className="relative w-10 h-10">
                        <div className="absolute -inset-[4px] rounded" style={{ background: frame.gradient, opacity: isUnlocked ? 0.7 : 0.2 }} />
                        <div className="relative w-10 h-10 rounded bg-surface-0 flex items-center justify-center text-lg border-2" style={{ borderColor: `${frame.color}${isUnlocked ? 'b0' : '30'}` }}>
                          {isUnlocked ? avatar : <span className="text-gray-600 text-sm">?</span>}
                        </div>
                      </div>
                      <span className="text-micro font-mono truncate w-full text-center" style={{ color: isUnlocked ? frame.color : '#4b5563' }}>{frame.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {saving && (
        <p className="text-xs text-center text-accent/80 font-mono">Saving...</p>
      )}

      {message && (
        message.type === 'ok'
          ? <InlineSuccess message={message.text} className="justify-self-center text-center" />
          : <p className="text-xs text-center text-red-500">{message.text}</p>
      )}

      {/* Daily Login Reward — always visible above tabs */}
      <DailyLoginTrigger onClick={() => setShowDailyLogin(true)} />
      {showDailyLogin && <DailyLoginCalendar onClose={() => setShowDailyLogin(false)} />}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-surface-0/50 rounded p-1">
        {([
          { id: 'quests' as const, label: 'Quests', icon: '📋' },
          { id: 'achievements' as const, label: `Achievements`, icon: '🏆' },
          { id: 'cosmetics' as const, label: 'Cosmetics', icon: '✨' },
        ]).map(tab => {
          const claimableQ = bounties.filter((b) => !b.claimed && b.progress >= b.targetCount).length + weeklyBounties.filter((b) => !b.claimed && b.progress >= b.targetCount).length
          const claimableA = hasClaimableQuest
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); playClickSound() }}
              className={`relative flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-surface-2 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
              {tab.id === 'quests' && claimableQ > 0 && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-lime-400" />
              )}
              {tab.id === 'achievements' && claimableA && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
              )}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* QUESTS TAB */}
        {activeTab === 'quests' && (
          <motion.div
            key="quests"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {/* Daily Bounties */}
            <div>
              <p className="text-caption uppercase tracking-widest text-gray-500 font-mono mb-2 px-1">Daily</p>
              {bounties.length === 0 ? (
                <p className="text-xs text-gray-600 font-mono px-1">Generating bounties…</p>
              ) : (
                <div className="space-y-2">
                  {[...bounties].sort((a, b) => {
                    const rank = (x: typeof a) => (!x.claimed && x.progress >= x.targetCount) ? 0 : !x.claimed ? 1 : 2
                    return rank(a) - rank(b)
                  }).map((b) => {
                    const done = b.progress >= b.targetCount
                    const pct = Math.min(100, (b.progress / b.targetCount) * 100)
                    const typeIcon = b.type === 'craft' ? '⚒️' : b.type === 'farm' ? '🌱' : '🍳'
                    return (
                      <div key={b.id} className={`rounded-lg border px-4 py-3 transition-all ${
                        b.claimed ? 'border-white/[0.05] opacity-40' :
                        done ? 'border-lime-500/30 bg-lime-500/[0.06]' :
                        'border-white/[0.08] bg-surface-2/60'
                      }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">{typeIcon}</span>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold leading-tight ${b.claimed ? 'text-gray-500' : 'text-white'}`}>{b.description}</p>
                              <p className="text-caption text-gray-500 mt-0.5">+{b.goldReward} 🪙{b.chestReward && <> · <span style={{ color: RARITY_COLORS[CHEST_DEFS[b.chestReward as ChestType].rarity].color }}>{b.chestReward.replace('_chest', ' chest')}</span></>}</p>
                            </div>
                          </div>
                          {b.claimed && <span className="text-lime-500 text-base shrink-0">✓</span>}
                          {done && !b.claimed && (
                            <button
                              type="button"
                              onClick={() => {
                                claimBounty(b.id)
                                if (b.chestReward) {
                                  const result = openChestAndGrantItem(b.chestReward, { source: 'bounty_reward' })
                                  if (result) {
                                    const itemDef = result.itemId ? LOOT_ITEMS.find((x) => x.id === result.itemId) ?? null : null
                                    setBountyModal({ chestType: b.chestReward!, item: itemDef, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
                                  }
                                }
                              }}
                              className="shrink-0 px-3 py-1.5 rounded text-xs font-bold bg-lime-500/20 border border-lime-500/40 text-lime-400 hover:bg-lime-500/30 transition-colors"
                            >Claim</button>
                          )}
                        </div>
                        {!b.claimed && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: done ? '#84cc16' : '#6366f1' }} />
                            </div>
                            <span className="text-caption text-gray-500 font-mono shrink-0">{b.progress}/{b.targetCount}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Weekly Challenges */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-caption uppercase tracking-widest text-amber-400/80 font-mono">Weekly</p>
                <span className="text-caption text-gray-600 font-mono">resets in {weeklyDaysLeft}d</span>
              </div>
              {weeklyBounties.length === 0 ? (
                <p className="text-xs text-gray-600 font-mono px-1">Generating challenges…</p>
              ) : (
                <div className="space-y-2">
                  {[...weeklyBounties].sort((a, b) => {
                    const rank = (x: typeof a) => (!x.claimed && x.progress >= x.targetCount) ? 0 : !x.claimed ? 1 : 2
                    return rank(a) - rank(b)
                  }).map((b) => {
                    const done = b.progress >= b.targetCount
                    const pct = Math.min(100, (b.progress / b.targetCount) * 100)
                    const typeIcon = b.type === 'craft' ? '⚒️' : b.type === 'farm' ? '🌱' : b.type === 'cook' ? '🍳' : '⚔️'
                    return (
                      <div key={b.id} className={`rounded-lg border px-4 py-3 transition-all ${
                        b.claimed ? 'border-white/[0.05] opacity-40' :
                        done ? 'border-amber-500/30 bg-amber-500/[0.05]' :
                        'border-white/[0.08] bg-surface-2/60'
                      }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">{typeIcon}</span>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold leading-tight ${b.claimed ? 'text-gray-500' : 'text-white'}`}>{b.description}</p>
                              <p className="text-caption text-gray-500 mt-0.5">+{b.goldReward} 🪙{b.chestReward && <> · <span style={{ color: RARITY_COLORS[CHEST_DEFS[b.chestReward as ChestType].rarity].color }}>{b.chestReward.replace('_chest', ' chest')}</span></>}</p>
                            </div>
                          </div>
                          {b.claimed && <span className="text-amber-500 text-base shrink-0">✓</span>}
                          {done && !b.claimed && (
                            <button
                              type="button"
                              onClick={() => {
                                claimWeekly(b.id)
                                if (b.chestReward) {
                                  const result = openChestAndGrantItem(b.chestReward, { source: 'bounty_reward' })
                                  if (result) {
                                    const itemDef = result.itemId ? LOOT_ITEMS.find((x) => x.id === result.itemId) ?? null : null
                                    setBountyModal({ chestType: b.chestReward!, item: itemDef, goldDropped: result.goldDropped, bonusMaterials: result.bonusMaterials })
                                  }
                                }
                              }}
                              className="shrink-0 px-3 py-1.5 rounded text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors"
                            >Claim</button>
                          )}
                        </div>
                        {!b.claimed && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: done ? '#f59e0b' : '#6366f1' }} />
                            </div>
                            <span className="text-caption text-gray-500 font-mono shrink-0">{b.progress}/{b.targetCount}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <ChestOpenModal
              open={bountyModal !== null}
              chestType={bountyModal?.chestType ?? null}
              item={bountyModal?.item ?? null}
              goldDropped={bountyModal?.goldDropped ?? 0}
              bonusMaterials={bountyModal?.bonusMaterials ?? []}
              onClose={() => setBountyModal(null)}
            />
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
            <NextUnlockTracker unlockedIds={unlockedIds} progressCtx={progressCtx} />
            <QuestsSection
              unlockedIds={unlockedIds}
              claimedIds={claimedIds}
              onClaimAchievement={handleClaim}
              onClaimAll={handleClaimAll}
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
              className="rounded-card bg-surface-2/80 border border-white/10 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Collection</p>
                <p className="text-micro text-gray-600 font-mono">
                  {unlockedFrameIds.length + getUnlockedAvatarEmojis().length} / {FRAMES.length + LOCKED_AVATARS.length} unlocked
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((unlockedFrameIds.length + getUnlockedAvatarEmojis().length) / (FRAMES.length + LOCKED_AVATARS.length)) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  className="h-full rounded-full bg-gradient-to-r from-accent/70 via-purple-400/70 to-yellow-400/70"
                />
              </div>
              <div className="flex gap-4 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent/60" />
                  <span className="text-micro text-gray-500 font-mono">
                    <span className="text-accent font-semibold">{unlockedFrameIds.length}</span>/{FRAMES.length} Frames
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-400/60" />
                  <span className="text-micro text-gray-500 font-mono">
                    <span className="text-purple-400 font-semibold">{getUnlockedAvatarEmojis().length}</span>/{LOCKED_AVATARS.length} Avatars
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ── Rarity Breakdown ── */}
            <RarityBreakdown unlockedFrameIds={unlockedFrameIds} />

            {/* ── Frames section ── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-card bg-surface-2/80 border border-white/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Avatar Frames</p>
                <p className="text-micro text-gray-600 font-mono">{unlockedFrameIds.length}/{FRAMES.length} unlocked</p>
              </div>

              {(['Rare', 'Epic', 'Legendary'] as const).map((rarity) => {
                const rarityFrames = FRAMES.filter((f) => f.rarity === rarity)
                if (rarityFrames.length === 0) return null
                const rarityColors: Record<string, string> = { Rare: '#4FC3F7', Epic: '#C084FC', Legendary: '#FFD700' }
                return (
                  <div key={rarity} className="space-y-2">
                    <div className="flex items-center gap-2 px-0.5">
                      <span className="text-micro font-bold uppercase tracking-widest" style={{ color: `${rarityColors[rarity]}90` }}>
                        {rarity === 'Legendary' ? '\u2605' : rarity === 'Epic' ? '\u25C6' : '\u25CF'} {rarity}
                      </span>
                      <div className="flex-1 h-px" style={{ backgroundColor: `${rarityColors[rarity]}15` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
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
                            className={`relative p-3 rounded border text-center transition-all overflow-hidden ${styleClass} ${
                              isActive
                                ? 'bg-surface-1/90'
                                : isUnlocked
                                  ? 'border-white/10 bg-surface-1/60 hover:border-white/20'
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
                              className="absolute inset-0 rounded pointer-events-none transition-opacity duration-300"
                              style={{ background: frame.gradient, opacity: isActive ? 0.12 : isUnlocked ? 0.04 : 0.02 }}
                            />
                            {!isUnlocked && <div className="absolute inset-0 rounded pointer-events-none bg-black/30" />}

                            {isActive ? (
                              <span
                                className="absolute top-2 right-2 z-10 text-[7px] px-1.5 py-0.5 rounded-md font-bold font-mono uppercase tracking-wider"
                                style={{ backgroundColor: `${frame.color}20`, color: frame.color, border: `1px solid ${frame.color}35` }}
                              >
                                Active
                              </span>
                            ) : !isUnlocked ? (
                              <span className="absolute top-2 right-2 z-10 text-micro opacity-60">{'\uD83D\uDD12'}</span>
                            ) : null}

                            <div className="relative mx-auto w-14 h-14 mb-2">
                              <div
                                className="frame-ring absolute -inset-[6px] rounded"
                                style={{
                                  background: frame.gradient,
                                  opacity: isUnlocked ? (isActive ? 0.95 : 0.6) : 0.25,
                                  borderColor: frame.color,
                                  color: frame.color,
                                }}
                              />
                              <div
                                className="frame-avatar relative w-14 h-14 rounded bg-surface-0 flex items-center justify-center text-xl border-2"
                                style={{ borderColor: `${frame.color}${isUnlocked ? 'b0' : '40'}` }}
                              >
                                {isUnlocked ? avatar : <span className="text-gray-600">?</span>}
                              </div>
                            </div>

                            <p className={`text-caption font-bold relative ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>{frame.name}</p>
                            <p className="text-micro font-mono relative mt-0.5 capitalize" style={{ color: `${frame.color}${isUnlocked ? '80' : '50'}` }}>
                              {frame.style}
                            </p>
                            {!isUnlocked && (
                              <p className="text-micro font-mono mt-1 relative text-gray-500/80">{frame.unlockHint}</p>
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
              className="rounded-card bg-surface-2/80 border border-white/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Avatars</p>
                <p className="text-micro text-gray-600 font-mono">{FREE_AVATARS.length + getUnlockedAvatarEmojis().length} available</p>
              </div>

              <div>
                <p className="text-micro text-gray-600 font-mono mb-1.5 uppercase tracking-wider">Default</p>
                <div className="flex flex-wrap gap-1.5">
                  {FREE_AVATARS.map((a) => {
                    const isCurrent = avatar === a
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => { void persistProfile(username, a); playClickSound() }}
                        className={`w-10 h-10 rounded text-lg flex items-center justify-center transition-all active:scale-90 relative ${
                          isCurrent
                            ? 'bg-accent/20 border-2 border-accent'
                            : 'bg-surface-1 border border-white/10 hover:border-white/20 hover:bg-surface-1/80'
                        }`}
                      >
                        {a}
                        {isCurrent && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="text-micro text-gray-600 font-mono mb-1.5 uppercase tracking-wider">Achievements</p>
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
                          className={`w-10 h-10 rounded text-lg flex items-center justify-center transition-all relative ${
                            isUnlocked
                              ? isCurrent
                                ? 'bg-accent/20 border-2 border-accent active:scale-90'
                                : 'bg-surface-1 border border-white/10 hover:border-white/20 hover:bg-surface-1/80 active:scale-90'
                              : 'bg-surface-1/30 border border-white/5 cursor-not-allowed'
                          }`}
                        >
                          <span style={{ opacity: isUnlocked ? 1 : 0.15 }}>{la.emoji}</span>
                          {!isUnlocked && (
                            <span className="absolute inset-0 flex items-center justify-center text-micro opacity-70">{'\uD83D\uDD12'}</span>
                          )}
                          {isCurrent && isUnlocked && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
                        </button>
                        {!isUnlocked && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-surface-0 border border-white/10 text-micro text-gray-400 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
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
                  <p className="text-micro text-purple-400/60 font-mono mb-1.5 uppercase tracking-wider">Bonus</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bonusAvatars.map((a) => {
                      const isCurrent = avatar === a
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => { void persistProfile(username, a); playClickSound() }}
                          className={`w-10 h-10 rounded text-lg flex items-center justify-center transition-all active:scale-90 relative ${
                            isCurrent
                              ? 'bg-accent/20 border-2 border-accent'
                              : 'bg-surface-1 border border-purple-500/20 hover:border-purple-500/40'
                          }`}
                          title="Bonus avatar"
                        >
                          {a}
                          {isCurrent && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
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

function FlexCard({ avatar, username, frameId, equippedLootItems, unlockedCount, totalSkillLevel,
  onAvatarClick, onUsernameClick, isUsernameEditing, draftUsername, onDraftChange, onDraftSubmit, onDraftCancel, syncButton, onItemInspect, guildTag,
}: {
  avatar: string
  username: string
  frameId: string | null
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
  guildTag?: string | null
}) {

  const [grindStats, setGrindStats] = useState({ totalSessions: 0, totalHours: 0, streak: 0 })

  useEffect(() => {
    const load = async () => {
      const api = window.electronAPI
      if (!api?.db) return
      try {
        const [sessions, seconds, streak] = await Promise.all([
          api.db.getSessionCount?.() ?? 0,
          api.db.getTotalSeconds?.() ?? 0,
          api.db.getStreak?.() ?? 0,
        ])
        setGrindStats({
          totalSessions: sessions as number,
          totalHours: Math.floor((seconds as number) / 3600),
          streak: streak as number,
        })
      } catch { /* ignore */ }
    }
    load()
  }, [])

  // Total Item Power
  const totalIP = equippedLootItems.reduce((sum, { item }) => sum + getItemPower(item), 0)

  const frame = FRAMES.find((f) => f.id === frameId)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-card border border-white/10 relative overflow-hidden"
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
      <div className="flex items-center gap-4 p-4 pb-3 relative">
        <AvatarWithFrame
          avatar={avatar}
          frameId={frameId}
          sizeClass="w-20 h-20"
          textClass="text-4xl"
          roundedClass="rounded-lg"
          ringInsetClass="-inset-1.5"
          ringOpacity={0.9}
        />
        {/* Edit button — top right */}
        {onAvatarClick && (
          <button
            type="button"
            onClick={onAvatarClick}
            title="Edit avatar & frame"
            className="absolute top-3 right-3 p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.07] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {isUsernameEditing ? (
              <input
                autoFocus
                value={draftUsername ?? ''}
                onChange={(e) => onDraftChange?.(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onDraftSubmit?.(); if (e.key === 'Escape') onDraftCancel?.() }}
                onBlur={() => onDraftCancel?.()}
                className="text-[15px] font-bold text-white bg-surface-0/80 border border-accent/30 rounded px-1.5 py-0.5 outline-none focus:border-accent/60 w-36"
                maxLength={20}
              />
            ) : (
              <button type="button" onClick={onUsernameClick} className="text-[15px] font-bold text-white hover:text-accent transition-colors cursor-pointer" title="Click to edit">{username}</button>
            )}
            {guildTag && (
              <span className="text-micro px-1.5 py-[1px] rounded font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400" title={`Guild: ${guildTag}`}>
                [{guildTag}]
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {totalIP > 0 && (
              <span className="text-caption font-mono text-amber-400 px-2 py-0.5 rounded border border-amber-400/20 bg-amber-400/8">
                ⚔️ {totalIP} IP
              </span>
            )}
            {grindStats.totalSessions > 0 && (
              <span className="text-caption font-mono text-gray-400">{grindStats.totalSessions} sessions</span>
            )}
            {syncButton && <span className="ml-auto">{syncButton}</span>}
          </div>
        </div>
      </div>

      {/* Stat grid — 4 key stats */}
      <div className="grid grid-cols-4 gap-px bg-white/[0.04] mx-4 mb-4 rounded overflow-hidden">
        <StatCell icon="⚡" value={`${totalSkillLevel}/${MAX_TOTAL_SKILL_LEVEL}`} label="Skill LVL" color="#00FF88" />
        <StatCell icon="🏆" value={`${unlockedCount}/${ACHIEVEMENTS.length}`} label="Achieve" color="#FACC15" />
        <StatCell icon="🔥" value={grindStats.streak > 0 ? `${grindStats.streak}d` : '-'} label="Streak" color="#FF6B35" />
        <StatCell icon="⏱️" value={grindStats.totalHours > 0 ? `${grindStats.totalHours}h` : '-'} label="Grind" color="#818CF8" />
      </div>


    </motion.div>
  )
}

function StatCell({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-3 px-1 bg-surface-0/60">
      <span className="text-sm leading-none mb-1">{icon}</span>
      <span className="text-body font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-micro font-mono text-gray-500 uppercase tracking-wider mt-0.5">{label}</span>
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
      className={`rounded border p-3 space-y-2.5 ${
        isAlmostThere
          ? 'bg-accent/[0.03] border-accent/20'
          : 'bg-surface-2/80 border-white/10'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">
          {isAlmostThere ? '\u26A1 Almost there' : 'Next unlocks'}
        </p>
        {isAlmostThere && (
          <span className="text-micro font-mono text-accent/70 animate-pulse">{Math.round(closest.pct)}% complete</span>
        )}
      </div>
      {candidates.map(({ achievement, progress, cosmetic, pct }, i) => {
        const frame = cosmetic.frameId ? FRAMES.find((f) => f.id === cosmetic.frameId) : null
        const badge = cosmetic.badgeId ? BADGES.find((b) => b.id === cosmetic.badgeId) : null
        const rewardColor = frame?.color ?? badge?.color ?? '#00FF88'
        const hint = getActionHint(achievement.id, progress!)
        return (
          <div key={achievement.id} className={`rounded border p-2.5 ${
            i === 0 && isAlmostThere
              ? 'border-accent/15 bg-accent/[0.03]'
              : 'border-white/5 bg-surface-0/40'
          }`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm leading-none">{achievement.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-micro font-medium text-white truncate">{achievement.name}</span>
                  <span className="text-micro font-mono tabular-nums" style={{ color: rewardColor }}>{Math.round(pct)}%</span>
                </div>
                <span className="text-micro text-gray-500">{progress!.label}</span>
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
                  <span className="text-micro font-mono px-1.5 py-0.5 rounded border"
                    style={{ borderColor: `${frame.color}30`, color: frame.color, backgroundColor: `${frame.color}08` }}>
                    {frame.name} frame
                  </span>
                )}
                {badge && (
                  <span className="text-micro font-mono px-1.5 py-0.5 rounded border"
                    style={{ borderColor: `${badge.color}30`, color: badge.color, backgroundColor: `${badge.color}08` }}>
                    {badge.icon} {badge.name}
                  </span>
                )}
                {cosmetic.avatarEmoji && (
                  <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-400">
                    {cosmetic.avatarEmoji} avatar
                  </span>
                )}
              </div>
              <span className="text-micro text-gray-500 italic shrink-0">{hint}</span>
            </div>
          </div>
        )
      })}
    </motion.div>
  )
}

// ── Rarity Breakdown ─────────────────────────────────────────────────────────

function RarityBreakdown({ unlockedFrameIds }: {
  unlockedFrameIds: string[]
}) {
  const rarities = ['Rare', 'Epic', 'Legendary'] as const
  const rarityColors: Record<string, string> = { Rare: '#4FC3F7', Epic: '#C084FC', Legendary: '#FFD700' }
  const rarityIcons: Record<string, string> = { Rare: '\u25CF', Epic: '\u25C6', Legendary: '\u2605' }

  const rows = rarities.map((rarity) => {
    const totalFrames = FRAMES.filter((f) => f.rarity === rarity).length
    const ownedFrames = FRAMES.filter((f) => f.rarity === rarity && unlockedFrameIds.includes(f.id)).length
    return { rarity, totalFrames, ownedFrames }
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-card bg-surface-2/80 border border-white/10 p-3 space-y-2.5"
    >
      <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Collection by rarity</p>

      <div className="space-y-1.5">
        {rows.map(({ rarity, totalFrames, ownedFrames }) => {
          const color = rarityColors[rarity]
          const pct = totalFrames > 0 ? (ownedFrames / totalFrames) * 100 : 0
          return (
            <div key={rarity} className="flex items-center gap-2">
              <span className="text-micro font-mono w-[70px] shrink-0" style={{ color: `${color}b0` }}>
                {rarityIcons[rarity]} {rarity}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: `${color}80` }}
                />
              </div>
              <span className="text-micro font-mono tabular-nums w-8 text-right" style={{ color: ownedFrames === totalFrames && totalFrames > 0 ? color : '#6B7280' }}>
                {ownedFrames}/{totalFrames}
              </span>
            </div>
          )
        })}
      </div>

    </motion.div>
  )
}
