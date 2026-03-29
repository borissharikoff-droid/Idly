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
    version: '4.6.0',
    date: '2026-03-29',
    title: 'Group Chats & Item Skins',
    items: [
      { type: 'new',     text: 'Group chats: create groups, invite friends, send messages, roll dice (🎲 0–100)' },
      { type: 'new',     text: 'Friends page redesign: Friends / Groups tabs, unread indicators, last message preview' },
      { type: 'new',     text: 'Group reactions, member avatars, kick/leave/delete with 2-click confirmation' },
      { type: 'new',     text: '20 new item skins: Lich Set, Titan Set, Wolf Fang Pendant, Warlord Gauntlets, 3 Raid items, Zone 7–8 materials, Wilted Plant' },
      { type: 'ui',      text: 'Character panel: item icons are larger and clearer' },
      { type: 'ui',      text: 'Arena requirements section is now collapsible' },
      { type: 'balance', text: 'Auto-farm: death penalty no longer voids mob gold earned mid-run' },
      { type: 'fix',     text: 'Dungeon boss loot: switching tabs mid-dungeon no longer bypasses the chest-open animation' },
      { type: 'fix',     text: 'Level cap: XP bar no longer shows NaN at level 99' },
      { type: 'fix',     text: 'Legendary chest was showing epic chest image — fixed' },
      { type: 'fix',     text: 'isAutoRunning no longer persists after a crash (auto-mode can\'t get stuck)' },
      { type: 'fix',     text: 'clear_all_zones achievement target corrected (6 → 8 zones)' },
      { type: 'fix',     text: 'What\'s New modal now only appears after daily login claim completes' },
    ],
  },
  {
    version: '4.5.0',
    date: '2026-03-27',
    title: 'Daily login claim flow fix',
    items: [
      { type: 'fix', text: 'Daily login: calendar closes before showing loot window — no more overlapping modals' },
      { type: 'fix', text: '"Awesome!" button closes loot overlay cleanly' },
    ],
  },
  {
    version: '4.4.0',
    date: '2026-03-27',
    title: 'Daily login rewards, font scale & email OTP',
    items: [
      { type: 'new', text: 'Daily login rewards calendar — 30-day streak with gold, items & chests' },
      { type: 'new', text: 'Font scale presets — compact / default / comfortable / large in Settings' },
      { type: 'new', text: 'Email OTP authentication with server-side login rate limiting' },
      { type: 'fix', text: 'Cook! button now navigates to cooking progress after starting a recipe' },
      { type: 'fix', text: 'Level-locked recipes show "Next" instead of "Cook!" in the modal' },
      { type: 'fix', text: 'Raids menu: warrior level & skill count now correctly calculated' },
      { type: 'fix', text: 'Gold display: replaced all g suffixes with 🪙 coin icon' },
      { type: 'fix', text: 'Inventory cards: text overflow in XL font mode' },
      { type: 'ui',  text: 'BottomNav, context menu, popup positioning fixed for XL font mode' },
    ],
  },
  {
    version: '4.3.0',
    date: '2026-03-25',
    title: 'Discord RPC, comeback reward & design system',
    items: [
      { type: 'new', text: 'Discord Rich Presence — shows current activity, session timer, skill icon' },
      { type: 'new', text: 'Comeback reward — bonus chest after 3+ days away' },
      { type: 'fix', text: 'Chat bubbles no longer collapse to word-per-line width' },
      { type: 'fix', text: 'Inventory context menu opens left when near right screen edge' },
      { type: 'fix', text: 'Inventory grid: text overflow in XL font mode fixed' },
      { type: 'ui',  text: 'Design system pass — unified surface palette and spacing' },
    ],
  },
  {
    version: '4.2.1',
    date: '2026-03-23',
    title: 'Onboarding tour, new mascot & patch note fix',
    items: [
      { type: 'new', text: 'Interactive onboarding tour — GRIND → chest drops → equip → arena → stop session' },
      { type: 'new', text: 'Primary Skills widget on Home shows XP bars for skills picked in onboarding' },
      { type: 'ui',  text: 'New mascot art across all screens (auth, welcome banner, onboarding)' },
      { type: 'ui',  text: 'Tray, taskbar and notification icons updated with new mascot' },
      { type: 'fix', text: 'Patch notes now correctly appear in the bell after an update' },
      { type: 'fix', text: 'Mascot no longer stretches — fixed aspect ratio with object-contain' },
    ],
  },
  {
    version: '4.2.0',
    date: '2026-03-22',
    title: 'Onboarding, Party Crafting & Visual Overhaul',
    items: [
      { type: 'new', text: 'Onboarding wizard — pick your skills and daily goal on first launch' },
      { type: 'new', text: 'Interactive tutorial — guided session → chest → equip → arena walkthrough' },
      { type: 'new', text: 'Primary Skills widget on Home showing XP progress for your picked skills' },
      { type: 'new', text: 'Party Crafting — start a craft session with your party, share XP on completion' },
      { type: 'ui', text: 'Visual design system unified — surface palette, Discord accent, 4px radius everywhere' },
      { type: 'ui', text: 'New mascot art updated across all screens' },
      { type: 'balance', text: 'Crafting XP rebalanced — higher level items give proportionally more XP' },
      { type: 'balance', text: 'Crafting times cut 5-10× for high-level recipes' },
      { type: 'fix', text: 'Progression loop: Zone 4 chest balanced, wheat removed from craft gate recipes' },
      { type: 'fix', text: 'Party invite reliability improved (Supabase REPLICA IDENTITY FULL + 15s polling)' },
    ],
  },
  {
    version: '4.1.1',
    date: '2026-03-19',
    title: 'AFK status + better skill detection',
    items: [
      { type: 'fix', text: 'Friends now see "AFK" when you\'re idle 3+ min — even outside a session' },
      { type: 'ui', text: 'Communicator: Zoom, Skype, Signal, Viber now tracked' },
      { type: 'ui', text: 'Developer: Postman, DBeaver, DataGrip, GitKraken and more now tracked' },
      { type: 'ui', text: 'Creator: CapCut, Filmora, Lightroom, Inkscape now tracked' },
      { type: 'ui', text: 'Learner: Logseq, Zotero, Calibre + 15 new learning sites now tracked' },
    ],
  },
  {
    version: '4.1.0',
    date: '2026-03-19',
    title: 'Craft-to-dungeon progression loop',
    items: [
      { type: 'new', text: 'Crafted items now gate zone access (Iron Helm → Zone 2, Lich Ring → Zone 7, etc.)' },
      { type: 'new', text: 'Zone 1 boss drops Iron Ore ×2 — natural source for Zone 2 gear' },
      { type: 'new', text: 'Recipe cards show 🏰 badge when item unlocks a dungeon zone' },
      { type: 'new', text: 'Arena: missing gate items show "Craft →" button to jump to Craft tab' },
      { type: 'fix', text: 'Party invites now arrive in real-time (Supabase Realtime fix)' },
    ],
  },
  {
    version: '4.0.0',
    date: '2026-03-18',
    title: 'Raids, Guild Hall & Party System',
    items: [
      { type: 'new', text: 'Party System — create a party, invite friends, get +5% XP buff' },
      { type: 'new', text: 'Party HUD — slim bar showing members, roles & buff indicator' },
      { type: 'new', text: 'Raid roles: Tank (halves boss damage), Healer (restore party HP), DPS (attack)' },
      { type: 'new', text: 'Guild Hall — 10-level shared building with XP/gold/craft/farm buffs' },
      { type: 'new', text: 'Guild Hall: donate materials collectively to unlock upgrades' },
      { type: 'new', text: 'Guild invites from friend profiles (officer+); pending invites panel' },
      { type: 'new', text: 'Guild tax (0–15%) auto-routes arena gold to guild chest' },
      { type: 'new', text: 'Async guild raids: Quick/Standard/Epic tiers with leaderboards' },
      { type: 'new', text: 'Zone 7 — Shadow Crypt (lv 55): undead mobs, Necromancer Lord boss' },
      { type: 'new', text: 'Zone 8 — Celestial Spire (lv 75): celestial mobs, Storm Titan boss' },
      { type: 'new', text: 'Craft-to-dungeon gates: Zone 2 / 7 / 8 locked behind crafted items' },
      { type: 'new', text: 'Weekly Challenges: 4 weekly kill/craft/farm/cook goals with rewards' },
      { type: 'new', text: 'Marketplace: price sparklines, floor price badge, quick-list button' },
      { type: 'new', text: 'Friends: Activity Feed — real-time boss kills, achievements, rare drops' },
      { type: 'new', text: 'Stats: Personal Records card (best streak, longest focus block)' },
      { type: 'ui', text: 'Arena zone cards: boss portrait, power match bar, gradient Enter button' },
      { type: 'ui', text: 'Dungeon: death modal with gold/item lost info; forfeit warning' },
      { type: 'ui', text: 'Home: ambient activity bar (farm ready, craft/cook job status chips)' },
      { type: 'ui', text: 'Inventory: item comparison shows ATK/HP/DEF delta vs equipped' },
      { type: 'ui', text: 'Settings accordion: open/closed state persisted' },
      { type: 'fix', text: 'Profile: fixed ReferenceError on achievement unlock' },
      { type: 'fix', text: 'Stats: no false "Focus quality low" warning on fresh install' },
      { type: 'balance', text: '80+ games added to recognition list (WoW, PoE2, BG3, EFT, and more)' },
    ],
  },
  {
    version: '3.8.0',
    date: '2026-03-17',
    title: 'Quests tab, Marketplace 2.0 & Guild',
    items: [
      { type: 'new', text: 'Dedicated Quests tab (📋) in Profile — Daily Bounties + Weekly Challenges' },
      { type: 'new', text: 'Weekly Challenges: 4 seeded tasks (craft/farm/cook/kill) reset Monday' },
      { type: 'new', text: 'Guild system: create/join guilds, guild chest, weekly goal, activity log' },
      { type: 'new', text: 'Guild member management: kick, promote to officer, demote' },
      { type: 'new', text: 'Guild XP & gold buffs (+5% each) when in a guild' },
      { type: 'new', text: 'Marketplace: price sparklines, floor price badge on listings' },
      { type: 'new', text: 'Marketplace Browse: one row per item (floor price); Offers modal for tiers' },
      { type: 'ui', text: 'Craft & Cook: numbered queue list below active job progress bar' },
      { type: 'ui', text: 'Arena: power indicator (✓/~/✗) vs boss ATK on zone cards' },
      { type: 'ui', text: 'Hot Zone banner now pulses with orange glow + "LIVE" badge' },
      { type: 'fix', text: 'Arena toast: removed stale victory modal call with wrong field names' },
    ],
  },
  {
    version: '3.7.0',
    date: '2026-03-16',
    title: 'Economy rebalance, Hot Zone & Bounties',
    items: [
      { type: 'new', text: 'Hot Zone: weekly rotation giving 2× gold, 2× drops, +1 chest tier' },
      { type: 'new', text: 'Daily Bounties: 3 seeded craft/farm/cook tasks with gold + chest rewards' },
      { type: 'new', text: 'Food run multipliers: food grants goldBonusPct and dropBonusPct per run' },
      { type: 'balance', text: 'Farming XP normalized — rare seeds now give more XP/sec than wheat' },
      { type: 'balance', text: 'Zone 4 & 5 boss chests upgraded to legendary' },
      { type: 'balance', text: 'Crafting times reduced for intermediate recipes (essence_vial, fang_dagger, etc.)' },
      { type: 'balance', text: 'Zone 6 entry cost: orchids ×3 → ×2' },
      { type: 'balance', text: 'Other category XP multiplier: 0.6 → 0.75' },
    ],
  },
  {
    version: '3.6.0',
    date: '2026-03-14',
    title: 'New arena zones & cooking polish',
    items: [
      { type: 'new', text: '4 new arena zones: Slime Dungeon, Wolf Forest, Troll Cavern, Dragon Lair' },
      { type: 'new', text: 'Login with username (in addition to email)' },
      { type: 'new', text: 'Escape key closes modals (arena result, streak, what\'s new)' },
      { type: 'ui', text: 'Cooking: confetti, shake, golden flash & ring burn animations' },
      { type: 'ui', text: 'Cooking: rarity-scaled completion sounds + error/discovery sounds' },
      { type: 'ui', text: 'Auth screen: animated sign-in ↔ sign-up transition' },
      { type: 'fix', text: 'Arena victory gold not being awarded in some cases' },
      { type: 'fix', text: 'Navbar icons now display correctly when set via dashboard' },
    ],
  },
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
