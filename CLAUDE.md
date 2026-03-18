# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Grindly is a Windows desktop productivity tracker built with Electron + React + TypeScript. It monitors active window usage, categorizes activities into skills, and provides gamification (XP, levels, streaks, achievements). Social features (friends, chat, leaderboard) are powered by Supabase. Optional AI session analysis via DeepSeek. There is also a web admin dashboard deployed on Railway. Always consider both client and dashboard when making changes.

## Commands

```bash
# Development
npm run electron:dev          # Full Electron dev mode (Vite HMR + Electron)
npm run dev                   # Renderer only (browser at localhost:5173)
npm run build:electron        # Compile main + preload TypeScript only

# Build
npm run build                 # Full build (TS compile + Vite bundle)
npm run electron:build        # Package into Windows installer (.exe)

# Tests (Vitest)
npm run test                  # Run all tests once
npm run test:watch            # Watch mode
npx vitest run src/tests/xp.test.ts   # Run a single test file
# Test files: xp, skills, loot, inventoryStore, progressionContract, rewardGrant, notificationRouter, achievementProgress, dailyActivity, tracker
```

## Architecture

This is a TypeScript Electron + Supabase RPG game with complex sync layers (localStorage, SQLite, Supabase). When modifying game state, trace the full sync chain before making changes - client state can overwrite server-side DB changes.

### Three-Process Electron Model

- **Main process** (`src/main/`, CommonJS via `tsconfig.main.json`) — app lifecycle, tray, SQLite database, PowerShell activity tracker subprocess, IPC handlers, auto-updater
- **Preload** (`src/preload/`, CommonJS via `tsconfig.preload.json`) — context bridge exposing `window.electronAPI` to renderer
- **Renderer** (`src/renderer/`, ESNext via `tsconfig.json`) — React SPA bundled by Vite

Each process has its own tsconfig. Main/preload compile to CommonJS (`dist/main/`, `dist/preload/`), renderer bundles to `dist/renderer/`.

### IPC Communication

70+ channels defined in `src/shared/ipcChannels.ts`. Handlers registered in `src/main/ipc.ts` with Zod schema validation (`src/main/validation.ts`). Renderer accesses them through `window.electronAPI` exposed by the preload script.

### Activity Tracking

`src/main/tracker.ts` spawns a PowerShell subprocess using Win32 APIs (GetForegroundWindow, GetAsyncKeyState, GetLastInputInfo). Outputs activity data every ~1.5s in format `WIN:ProcessName|Title|KeystrokeCount|IdleMs`. Windows-only.

### Data Storage

- **Local:** SQLite via better-sqlite3 at `%APPDATA%/Grindly/grindly.sqlite`. Schema managed by numbered migrations in `src/main/migrations/index.ts`. Core tables: sessions, activities, skill_xp, achievements_unlocked, grind_tasks, session_checkpoint.
- **Cloud (optional):** Supabase for auth, profiles, friends, messages, leaderboard. Schema in `supabase/schema.sql`. Skill XP synced from SQLite → Supabase via `src/renderer/services/supabaseSync.ts`.

### State Management

Zustand stores in `src/renderer/stores/`. The central store is `sessionStore.ts` managing session lifecycle, XP, and achievements. Other notable stores: `inventoryStore`, `goldStore`, `arenaStore` (persisted), `authStore`, `notificationStore`, `chatTargetStore`, `alertStore`, `chestDropStore`.

### Gamification

8 skills (Developer, Designer, Gamer, Communicator, Researcher, Creator, Learner, Listener) defined in `src/renderer/lib/skills.ts`. XP formulas in `src/renderer/lib/xp.ts` — 99 levels per skill with formula `xpForLevel(L) = floor(pow(L/99, 2.2) * 3_600_000)`. Activity categories map to skills via `skillXPService.ts`. Achievements checked in `achievementService.ts`.

### Loot, Inventory & Economy

Items have four slots (`head`, `top`, `accessory`, `aura`) and five rarities (`common` → `mythic`). Types and utility helpers live in `src/renderer/lib/loot.ts`. `inventoryStore.ts` manages local + Supabase inventory state. Gold is a separate currency tracked in `goldStore.ts` and used in the **Marketplace** (`src/renderer/components/marketplace/`, `src/renderer/services/marketplaceService.ts`) for player-to-player trading via Supabase `marketplace_listings`.

### Arena / Combat

