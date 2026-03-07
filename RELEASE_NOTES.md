## What's new in v3.2.1

### Fixed
- Items, chests, seed zips, and seeds no longer reappear after switching tabs or re-opening the app
- Removed Math.max cloud merge strategy that was restoring consumed/opened items from stale Supabase data
- Local inventory is now always authoritative — cloud sync is push-only

---
Released: 2026-03-07

## What's new in v3.2.0

### New
- Click any toast notification to navigate to the relevant page (arena, craft, friends)
- Click notification panel items to navigate to the relevant page
- Arena boss Claim (from toast or notification) now opens the full victory modal with chest loot, materials, and warrior XP

### Improved
- Global navigation store for cross-component tab switching

---
Released: 2026-03-07

## What's new in v3.1.1

### Fixed
- Crafting resources no longer restored by cloud sync after being consumed
- Seed zip Open button no longer allows infinite rapid clicks
- Seed count in picker no longer double-counts inventory + cabinet seeds
- Craft progress bar no longer jitters when items complete

---
Released: 2026-03-07

## What's new in v3.1.0

### New
- Compost system — apply compost to empty farm plots (3 per plot) for +20% harvest yield and +5% farmer XP
- Compost All button (unlocks at Farmer lv.50)
- Compost crafting recipe: Wheat ×5 + Herbs ×3 → Compost ×3
- 8% chance to drop compost on any harvest
- Dashboard icon editor — change navbar, gold, and all UI icons from Game Config

### Improved
- Claim All now shows each harvest one-by-one instead of a combined scroll view
- Seed picker now shows seeds from both inventory and cabinet
- Marketplace buy-price formula corrected (per-unit pricing)

### Fixed
- Marketplace page crash on buy/list actions
- Compost recipe now visible in Craft page (moved to CRAFT_INTERMEDIATE_ITEMS)

### Wiki
- New Compost tab on Farming page
- Updated item descriptions and crafting references

---
Released: 2026-03-07

## What's new in v3.0.0

### New
- Craft system with character panel and toast notifications
- 5 tiered armor sets replacing old bag-drop gear
- Inventory search bar and filter improvements
- Sell items from backpack panel
- Harvest claim-all chest animation
- Item description shown in chest open modal
- Seed overrides from dashboard (image, name, stats)
- Universal image/skin upload for all entities
- Full game balance pass — items, bosses, mobs
- Stat-aware item power formula (slot + perks + rarity)
- DevTools shortcut (Ctrl+Shift+I) in dev mode
- Arena victory modal shows material drops, dungeon gold, warrior XP

### Fixed
- Chest opening now falls back to default loot when admin config has stale items
- Boss image shown instead of hardcoded crown emoji in arena
- Custom skins display in claim-all banner and harvest results
- Seed images shown in inventory
- Chest image filenames corrected
- Seed zip and custom item overrides propagate everywhere
- ChestWeightOverrides applied to CHEST_DEFS properly
- Removed direct seed-sell-to-system mechanic

---
Released: 2026-03-06

## What's new in v2.2.0

**New:**
- Arena loadout now uses the full Character panel (row slots for head/body/legs, square slots for ring/weapon, 4 stat cards)

**Improved:**
- Removed all old gear items from the game — item system reset for manual re-entry via dashboard
- Chest drop tables updated: common/rare give nothing, epic/legendary drop potions
- Dashboard: added  slot type, synced ITEM_CATALOG and CHEST_CATALOG to match

---
Released: 2026-03-04

## What's new in v2.1.4

**Inventory — Character panel redesign:**
- Gear slots now full-width RPG character sheet rows: colored left bar shows rarity, icon, slot name, item name, and perk value inline
- Stats shown as 4 clean chips — ATK / HP / Regen / IP — with glow color, large readable number
- Maxed stats turn gold to indicate cap reached
- Removed redundant "Buffs" list (perk now shows directly in each slot row)

---
Released: 2026-03-03

## What's new in v2.1.3

**Inventory:**
- Items now shown in a compact 2-column grid instead of a full-width list
- Text is brighter and larger throughout — name, perk value, slot tag all more readable
- Icon size increased, perk chip more prominent in rarity color

**Marketplace:**
- Identical My Listings (same item + same price/unit) are now merged into one card showing total quantity and order count — "Remove xN" cancels all at once
- My Listings cards no longer blend together — proper spacing between each card
- Filters redesigned: main categories always visible, secondary filters (rarity + price range) hidden behind a expand button

---
Released: 2026-03-03

## What's new in v2.1.2

**New:**
- Weapon slot added — equip swords for bonus ATK (Iron Sword, Steel Blade, Void Edge, Nexus Sword, Omega Blade, common to mythic)
- Weapons drop from all chest tiers and appear in the new Weapons filter in Inventory

**Improved:**
- Loadout layout redesigned: Head / Body / Legs in a vertical column on the left, Ring and Weapon as compact square slots on the right (Ring above Weapon)
- Inventory list cards now show the item's perk value (e.g. "+14 ATK") in the rarity color, and equipped items get a clear "EQ" badge
- Weapons filter added to Inventory

---
Released: 2026-03-03
