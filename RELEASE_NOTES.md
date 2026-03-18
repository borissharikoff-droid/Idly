## What's new in v3.8.1

**New:**
- Raids v2: complete endgame raid system — 3-phase boss fights (Normal / ⚠ Enraged / 🔥 Berserk), boss ATK scales ×1.0/×1.4/×1.8 per phase
- Raid entry gates: requires all 8 zones cleared, warrior level threshold, 4+ skills at required level, and tribute gear burn
- Party system: invite friends to your active raid directly from the Friends tab (new Raid Party panel)
- Raid invites: send/accept/decline invites from the RaidsTab pending invites panel
- Death screen: full "You Fell in Battle" panel when defeated in a raid — no silent contribution-0 failure
- Raid countdown ambient bar on Home page — shows tier, phase, and HP% when in an active raid
- 3 new raid-exclusive mythic items: Ancient Relic Ring (ring), Void Conqueror Blade (weapon), Eternal Crown (head) — only drop from raid victories, tradeable on marketplace
- Zones 7-8: Shadow Crypt and Celestial Spire added to the dungeon map
- Lich Set (zone 7, legendary): 5-piece legendary gear set craftable from shadow_dust + lich_crystal
- Titan Set (zone 8, mythic): 5-piece mythic gear set craftable from storm_shard + titan_core
- Guild system: create/join guilds, guild chest, weekly goals, guild activity log, guild gold multiplier buff
- DungeonMap visual zone progression view in ArenaPage
- Price sparkline chart on marketplace listings
- Friend activity feed
- Weekly bounty system

**Fixed:**
- Supabase RLS infinite recursion between raids and raid_participants tables — both now use open authenticated SELECT policies
- Tribute modal: replaced confusing ×N display with "owned N" subtitle and "burn" label
- Dungeon tests scoped to zones 1-6 (void set coverage)

---
Released: 2026-03-16

---

## What's new in v3.7.0

**Improved:**
- Installed `lucide-react` icon library — replaced emoji navigation icons with sharp, consistent SVG icons across all tabs and page headers
- All pages now use the shared `PageHeader` component — unified structure across Home, Stats, Skills, Cooking, and all other pages
- BottomNav primary tabs and More popup now use Lucide icons (Home, Zap, Users, BarChart3, MoreHorizontal, Sword, ShoppingCart, Hammer, Sprout, Package, User, Settings)
- BackButton now uses Lucide `ChevronLeft` (replaced hand-written SVG)
- Each page header now shows a color-coded Lucide icon matching the page (e.g. red Sword for Arena, green Sprout for Farm, orange Hammer for Craft)
- CookingPage CSS island removed — animations moved to global CSS for consistent behavior; page now uses standard container and PageHeader
- HomePage bottom zone spacing fixed (pb-20 for proper bottom nav clearance)
- Marketplace lazy-load fallback standardized to shared PageLoading component
- Close buttons (✕) across Inventory, Marketplace, and Goal widget replaced with Lucide X icon

---
Released: 2026-03-15

---

## What's new in v3.6.0

**New:**
- 4 new arena zones: Slime Dungeon, Wolf Forest, Troll Cavern, Dragon Lair — each with miniboss mobs before the boss
- Login with username (in addition to email)
- Escape key closes modals (arena result, streak, what's new)
- Remote patch notes fetched from server
- Admin skill XP override support

**Improved:**
- Cooking: richer animations (confetti, shake, golden flash, ring burn/bonus effects)
- Cooking: rarity-scaled completion sounds + error/discovery sounds
- Navbar icons support custom images from dashboard
- Auth screen: animated sign-in ↔ sign-up transition
- Chef XP now syncs correctly across devices

**Fixed:**
- Arena victory gold not being awarded in some cases

---
Released: 2026-03-14
