/**
 * Discord Rich Presence integration.
 *
 * Setup (one-time):
 *   1. Go to https://discord.com/developers/applications → New Application → name it "Grindly"
 *   2. In Rich Presence → Art Assets, upload your logo as asset key "grindly_logo"
 *   3. Copy the Application ID and paste it into GRINDLY_DISCORD_CLIENT_ID below
 *
 * This module connects to the local Discord client over IPC and updates presence
 * whenever the user starts or stops a session. Fails silently when Discord is closed.
 */

import log from './logger'

const GRINDLY_DISCORD_CLIENT_ID = '1485616107736797284'

// ── Types (avoid importing discord-rpc at module level so the app starts even if pkg is missing) ──

interface Activity {
  details?: string
  state?: string
  startTimestamp?: number
  largeImageKey?: string
  largeImageText?: string
  instance?: boolean
  buttons?: { label: string; url: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RPCClient = any

// ── State ──────────────────────────────────────────────────────────────────────

let client: RPCClient = null
let connected = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingActivity: Activity | null = null

// ── Internal helpers ───────────────────────────────────────────────────────────

function clearReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

function scheduleReconnect(delayMs = 20_000) {
  clearReconnect()
  reconnectTimer = setTimeout(connect, delayMs)
}

function connect() {
  if (connected) return
  clearReconnect()

  let Client: new (opts: { transport: string }) => RPCClient
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Client = require('discord-rpc').Client
  } catch {
    // Package not available — silently skip
    return
  }

  const c = new Client({ transport: 'ipc' })
  client = c

  c.on('ready', () => {
    connected = true
    log.info('[Discord RPC] connected')
    if (pendingActivity) {
      try { c.setActivity(pendingActivity) } catch { /* ignore */ }
    }
  })

  // discord-rpc fires 'disconnected' on socket close
  c.on('disconnected', () => {
    connected = false
    client = null
    log.info('[Discord RPC] disconnected — will retry in 20s')
    scheduleReconnect()
  })

  c.login({ clientId: GRINDLY_DISCORD_CLIENT_ID }).catch(() => {
    // Discord not open or RPC not available — retry later
    scheduleReconnect(30_000)
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initDiscordRPC(): void {
  connect()
}

export interface PresenceUpdate {
  status: 'running' | 'idle'
  /** e.g. "Developer" */
  topSkillName?: string
  /** 1–99 */
  topSkillLevel?: number
  /** days */
  streak?: number
  /** ms epoch for elapsed timer */
  startTimestamp?: number
}

export function updateDiscordPresence(data: PresenceUpdate): void {
  if (data.status === 'idle') {
    pendingActivity = null
    if (connected && client) {
      try { client.clearActivity() } catch { /* ignore */ }
    }
    return
  }

  const activity: Activity = {
    largeImageKey: 'grindly_logo',
    largeImageText: 'Grindly — Your work is your grind',
    instance: false,
  }

  if (data.topSkillName && data.topSkillLevel !== undefined) {
    activity.details = `${data.topSkillName}  Lvl.${data.topSkillLevel}`
  } else {
    activity.details = 'Grinding...'
  }

  if (data.streak && data.streak > 0) {
    activity.state = `🔥 ${data.streak}-day streak`
  }

  if (data.startTimestamp) {
    activity.startTimestamp = data.startTimestamp
  }

  activity.buttons = [
    { label: '⬇️ Download Grindly', url: 'https://github.com/lovepsm94/grindly/releases/latest' },
  ]

  pendingActivity = activity

  if (connected && client) {
    try { client.setActivity(activity) } catch { /* ignore */ }
  }
}

export function destroyDiscordRPC(): void {
  clearReconnect()
  connected = false
  if (client) {
    try { client.destroy() } catch { /* ignore */ }
    client = null
  }
}
