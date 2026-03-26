import { useEffect, useState } from 'react'
import { fmt } from '../../lib/format'
import { motion, AnimatePresence } from 'framer-motion'
import { useGuildStore } from '../../stores/guildStore'
import { useAuthStore } from '../../stores/authStore'
import { useGoldStore } from '../../stores/goldStore'
import { searchGuilds, fetchTopGuilds, type Guild } from '../../services/guildService'
import { playClickSound } from '../../lib/sounds'
import { useToastStore } from '../../stores/toastStore'
import { GUILD_BUFFS, getHallDef } from '../../lib/guildBuffs'
import { GuildHall } from './GuildHall'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { parseFriendPresence, formatSessionDurationCompact } from '../../lib/friendPresence'
import { MAX_TOTAL_SKILL_LEVEL, getSkillByName, getSkillActivityLine } from '../../lib/skills'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Guild level derived from total member contributions. Lv.1 at 0g, ~Lv.10 at 81k, caps at 50. */
function calcGuildLevel(totalContrib: number): number {
  return Math.min(50, Math.floor(Math.sqrt(totalContrib / 1000)) + 1)
}

/** XP needed to reach next level (for progress bar). */
function guildLevelRange(level: number): [number, number] {
  const lo = (level - 1) * (level - 1) * 1000
  const hi = level * level * 1000
  return [lo, hi]
}

// ── Create guild modal ────────────────────────────────────────────────────────

function CreateGuildModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  const createGuild = useGuildStore((s) => s.createGuild)
  const isLoading = useGuildStore((s) => s.isLoading)
  const gold = useGoldStore((s) => s.gold)
  const canAfford = gold >= 500
  const pushToast = useToastStore((s) => s.push)

  const handleSubmit = async () => {
    if (name.trim().length < 3) { setError('Name must be 3–30 characters'); return }
    if (tag.trim().length < 2) { setError('Tag must be 2–5 characters'); return }
    const result = await createGuild(name.trim(), tag.trim().toUpperCase(), desc.trim() || undefined)
    if (result.ok) {
      pushToast({ kind: 'generic', message: `Guild [${tag.trim().toUpperCase()}] ${name.trim()} created!`, type: 'success' })
      onClose()
    } else {
      setError(result.error ?? 'Failed to create guild')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[320px] bg-surface-1 border border-white/10 rounded p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-4">Create Guild</p>
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-micro text-gray-500 font-mono uppercase">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guild name (3–30)" maxLength={30}
                className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-surface-0 border border-white/[0.08] text-white text-caption placeholder-gray-600 outline-none focus:border-accent/40" />
            </div>
            <div className="w-20">
              <label className="text-micro text-gray-500 font-mono uppercase">Tag</label>
              <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="TAG" maxLength={5}
                className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-surface-0 border border-white/[0.08] text-white text-caption font-mono placeholder-gray-600 outline-none focus:border-accent/40 uppercase" />
            </div>
          </div>
          <div>
            <label className="text-micro text-gray-500 font-mono uppercase">Description (optional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." maxLength={200} rows={2}
              className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-surface-0 border border-white/[0.08] text-white text-caption placeholder-gray-600 outline-none focus:border-accent/40 resize-none" />
          </div>
          {error && <p className="text-micro text-red-400">{error}</p>}
          {!canAfford && <p className="text-micro text-amber-400">Need 500 🪙 to create a guild (you have {gold})</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded border border-white/15 text-gray-400 text-caption hover:bg-white/5 transition-colors">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={isLoading || !canAfford}
              className="flex-1 py-2 rounded bg-accent/20 border border-accent/40 text-accent text-caption font-semibold hover:bg-accent/30 disabled:opacity-50 transition-colors">
              {isLoading ? '...' : 'Create (500 🪙)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Deposit gold modal ────────────────────────────────────────────────────────

function DepositGoldModal({ maxGold, onClose }: { maxGold: number; onClose: () => void }) {
  const [amount, setAmount] = useState(100)
  const depositGold = useGuildStore((s) => s.depositGold)
  const isLoading = useGuildStore((s) => s.isLoading)
  const pushToast = useToastStore((s) => s.push)

  const handleDeposit = async () => {
    if (amount < 1 || amount > maxGold) return
    const result = await depositGold(amount)
    if (result.ok) {
      pushToast({ kind: 'generic', message: `Donated ${amount}🪙 to guild chest`, type: 'success' })
      onClose()
    } else {
      pushToast({ kind: 'generic', message: result.error ?? 'Failed to donate', type: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[260px] bg-surface-1 border border-white/10 rounded p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-1">Donate to Guild Chest</p>
        <p className="text-micro text-gray-500 mb-3">Your gold: {fmt(maxGold)}🪙</p>
        <div className="flex items-center gap-2 mb-3">
          <button type="button" onClick={() => setAmount((a) => Math.max(1, a - 100))} className="w-8 h-8 rounded border border-white/15 text-gray-300 hover:bg-white/10 transition-colors">−</button>
          <input type="number" min={1} max={maxGold} value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.min(maxGold, Math.floor(Number(e.target.value) || 1))))}
            className="flex-1 text-center bg-surface-0 border border-white/10 rounded text-white text-sm font-bold py-1.5 outline-none focus:border-accent/40" />
          <button type="button" onClick={() => setAmount((a) => Math.min(maxGold, a + 100))} className="w-8 h-8 rounded border border-white/15 text-gray-300 hover:bg-white/10 transition-colors">+</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAmount(maxGold)} className="px-2 py-1 rounded text-micro text-gray-500 border border-white/10 hover:bg-white/5 transition-colors">Max</button>
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded border border-white/15 text-gray-400 text-caption hover:bg-white/5 transition-colors">Cancel</button>
          <button type="button" onClick={handleDeposit} disabled={isLoading || amount < 1 || amount > maxGold}
            className="flex-1 py-2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-400 text-caption font-semibold hover:bg-amber-500/30 disabled:opacity-50 transition-colors">
            {isLoading ? '...' : `Donate ${amount}🪙`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Browse guilds panel ───────────────────────────────────────────────────────

function BrowseGuilds({ onJoin }: { onJoin: (guildId: string) => void }) {
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const isLoading = useGuildStore((s) => s.isLoading)

  useEffect(() => {
    fetchTopGuilds(15).then(setGuilds).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) {
      setLoading(true)
      fetchTopGuilds(15).then(setGuilds).catch(() => {}).finally(() => setLoading(false))
      return
    }
    setLoading(true)
    searchGuilds(query.trim()).then(setGuilds).catch(() => {}).finally(() => setLoading(false))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search guilds..." className="flex-1 px-2.5 py-1.5 rounded bg-surface-0 border border-white/[0.08] text-white text-caption placeholder-gray-600 outline-none focus:border-amber-500/40" />
        <button type="button" onClick={handleSearch} className="px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-micro hover:bg-amber-500/25 transition-colors">Search</button>
      </div>
      {loading ? (
        <p className="text-micro text-gray-600 text-center py-4">Loading…</p>
      ) : guilds.length === 0 ? (
        <p className="text-micro text-gray-600 text-center py-4">No guilds found</p>
      ) : (
        <div className="space-y-1.5">
          {guilds.map((g) => (
            <div key={g.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded border border-white/[0.08] bg-surface-2">
              <div className="w-8 h-8 rounded bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span className="text-micro font-bold font-mono text-amber-400">{g.tag}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption font-semibold text-white truncate">{g.name}</p>
                <p className="text-micro text-gray-500 font-mono">{g.member_count} members · Lv.{calcGuildLevel(g.chest_gold)}</p>
              </div>
              <button type="button" disabled={isLoading} onClick={() => { playClickSound(); onJoin(g.id) }}
                className="px-2.5 py-1 rounded text-micro font-semibold bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors">
                Join
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main GuildTab ─────────────────────────────────────────────────────────────

interface GuildTabProps {
  /** Called when user taps a member row — FriendsPage navigates to their profile. */
  onSelectMember?: (userId: string) => void
}

export function GuildTab({ onSelectMember }: GuildTabProps) {
  const myGuild = useGuildStore((s) => s.myGuild)
  const membership = useGuildStore((s) => s.membership)
  const members = useGuildStore((s) => s.members)
  const pendingInvites = useGuildStore((s) => s.pendingInvites)
  const isLoading = useGuildStore((s) => s.isLoading)
  const fetchMyGuild = useGuildStore((s) => s.fetchMyGuild)
  const hallLevel = useGuildStore((s) => s.hallLevel)
  const joinGuild = useGuildStore((s) => s.joinGuild)
  const leaveGuild = useGuildStore((s) => s.leaveGuild)
  const respondToInvite = useGuildStore((s) => s.respondToInvite)
  const updateTaxRate = useGuildStore((s) => s.updateTaxRate)
  const kickMember = useGuildStore((s) => s.kickMember)
  const promoteMember = useGuildStore((s) => s.promoteMember)
  const demoteMember = useGuildStore((s) => s.demoteMember)
  const user = useAuthStore((s) => s.user)
  const gold = useGoldStore((s) => s.gold)
  const pushToast = useToastStore((s) => s.push)

  const [showCreate, setShowCreate] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [view, setView] = useState<'mine' | 'browse'>('mine')
  const [guildTab, setGuildTab] = useState<'overview' | 'hall'>('overview')
  const [taxInput, setTaxInput] = useState<number | null>(null)
  const [savingTax, setSavingTax] = useState(false)
  const [confirmKick, setConfirmKick] = useState<string | null>(null)
  const [membersExpanded, setMembersExpanded] = useState(false)
  const [showBuffInfo, setShowBuffInfo] = useState(false)
  const [showChest, setShowChest] = useState(false)
  const [showTax, setShowTax] = useState(false)

  useEffect(() => {
    if (user) fetchMyGuild()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll guild invites every 5s + full guild data every 30s
  useEffect(() => {
    if (!user) return
    const inviteId = setInterval(() => { useGuildStore.getState().refreshPendingInvites().catch(() => {}) }, 5_000)
    const guildId  = setInterval(() => { useGuildStore.getState().fetchMyGuild().catch(() => {}) }, 30_000)
    return () => { clearInterval(inviteId); clearInterval(guildId) }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (myGuild && taxInput === null) setTaxInput(myGuild.tax_rate_pct ?? 0)
  }, [myGuild?.tax_rate_pct]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = async (guildId: string) => {
    const result = await joinGuild(guildId)
    if (result.ok) { pushToast({ kind: 'generic', message: 'Joined guild!', type: 'success' }); setView('mine') }
    else pushToast({ kind: 'generic', message: result.error ?? 'Failed to join', type: 'error' })
  }

  const handleLeave = async () => {
    const result = await leaveGuild()
    if (result.ok) { pushToast({ kind: 'generic', message: 'Left guild', type: 'success' }); setConfirmLeave(false) }
  }

  const handleRespondInvite = async (inviteId: string, response: 'accepted' | 'declined') => {
    const result = await respondToInvite(inviteId, response)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed', type: 'error' })
  }

  const handleSaveTax = async () => {
    if (taxInput === null) return
    setSavingTax(true)
    const result = await updateTaxRate(taxInput)
    setSavingTax(false)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed', type: 'error' })
  }

  const handleKick = async (memberId: string) => {
    const result = await kickMember(memberId)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to kick', type: 'error' })
    setConfirmKick(null)
  }

  const handlePromote = async (memberId: string) => {
    const result = await promoteMember(memberId)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to promote', type: 'error' })
  }

  const handleDemote = async (memberId: string) => {
    const result = await demoteMember(memberId)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to demote', type: 'error' })
  }

  const isOwner = membership?.role === 'owner'
  const isOfficer = ['owner', 'officer'].includes(membership?.role ?? '')

  if (!user) return <p className="text-caption text-gray-500 text-center py-6">Log in to use guilds</p>

  // Derived guild stats
  const totalContrib = members.reduce((s, m) => s + (m.contribution_gold ?? 0), 0)
  // Guild power = sum of member total_skill_levels (null members count 0)
  const guildPower = members.reduce((s, m) => s + (m.total_skill_level ?? 0), 0)
  const guildLevel = myGuild ? calcGuildLevel(totalContrib) : 1
  const [lvLo, lvHi] = guildLevelRange(guildLevel)
  const levelPct = lvHi > lvLo ? Math.round(((totalContrib - lvLo) / (lvHi - lvLo)) * 100) : 0
  // Use actual member array length — myGuild.member_count can be stale
  const memberCount = members.length || myGuild?.member_count || 0

  return (
    <div className="space-y-2.5">

      {/* Pending invites */}
      {pendingInvites.length > 0 && !myGuild && (
        <div className="space-y-1.5">
          <p className="text-micro uppercase tracking-widest text-amber-400/60 font-mono px-0.5">Guild Invites</p>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded border border-amber-500/20 bg-amber-500/5">
              <div className="w-8 h-8 rounded bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span className="text-micro font-bold font-mono text-amber-400">{inv.guild_tag}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption font-semibold text-white truncate">{inv.guild_name}</p>
                <p className="text-micro text-gray-500 font-mono">from @{inv.inviter_username}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => handleRespondInvite(inv.id, 'accepted')}
                  className="px-2 py-1 rounded text-micro font-semibold bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors">Accept</button>
                <button type="button" onClick={() => handleRespondInvite(inv.id, 'declined')}
                  className="px-2 py-1 rounded text-micro text-gray-500 border border-white/10 hover:bg-white/5 transition-colors">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No guild */}
      {!myGuild && (
        <>
          <div className="flex gap-2">
            <button type="button" onClick={() => { playClickSound(); setShowCreate(true) }}
              className="flex-1 py-2.5 rounded bg-accent/15 border border-accent/30 text-accent text-caption font-semibold hover:bg-accent/25 transition-colors">
              + Create Guild
            </button>
            <button type="button" onClick={() => { playClickSound(); setView(view === 'browse' ? 'mine' : 'browse') }}
              className={`flex-1 py-2.5 rounded border text-caption font-semibold transition-colors ${view === 'browse' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-white/15 text-gray-400 hover:bg-white/5'}`}>
              Browse Guilds
            </button>
          </div>
          {view === 'browse' && <BrowseGuilds onJoin={handleJoin} />}
          {isLoading && <p className="text-micro text-gray-600 text-center py-2">Loading…</p>}
        </>
      )}

      {/* Has guild */}
      {myGuild && (
        <div className="space-y-2.5">

          {/* ── Guild sub-tabs ── */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => { playClickSound(); setGuildTab('overview') }}
              className={`flex-1 py-1.5 rounded text-micro font-semibold border transition-colors ${guildTab === 'overview' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400'}`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => { playClickSound(); setGuildTab('hall') }}
              className={`flex-1 py-1.5 rounded text-micro font-semibold border transition-colors ${guildTab === 'hall' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400'}`}
            >
              🏰 Hall {getHallDef(hallLevel) ? `Lv.${hallLevel}` : ''}
            </button>
          </div>

          {/* ── Hall tab ── */}
          {guildTab === 'hall' && <GuildHall />}

          {/* ── Overview tab ── */}
          {guildTab === 'overview' && (
          <div className="space-y-2.5">

          {/* ── Guild identity card ── */}
          <div className="rounded-card border border-amber-500/20 bg-surface-2 overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-amber-500/70 via-amber-400/25 to-transparent" />
            <div className="p-3">
              {/* Row 1: tag + name + actions */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded bg-amber-500/12 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(245,158,11,0.10)]">
                  <span className="text-caption font-bold font-mono text-amber-400 tracking-widest">{myGuild.tag}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-white leading-tight">{myGuild.name}</p>
                  {myGuild.description && (
                    <p className="text-micro text-gray-500 mt-0.5 leading-snug truncate">{myGuild.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Buffs ? button */}
                  <button type="button" onClick={() => { playClickSound(); setShowBuffInfo((v) => !v) }} title="Guild buffs"
                    className={`w-5 h-5 rounded-full border text-micro font-bold transition-colors flex items-center justify-center ${showBuffInfo ? 'bg-amber-500/25 border-amber-500/50 text-amber-300' : 'border-white/20 text-gray-500 hover:border-amber-500/40 hover:text-amber-400'}`}>
                    ?
                  </button>
                  {confirmLeave ? (
                    <div className="flex items-center gap-1 ml-1">
                      <button type="button" onClick={handleLeave} disabled={isLoading}
                        className="px-2 py-0.5 rounded text-micro font-semibold border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                        Confirm
                      </button>
                      <button type="button" onClick={() => setConfirmLeave(false)} className="text-micro text-gray-600 hover:text-gray-400 px-1">✕</button>
                    </div>
                  ) : (
                    !isOwner && (
                      <button type="button" onClick={() => { playClickSound(); setConfirmLeave(true) }}
                        className="text-micro text-gray-600 hover:text-red-400 transition-colors font-mono ml-1">
                        leave
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Row 2: guild level + XP bar */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-micro font-mono text-amber-400/60 uppercase tracking-wider">Guild</span>
                    <span className="text-caption font-bold text-amber-400 font-mono">Lv.{guildLevel}</span>
                  </div>
                  <span className="text-micro text-gray-600 font-mono">{fmt(totalContrib)} 🪙 donated total</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-[width] duration-700"
                    style={{ width: `${Math.max(2, levelPct)}%` }} />
                </div>
              </div>

              {/* Row 3: stat chips */}
              <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-white/[0.05]">
                <div className="flex items-center gap-1 text-micro">
                  <span>👥</span>
                  <span className="font-semibold text-white">{memberCount}</span>
                  <span className="text-gray-600">member{memberCount !== 1 ? 's' : ''}</span>
                </div>
                {guildPower > 0 && (
                  <>
                    <span className="text-white/10">·</span>
                    <div className="flex items-center gap-1 text-micro" title="Sum of all members' total skill levels">
                      <span className="text-accent/70">⚔️</span>
                      <span className="font-semibold text-accent">{fmt(guildPower)}</span>
                      <span className="text-gray-600">power</span>
                    </div>
                  </>
                )}
                <span className="text-white/10">·</span>
                <div className="flex items-center gap-1 text-micro">
                  <span className={membership?.role === 'owner' ? 'text-amber-400' : membership?.role === 'officer' ? 'text-blue-400' : 'text-gray-400'}>
                    {membership?.role === 'owner' ? '👑' : membership?.role === 'officer' ? '🔰' : '🛡️'}
                  </span>
                  <span className="text-gray-500 capitalize">{membership?.role ?? 'member'}</span>
                </div>
                {/* Chest gold as a tappable chip */}
                <button type="button" onClick={() => { playClickSound(); setShowChest((v) => !v) }}
                  className="ml-auto flex items-center gap-1 text-micro text-gray-600 hover:text-amber-400 transition-colors font-mono">
                  <span>🪙</span>
                  <span>{fmt(myGuild.chest_gold)}</span>
                  <span className="text-micro">{showChest ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Buffs panel ── */}
          <AnimatePresence>
            {showBuffInfo && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                <div className="rounded-card border border-amber-500/25 bg-amber-500/[0.05] p-3">
                  <p className="text-micro uppercase tracking-widest text-amber-400/60 font-mono mb-2">Active while in a guild</p>
                  <div className="space-y-2">
                    {GUILD_BUFFS.map((buff) => (
                      <div key={buff.id} className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded bg-amber-500/12 border border-amber-500/25 flex items-center justify-center shrink-0">
                          <span className="text-caption">{buff.icon}</span>
                        </div>
                        <div>
                          <p className="text-caption font-semibold text-amber-300 leading-tight">{buff.label}</p>
                          <p className="text-micro text-gray-500">{buff.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Guild chest (collapsible) ── */}
          <AnimatePresence>
            {showChest && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                <div className="rounded-card border border-white/[0.08] bg-surface-2 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-micro uppercase tracking-widest text-gray-500 font-mono">Guild Chest</p>
                      <p className="text-[20px] font-bold text-amber-400 leading-none mt-1">{fmt(myGuild.chest_gold)}<span className="text-xs text-amber-500/60 ml-1 font-normal">g</span></p>
                    </div>
                    <button type="button" onClick={() => { playClickSound(); setShowDeposit(true) }} disabled={gold <= 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-micro font-semibold border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
                      🪙 Donate
                    </button>
                  </div>

                  {/* Tax — owner only, secondary collapsible */}
                  {isOwner && (
                    <div className="border-t border-white/[0.05] pt-2">
                      <button type="button" onClick={() => { playClickSound(); setShowTax((v) => !v) }}
                        className="flex items-center justify-between w-full text-micro text-gray-600 hover:text-gray-400 font-mono transition-colors">
                        <span>AUTO-TAX · {taxInput ?? 0}%</span>
                        <span>{showTax ? '▲' : '▼'}</span>
                      </button>
                      <AnimatePresence>
                        {showTax && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
                            <div className="pt-2 space-y-1.5">
                              <input type="range" min={0} max={15} step={1} value={taxInput ?? 0}
                                onChange={(e) => setTaxInput(Number(e.target.value))}
                                className="w-full h-1 accent-amber-400 cursor-pointer" />
                              <div className="flex justify-between text-micro text-gray-700 font-mono">
                                <span>0% off</span><span className="text-amber-400 font-bold">{taxInput ?? 0}%</span><span>15% max</span>
                              </div>
                              {(taxInput ?? 0) !== (myGuild.tax_rate_pct ?? 0) && (
                                <button type="button" onClick={handleSaveTax} disabled={savingTax}
                                  className="w-full py-1 rounded text-micro font-semibold border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                                  {savingTax ? 'Saving…' : 'Save'}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  {!isOwner && (myGuild.tax_rate_pct ?? 0) > 0 && (
                    <p className="text-micro text-gray-600 font-mono border-t border-white/[0.05] pt-2">
                      Auto-tax: {myGuild.tax_rate_pct}% of your arena gold → chest
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Weekly Goal ── */}
          {myGuild.weekly_goal_progress && Object.keys(myGuild.weekly_goal_progress).length > 0 && (
            <div className="rounded-card border border-white/[0.08] bg-surface-2 p-3 space-y-2.5">
              <p className="text-micro uppercase tracking-widest text-purple-400/70 font-mono">Weekly Goal</p>
              {Object.entries(myGuild.weekly_goal_progress).map(([type, current]) => {
                const targets: Record<string, number> = { craft: 200, kill: 500, farm: 300, gold: 10000 }
                const target = targets[type] ?? 100
                const pct = Math.min(100, (current / target) * 100)
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-micro font-mono">
                      <span className="text-gray-400 capitalize">{type}</span>
                      <span className="text-gray-500">{current}/{target}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Members ── */}
          <div className="space-y-2">
            {(membersExpanded ? members : members.slice(0, 12)).map((m) => {
              const isMe = m.user_id === user?.id
              const canKick = !isMe && m.role !== 'owner' && (isOwner || (isOfficer && m.role === 'member'))
              const canPromote = isOwner && !isMe && m.role === 'member'
              const canDemote = isOwner && !isMe && m.role === 'officer'
              const confirmingKick = confirmKick === m.user_id
              const { activityLabel, appName, sessionStartMs } = parseFriendPresence(m.current_activity ?? null)
              const isLeveling = m.is_online && activityLabel.startsWith('Leveling ')
              const levelingSkillName = isLeveling ? activityLabel.replace('Leveling ', '') : null
              const liveDuration = m.is_online && sessionStartMs ? formatSessionDurationCompact(sessionStartMs, Date.now()) : null
              const hasSyncedSkills = m.skills_sync_status === 'synced'
              const totalSkillDisplay = hasSyncedSkills && m.total_skill_level != null
                ? `${m.total_skill_level}/${MAX_TOTAL_SKILL_LEVEL}`
                : null

              return (
                <div
                  key={m.id}
                  className={`w-full flex items-center gap-3 rounded border p-3 transition-all group ${
                    m.is_online
                      ? 'bg-surface-2/90 border-white/10 hover:border-white/20 hover:-translate-y-[1px]'
                      : 'bg-surface-2/50 border-white/5 opacity-75 hover:opacity-95 hover:-translate-y-[1px]'
                  }`}
                >
                  {/* Clickable left side: avatar + info */}
                  <button
                    type="button"
                    className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:cursor-default"
                    disabled={!onSelectMember}
                    onClick={() => { if (onSelectMember) { playClickSound(); onSelectMember(m.user_id) } }}
                  >
                    {/* Avatar with frame + online dot */}
                    <div className="relative shrink-0 overflow-visible">
                      <AvatarWithFrame
                        avatar={m.avatar_url || '🤖'}
                        frameId={m.equipped_frame}
                        sizeClass="w-10 h-10"
                        textClass="text-lg"
                        roundedClass="rounded-full"
                        ringInsetClass="-inset-0.5"
                        ringOpacity={0.95}
                      />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-2 ${
                        m.is_online ? 'bg-green-500' : 'bg-gray-600'
                      }`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">
                          {m.username ?? (isMe ? (user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'You') : 'Unknown')}
                          {isMe && <span className="text-micro text-gray-600 ml-1 font-mono">(you)</span>}
                        </span>
                        {totalSkillDisplay && (
                          <span className="text-micro text-accent font-mono shrink-0">{totalSkillDisplay}</span>
                        )}
                        {(m.streak_count ?? 0) > 0 && (
                          <span className="text-micro text-orange-400 font-mono shrink-0">🔥{m.streak_count}d</span>
                        )}
                        {/* Role badge */}
                        <span className={`text-micro font-mono px-1 py-0.5 rounded border shrink-0 ${
                          m.role === 'owner' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : m.role === 'officer' ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                          : 'hidden'
                        }`}>
                          {m.role === 'owner' ? '👑 owner' : m.role === 'officer' ? '🔰 officer' : ''}
                        </span>
                      </div>
                      {/* Status / activity */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {m.is_online ? (
                            isLeveling ? (
                              <span className="text-caption text-gray-400">{activityLabel}{liveDuration ? ` • ${liveDuration}` : ''}</span>
                            ) : activityLabel ? (
                              <span className="text-caption text-blue-400 truncate">{activityLabel}</span>
                            ) : (
                              <span className="text-caption text-gray-400">Online</span>
                            )
                          ) : (
                            <span className="text-caption text-gray-600">
                              {m.contribution_gold > 0 ? `+${m.contribution_gold >= 1000 ? `${(m.contribution_gold / 1000).toFixed(1)}k` : m.contribution_gold} 🪙 contributed` : 'Offline'}
                            </span>
                          )}
                        </div>
                        {m.is_online && appName && (() => {
                          const skill = levelingSkillName ? getSkillByName(levelingSkillName) : null
                          const activityLine = getSkillActivityLine(skill?.id ?? null, appName)
                          return (
                            <span className="text-micro text-gray-500 truncate">
                              {activityLine}{liveDuration ? ` • ${liveDuration}` : ''}
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                  </button>

                  {/* Right side: manage buttons */}
                  <div className="shrink-0 flex items-center gap-1">
                    {canPromote && (
                      <button type="button" onClick={() => handlePromote(m.user_id)} title="Promote to officer"
                        className="p-1 text-micro text-blue-400/50 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100">↑</button>
                    )}
                    {canDemote && (
                      <button type="button" onClick={() => handleDemote(m.user_id)} title="Demote to member"
                        className="p-1 text-micro text-gray-600 hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100">↓</button>
                    )}
                    {canKick && (
                      confirmingKick ? (
                        <div className="flex items-center gap-1">
                          <span className="text-micro text-red-400 font-mono">Kick?</span>
                          <button type="button" onClick={() => handleKick(m.user_id)}
                            className="text-micro px-1 py-0.5 rounded border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors">✓</button>
                          <button type="button" onClick={() => setConfirmKick(null)}
                            className="text-micro px-1 py-0.5 rounded border border-white/10 text-gray-500 transition-colors">✕</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmKick(m.user_id)} title="Kick"
                          className="p-1 text-micro text-red-500/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">✕</button>
                      )
                    )}
                  </div>
                </div>
              )
            })}

            {members.length > 12 && (
              <button type="button" onClick={() => setMembersExpanded((v) => !v)}
                className="text-micro text-gray-600 hover:text-gray-400 font-mono transition-colors px-1">
                {membersExpanded ? '▲ show less' : `+ ${members.length - 12} more`}
              </button>
            )}
          </div>

          </div>
          )} {/* end overview tab */}

        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CreateGuildModal onClose={() => setShowCreate(false)} />
          </motion.div>
        )}
        {showDeposit && (
          <motion.div key="deposit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DepositGoldModal maxGold={gold} onClose={() => setShowDeposit(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
