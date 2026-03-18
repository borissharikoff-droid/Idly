# Changelog

All notable changes to Grindly are documented here.

## [4.0.0] - 2026-03-18

### Added

#### Raids — Async Guild Boss System
- **Async Raids v2**: Three raid tiers — Quick (2d), Standard (5d), Epic (7d) — each with kill/craft/farm/cook objectives and escalating rewards (epic → legendary → mythic chests + gold)
- **Phase system**: each raid progresses through phases (Scouting → Assault → Final Push) with a visual phase indicator and boss HP bar
- **Party HP**: raids track shared party HP; boss deals daily damage to party HP; raid fails if HP hits 0
- **Role-based daily actions**: Tank = Defend (halves boss damage), Healer = Heal Party (consume items), DPS = Attack
- **HealModal**: healer selects consumables from inventory to restore party HP
- **Gate system**: some phases require specific gate items (rare materials) to unlock; gate display shown in UI
- **Raid invites**: invite friends to your active raid from the Friends tab; pending invites shown in a dedicated panel
- **Death screen**: stylized failure screen with cause of death and retry prompt
- **Raid countdown bar**: ambient bar on Home page shows tier, current phase, HP% during active raid
- **Raid party panel**: inline party management inside the Raids tab

#### Guild Hall — Collective Upgrade System
- **Guild Hall**: 10-level shared building collectively upgraded by donating materials
- **Hall levels 1–10**: Wooden Shack → Celestial Spire; each level has a name, material requirements, gold cost, and build timer
- **Buff scaling**: XP bonus (5%→30%), Gold bonus (5%→30%), Chest drop bonus (0→+20%), Craft speed (-0→-25%), Farm yield (0→+15%) — all scale with hall level
- **Hall sub-tab**: Overview / 🏰 Hall Lv.X switcher in the Guild tab; shows buff status, next-level tooltip, material progress bars, Donate / Donate All, build timer

#### Party System
- **Persistent Party**: create or join a party; stays active across all game activities
- **Party HUD**: slim bar at the top of the app showing member avatars, roles, and "+5% XP" buff indicator
- **Party XP buff**: +5% to all skill XP when in a party with 2+ members (stacks with guild buff → up to +10%)
- **Party roles**: Tank 🛡 / Healer 💚 / DPS ⚔ — each member sets their own role; persisted to Supabase
- **Party tab in Friends**: "Party" button opens PartyPanel — create/disband/leave, invite friends, role selector

#### Guild System
- **Guild invites**: invite friends directly from FriendProfile (officer+ only); accepted via pending invites panel
- **Guild tax**: owner sets 0–15% tax rate; auto-deducted from arena gold on kills; routed to guild chest
- **Guild passive buffs**: +5% XP and +5% gold while in a guild (scales with Hall level)
- **Guild XP buff info**: "?" button in guild header toggles a buff info card with all active bonuses
- **Member management**: kick, promote to officer, demote to member (role-restricted actions)
- **Weekly goal progress** with per-member contribution tracking and top contributors leaderboard

#### Arena — New Zones
- **Zone 7 — Shadow Crypt** (warrior lvl 55): Skeleton Archer, Zombie Knight, Lich Apprentice; boss: Necromancer Lord (HP 6500, ATK 20, DEF 13); drops `shadow_dust` + `lich_crystal`; entry: dragon_scale ×2 + dragon_heart ×1
- **Zone 8 — Celestial Spire** (warrior lvl 75): Sky Serpent, Thunder Drake, Storm Elemental; boss: Storm Titan (HP 10,000, ATK 28, DEF 18); drops `storm_shard` + `titan_core` (mythic); entry: lich_crystal ×2 + troll_heart ×1
- **4 new crafting sets**: Lich Set (zone 7) and Titan Set (zone 8) — full gear sets craftable from zone materials
- **Dungeon Map**: visual 4-room chain (mob1→mob2→mob3→BOSS) with animated active room, ✓ completed rooms, and accumulated gold display
- **Arena zone cards redesign**: 64×64 boss portrait with radial glow, power match bar (Ready/Caution/Danger), entry cost with owned count, full-width Enter button
- **Power indicator**: color-coded ATK vs boss ATK comparison (✓ green / ~ yellow / ✗ red)

#### Marketplace 2.0
- **Price sparkline**: SVG price history chart in buy confirmation modal; shows trending green/red
- **Floor price badge**: 🏷 cheapest listing per item highlighted in the order book
- **Floor price in listing modal**: fetches recent sold prices on open; one-tap "Use floor" to pre-fill
- **Quick List button** ⚡: amber overlay on each item in Sell tab — fetches floor, opens modal pre-filled at floor−1g
- **Deduplication**: items now shown as one row per unique item (floor price); clicking opens an Offers modal with all price tiers and Buy buttons per tier