Turn-based boss fights defined in `src/renderer/lib/combat.ts`. Player stats (`atk`, `hp`, `hpRegen`) are derived from equipped loot via `computePlayerStats`. `arenaStore.ts` (persisted via Zustand `persist`) tracks the active battle and result modal. Victory awards gold. Arena and Marketplace pages are **lazy-loaded** in `App.tsx`.

### UI Structure

Tab-based navigation: `home | inventory | skills | stats | profile | friends | marketplace | arena | settings` defined as `TabId` in `App.tsx`. `StatsPage`, `FriendsPage`, `MarketplacePage`, and `ArenaPage` are code-split with `React.lazy`. Tailwind CSS with Discord-inspired dark theme defined in `tailwind.config.js`. Animations via Framer Motion.

### Key Internal Conventions

- **Progression contract** — `src/renderer/lib/progressionContract.ts` is the single source for computing skill XP from activity time. `computeSkillXpForCategories` splits duration equally across active skills (no global XP — that field always returns 0).
- **Notification routing** — all in-app and desktop notifications go through `routeNotification` in `src/renderer/services/notificationRouter.ts`, which enforces per-event-type cooldowns and deduplication.
- **Feature flags** — `src/renderer/lib/featureFlags.ts` reads boolean flags from `localStorage` keys prefixed `grindly_flag_*`. Toggle at runtime with `localStorage.setItem('grindly_flag_<name>', '1')`.
- **SQLite migrations** — append only. Never edit or reorder existing entries in `src/main/migrations/index.ts`; always add new ones at the end.

## Environment Variables

Copy `.env.example` to `.env`. Supabase keys are optional (social features disabled without them). `VITE_`-prefixed vars are baked into renderer at build time.

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — renderer Supabase client
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — main process Supabase access
- `DEEPSEEK_API_KEY` — optional AI analysis

## UI/Design Guidelines

- When creating UI components, prefer a clean, compact MMO/RPG style. Avoid flashy, over-engineered designs. Keep slots small and square, prioritize stats/data readability over decorative art.
- Keep UI designs clean, compact, and MMO/RPG-style. Do NOT over-engineer or make things flashy/large. Prioritize functional stats and readability over decorative art. When in doubt, go simpler.

## Code Style

- Always create shared/reusable components instead of duplicating code inline. If the same UI exists in multiple pages, extract it into a shared component.
- When generating JavaScript strings in templates (e.g., for dashboard HTML), always escape quotes properly. Test that generated JS is syntactically valid.

## Code Patterns

- When modifying or creating components, always check if a shared/reusable component already exists or should be created. Never duplicate UI code inline - extract shared components first.

## Code Changes

- When removing a function or feature, grep for all references across the entire codebase before deleting. Never remove an export without checking all import sites.

## Workflow Rules

