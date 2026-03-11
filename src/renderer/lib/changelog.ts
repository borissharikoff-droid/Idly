// ── Patch Notes / Changelog ──────────────────────────────────────────────────
// Add new entries at the TOP of the array for each release.

export type ChangeType = 'new' | 'fix' | 'balance' | 'ui'

export interface ChangeEntry {
  type: ChangeType
  text: string
}

export interface PatchNote {
  version: string
  date: string          // YYYY-MM-DD
  title: string         // short release name
  items: ChangeEntry[]
}

export const CHANGE_TYPE_META: Record<ChangeType, { label: string; color: string; icon: string }> = {
  new:     { label: 'New',     color: '#22c55e', icon: '✦' },
  fix:     { label: 'Fix',     color: '#f87171', icon: '✓' },
  balance: { label: 'Balance', color: '#fbbf24', icon: '⚖' },
  ui:      { label: 'UI',      color: '#60a5fa', icon: '◎' },
}

export const CHANGELOG: PatchNote[] = [
  {
    version: '3.5.0',
    date: '2026-03-12',
    title: 'Cooking, DEF stat & QoL',
    items: [
      { type: 'new', text: 'Cooking system — Recipes, Cauldron discovery & Mastery stars' },
      { type: 'new', text: 'DEF stat on all body armor (scales by rarity)' },
      { type: 'new', text: 'Defense Potion — permanent +1 DEF consumable' },
      { type: 'new', text: 'Death Insurance — craftable ward that prevents item loss on death' },
      { type: 'new', text: 'Dungeon Pass — craftable consumable for auto-farm runs' },
      { type: 'new', text: 'Patch notes in notification bell — see what changed after updates' },
      { type: 'fix', text: 'Cook-complete toast now appears correctly' },
      { type: 'fix', text: 'Auto-battle no longer stops after boss kill on Arena tab' },
      { type: 'ui', text: 'Seed Cabinet entrance animation' },
      { type: 'ui', text: 'Farm rot indicator now shows actual rot % chance' },
      { type: 'ui', text: 'Profile tab orange badge for unclaimed rewards' },
      { type: 'ui', text: 'Cook modal pinned footer — Cook button always visible' },
      { type: 'balance', text: 'Plant combat buffs now include DEF (Apples, Orchids, Crystal Root)' },
    ],
  },
  {
    version: '3.4.2',
    date: '2026-03-10',
    title: 'Auto-farm fix, death rebalance',
    items: [
      { type: 'fix', text: 'Auto-farm now persists correctly across tab switches' },
      { type: 'balance', text: 'Death penalty rebalanced for dungeons' },
      { type: 'fix', text: 'Streak sync reliability improvements' },
    ],
  },
  {
    version: '3.4.1',
    date: '2026-03-09',
    title: 'Boss chest & auto-battle fix',
    items: [
      { type: 'fix', text: 'Boss chest claim now works correctly' },
      { type: 'fix', text: 'Auto-battle state persists after app restart' },
    ],
  },
  {
    version: '3.4.0',
    date: '2026-03-08',
    title: 'Quests, FlexCard profile, cosmetics',
    items: [
      { type: 'new', text: 'Daily & weekly quest system' },
      { type: 'new', text: 'FlexCard profile redesign' },
      { type: 'ui', text: 'Cosmetics polish across all pages' },
    ],
  },
]

/** Get the latest patch note. */
export function getLatestPatch(): PatchNote {
  return CHANGELOG[0]
}

/** Get the current app version. */
export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
}

declare const __APP_VERSION__: string