#### Social & Friends
- **Activity Feed**: live feed of friend boss kills, achievements, and rare drops (powered by `friend_activity` Supabase table)
- **Game categorization fix**: 80+ game process names now correctly identified (WoW, PoE, Elden Ring, FFXIV, BG3, Destiny 2, Apex Legends, EFT, Warframe, Rocket League, + 70 more)
- **Smart activity verbs**: friends' status now shows "Playing World of Warcraft", "Coding in VS Code", "Designing in Figma", "Listening to Spotify" instead of "Playing: <raw process>"
- **Display name fixes**: `PathOfExileSteam` → "Path of Exile", `r5apex` → "Apex Legends", `wow` → "World of Warcraft" etc.
- **Unknown app presence fix**: apps with unrecognized categories now show "Online" instead of "Leveling Researcher"

#### Navigation & UI Structure
- **Lucide icon library**: replaced all emoji nav icons and page header icons with clean Lucide SVG icons
- **Bottom nav labels**: all 5 primary nav tabs now have text labels + icons
- **Full-width tab bar**: bottom nav spans the full app width with consistent spacing
- **More menu** (···): secondary tabs (Marketplace, Settings, Profile, Quests) accessible via expandable menu
- **Quests tab**: Daily Bounties + Weekly Challenges moved from Arena into a dedicated Quests page inside Profile
- **Ambient activity bar**: row of chips on Home showing farm ready count, craft/cook job status; tapping navigates to the respective tab

#### Hot Zone & Weekly Challenges
- **Hot Zone Weekly Rotation**: one zone/week gets 2× gold + 2× drops + +1 chest tier; deterministic weekly rotation; banner with pulsing orange glow + "LIVE" badge
- **Daily Bounties**: 3 daily craft/farm/cook tasks with gold + chest rewards; claimable badge in nav
- **Weekly Challenges**: 4 weekly challenges (craft/farm/cook/kill); resets Monday UTC; countdown timer
- **Food run multipliers**: food items grant `goldBonusPct` and `dropBonusPct` per combat run

#### Crafting & Cooking
- **Queue list**: ActiveJob (craft) and CookingStation show numbered list of queued jobs below active progress bar
- **Crafter perk**: craft speed bonus from Crafter skill level

#### Farm & Items
- **Farm XP rebalance**: XP normalized proportionally — rare seeds give more XP/second than wheat (was inverted)
- **Boss chest upgrades**: Zone 4 (Orc Warlord) + Zone 5 (Troll Overlord) upgraded to legendary chest drops

#### Profile & Stats
- **Personal Records card**: best streak (all-time), longest focus block, longest session
- **Profile tabs**: Quests 📋 / Achievements 🏆 / Cosmetics ✨; default = Quests; claimable badge on tab
- **Item comparison in inspect modal**: shows ATK/HP/DEF/Regen delta vs currently equipped item (green = upgrade, red = downgrade)
- **Settings accordion**: open/closed state persisted to localStorage

### Fixed
- **Heal item refund**: unused heal items correctly returned to inventory on session end
- **Raid attack deduplication**: concurrent attack button presses no longer register double hits
- **Weekly claim order**: challenge claims process in correct order
- **Party re-render loops**: eliminated Zustand selector patterns causing infinite re-render cycles
- **Marketplace modal overlay**: pointer events no longer blocked during open/close animation
- **Arena toast**: removed stale `setResultModal` call with wrong field names
- **Tribute modal**: shows "owned N" instead of confusing ×N count; "burn" label added
- **ProfilePage badge fix**: removed dead `setUnlockedBadgeIds` call that caused ReferenceError on achievement unlock
- **Stats page**: no longer shows "Focus quality is low" warning on fresh install with 0 sessions
- **RLS recursion**: eliminated cross-table RLS infinite recursion in `raid_participants` and `raids` policies

### Changed
- Arena zone cards: complete visual redesign with portraits, glow, power bars
- Boss chest tiers: Zone 4 epic → legendary, Zone 5 epic → legendary
- Crafting intermediates: reduced craft times (essence_vial 120s→15s, ancient_dust 150s→15s, void_fragment 240s→20s)
- Entry cost for Zone 6: orchids ×3 → ×2
- `other` XP multiplier: 0.6 → 0.75

---

## [3.6.0] - earlier

Previous release on main branch.