- After any code edit, verify there are no broken references or imports in other files that depend on the changed code. Run a grep for the function/export name before considering the change complete.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/plan-ceo-review` — high-level product/strategy review of a plan
- `/plan-eng-review` — engineering review of a plan
- `/review` — code review
- `/ship` — ship a feature end-to-end
- `/browse` — headless browser for QA testing, verifying deployments, and dogfooding user flows
- `/qa` — structured QA testing
- `/setup-browser-cookies` — configure browser cookies for authenticated browsing
- `/retro` — run a retrospective

## Tools & Integrations

- Use the configured Supabase MCP (`mcp__supabase__execute_sql`) for all database operations. Never fall back to manual curl commands or raw SQL scripts when MCP is available.

## Zustand Selectors

- Never return a new object/array reference directly from a selector. Use shallow comparison or select individual fields to avoid infinite re-render loops.

## Release Screenshot Checklist

Before each release (`/release`), send the user a **screenshot checklist** — a numbered list of specific screens/actions to capture in the running app. Format:

1. State what page/tab to open
2. State what action to perform (if any)
3. State what should be visible (the new/changed element)
4. Give a short filename suggestion (e.g. `prestige_badge.png`)

After the user provides the screenshots (as file paths), insert them into the patch notes (wiki patches page or release notes) with captions describing each change. This ensures every release has visual documentation of what changed.

## Deployment

- For Railway deployments: ensure all runtime dependencies (e.g., dotenv) are in `dependencies` not `devDependencies`. After pushing, verify the build triggers. If auto-deploy doesn't fire, push a follow-up commit.
- **Wiki & Dashboard auto-push**: Whenever you make changes to the wiki (`wiki/` submodule) or the online dashboard, **push immediately** after committing — do not wait for the user to ask. Run `cd wiki && git add -A && git commit && git push` right away. Same for dashboard deploys.

## Cross-Project Sync: Wiki & Dashboard

**MANDATORY**: When you change ANY game data in the source files listed below, you MUST propagate those changes to the wiki (and dashboard if applicable) in the same session. Do NOT leave them out of sync.

### Source of Truth (Game Data Files)

These files define all game data. Any change here triggers sync obligations:

| File | Contains | Wiki pages affected |
|------|----------|-------------------|
| `src/renderer/lib/loot.ts` | All items (gear, potions, plants, materials), chest definitions, rarity tiers, IP formula, drop rates | `wiki/item.html` (ITEMS array, CHESTS object), `wiki/equipment.html`, `wiki/loot.html`, `wiki/materials.html`, `wiki/index.html` (search index, rarity table) |
| `src/renderer/lib/combat.ts` | Arena zones, mobs (HP/ATK/XP/gold/materials), bosses, warrior XP, boss requirements, gate items | `wiki/arena.html`, `wiki/item.html` (mob material sources), `wiki/materials.html` |
| `src/renderer/lib/crafting.ts` | All recipes, intermediate items, crafted gear, crafter perks | `wiki/crafting.html`, `wiki/item.html` (RECIPES array, crafted items in ITEMS), `wiki/equipment.html` (crafted gear table) |
| `src/renderer/lib/farming.ts` | Seed definitions, grow times, yields, XP, plant buffs, seed zips, farm slot costs | `wiki/farming.html`, `wiki/item.html` (plant items) |
| `src/renderer/lib/skills.ts` | Skill definitions (names, colors, icons, categories) | `wiki/skills.html`, `wiki/index.html` (search index, hero stats) |
| `src/renderer/lib/xp.ts` | XP formula, level curve | `wiki/skills.html` (XP formula section), `wiki/index.html` (quick reference) |

### Wiki Sync Checklist

When modifying game data, follow this checklist:

1. **Adding a new item** — Add to `wiki/item.html` ITEMS array. Add to relevant category page table (equipment/materials). Add to `wiki/index.html` search index. If craftable, add recipe to RECIPES array and `wiki/crafting.html`.

2. **Changing item stats/perks** — Update `wiki/item.html` ITEMS array (perks, values, descriptions). Update the category page table row (equipment.html, materials.html). If IP-related values change (rarity weights, perk formulas), update `wiki/index.html` rarity table.

3. **Adding/changing arena zones or mobs** — Update `wiki/arena.html` (zone card, mob rows, boss stats, requirements, warrior XP, drops). Update `wiki/index.html` search index (zone names). If new materials added, update `wiki/materials.html`.

4. **Adding/changing recipes** — Update `wiki/item.html` RECIPES array. Update `wiki/crafting.html` recipe tables. If new output item, add to ITEMS array and `wiki/equipment.html`.

5. **Adding/changing seeds or farming** — Update `wiki/farming.html` (seed table, buffs, slots). Update plant items in `wiki/item.html` ITEMS array.

6. **Changing skills** — Update `wiki/skills.html` (skill cards: name, color, icon, category). Update `wiki/index.html` search index and hero stats count.

7. **Changing chest/loot mechanics** — Update `wiki/item.html` CHESTS object. Update `wiki/loot.html` (tiers, pity, drop modifiers, bonus materials).

### Wiki Data Integrity Rules

- **Item IDs must match exactly** between source `.ts` files, `wiki/item.html` ITEMS/RECIPES arrays, category page `item.html?id=X` links, and `wiki/index.html` search index.
- **Rarity colors** must match `RARITY_THEME` in `src/renderer/components/loot/LootUI.tsx` and `RARITY_COLORS` in `wiki/item.html`.
- **IP values** (ITEM_POWER_BY_RARITY) must match between `loot.ts` and `wiki/index.html` quick reference table: common=100, rare=150, epic=220, legendary=320, mythic=450.
- **Never show fake/simulated data** in the wiki. If marketplace data doesn't exist, show "N/A". `HAS_MARKET_DATA = false` in `wiki/item.html`.
- After all wiki changes, `cd wiki && git add -A && git commit && git push` to the Grindly-Wiki repo (separate from main repo).

### Dashboard Sync

The web admin dashboard is deployed on Railway. When game data changes affect dashboard displays (skills list, item definitions, achievement definitions), update the dashboard HTML/JS to reflect the new data. The dashboard reads from Supabase, so schema changes also require `supabase/schema.sql` updates.

### Verification

After syncing, verify by grepping the wiki for the old values to ensure nothing was missed:
```bash
cd wiki && grep -r "OLD_VALUE" *.html
```