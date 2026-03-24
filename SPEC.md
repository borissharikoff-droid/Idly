# Grindly Visual Redesign — Design System Unification

## Goal

Bring all UI components to a single cohesive visual language. Currently the app mixes:
- Random neon-green (#00ff88) glows on hover/active states vs Discord-style interaction
- Inconsistent border-radius (0.5rem / 0.75rem / 1rem mixed ad hoc)
- Cards with/without borders, different padding, different shadow styles
- Typography at arbitrary sizes/weights without hierarchy
- Buttons that look different on each page

Target: Discord-dark aesthetic, clean, compact, MMO-readable. All interactive chrome unified; game identity elements (rarity colors, skill colors) unchanged.

---

## Frozen Elements — DO NOT CHANGE

These are gameplay identity — changing them breaks visual communication with the player.

### Rarity colors
```
common    → gray   (#9ca3af / text-gray-400)
rare      → blue   (#60a5fa / text-blue-400)
epic      → violet (#a855f7 / text-purple-500)
legendary → amber  (#f59e0b / text-amber-400)
mythic    → pink   (#ec4899 / text-pink-500)
```
Defined in `LootUI.tsx` `RARITY_THEME` and `wiki/item.html` `RARITY_COLORS`. Must match exactly.

### Skill colors
```
Developer   → blue   (#3b82f6)
Designer    → pink   (#ec4899)
Gamer       → violet (#8b5cf6)
Communicator→ green  (#22c55e)
Researcher  → cyan   (#06b6d4)
Creator     → orange (#f97316)
Learner     → yellow (#eab308)
Listener    → rose   (#f43f5e)
```
Defined in `src/renderer/lib/skills.ts`. Frozen.

---

## Design Tokens — New `tailwind.config.js`

Replace the current token set with these. All components must migrate to these tokens only — no raw hex values inline.

### Background palette (4 levels)

| Token | Hex | Usage |
|-------|-----|-------|
| `surface-0` | `#111214` | App root background, deepest layer |
| `surface-1` | `#1e2024` | Page background, sidebar bg |
| `surface-2` | `#2b2d31` | Cards, panels, modals |
| `surface-3` | `#36393f` | Elevated elements, hover states on cards, inputs |

### Interactive / accent

| Token | Hex | Usage |
|-------|-----|-------|
| `accent` | `#5865F2` | Active tab, button borders, focus rings, selected states |
| `accent-hover` | `#4752c4` | Pressed / hover state of accent elements |
| `accent-muted` | `#5865F220` | Background tint for active tab, selected item |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `border-subtle` | `rgba(255,255,255,0.06)` | Default card/panel border |
| `border-medium` | `rgba(255,255,255,0.10)` | Inputs, modals |
| `border-strong` | `rgba(255,255,255,0.18)` | Focused inputs, highlighted cards |
| `border-accent` | `#5865F2` | Active tab indicator, selected card |

### Typography

All text uses **Inter** (already in project). Scale:

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-title` | 14px / font-semibold | 600 | Section headers, modal titles |
| `text-body` | 13px / font-normal | 400 | Default body text |
| `text-secondary` | 12px / text-gray-400 | 400 | Labels, subtitles |
| `text-caption` | 11px / text-gray-500 | 400 | Timestamps, hints |
| `text-micro` | 10px / font-mono | 400 | Badges, stat values, nav labels |

Remove all `font-mono` usage from non-numeric contexts (nav labels, section titles). Font-mono stays for: numbers, XP values, gold amounts, timers, stat readouts.

### Border radius

**One value: `rounded` = 4px** everywhere by default.

Exceptions (use sparingly, must be documented in component):
- `rounded-full` — avatar circles, badge pills, circular buttons
- `rounded-md` (6px) — tooltips, context menus only

Delete `ui-sm`, `ui-md`, `ui-lg` borderRadius tokens. They are too round for the target aesthetic.

### Shadows

Remove ALL `glow-*` shadows from UI chrome. The cyber-neon glow (box-shadow using #00ff88) is reserved exclusively for:
- Loot drop animations
- Chest open effects
- Legendary/mythic item borders

For UI elevation, use only:
```
shadow-card  → 0 1px 3px rgba(0,0,0,0.4)
shadow-modal → 0 8px 32px rgba(0,0,0,0.6)
shadow-popup → 0 4px 16px rgba(0,0,0,0.5)
```

### Buttons

Two variants, defined once in a shared `Button` component or via Tailwind classes:

**Primary (action, e.g. "Craft", "Buy", "Attack")**
```
bg-accent text-white hover:bg-accent-hover
rounded px-3 py-1.5 text-sm font-medium transition-colors
```

**Outline (secondary, e.g. "Cancel", "View", "Inspect")**
```
bg-transparent border border-accent text-accent hover:bg-accent-muted
rounded px-3 py-1.5 text-sm font-medium transition-colors
```

**Ghost (tertiary, e.g. small icon buttons)**
```
bg-transparent text-gray-400 hover:text-gray-200 hover:bg-surface-3
rounded p-1.5 transition-colors
```

No other button variants should exist. If a button needs a different color (e.g. danger), that's an exception documented per-component.

### Scrollbars

Global CSS in `index.css`:
```css
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.20); }
```

---

## Component-Level Changes

### `tailwind.config.js`
- Replace `discord.*` and `cyber.*` color keys with `surface.*`, `accent`, `accent-hover`, `accent-muted`
- Replace `borderRadius.ui-*` with a single `rounded` = 4px override
- Replace all `boxShadow.glow-*` with `shadow-card`, `shadow-modal`, `shadow-popup`
- Keep `glow-*` only under a `game` namespace (`game.glow-sm` etc.) to signal they're gameplay-only

### `BottomNav.tsx`
**Active tab state:** Replace `bg-cyber-neon/15 text-cyber-neon shadow-glow-sm` with `bg-accent-muted text-accent`
**Drop target state:** Replace `ring-cyber-neon/60 bg-cyber-neon/10 text-cyber-neon` with `ring-accent/60 bg-accent-muted text-accent`
**More popup:** Replace `rounded-2xl` with `rounded`, reduce border from `border-white/[0.10]` to `border-subtle`, change bg from `#1a1a2a` to `surface-2`
**Nav bar container:** Change `rounded-2xl` to `rounded`, `bg-discord-nav` to `surface-1`
**Pulse dot (arena/craft/cooking active):** Replace `bg-cyber-neon` with `bg-accent`
**Badge dot (moreTabs):** Replace `bg-lime-500` to `bg-accent`
**Nav labels:** Remove `font-mono`, use `text-micro` (10px, regular Inter)

### `ProfileBar.tsx`
**Loot badge on avatar:** Replace `bg-cyber-neon text-discord-darker shadow-[0_0_6px_rgba(0,255,136,0.5)]` with `bg-accent text-white`
**XP level text:** Replace `text-cyber-neon font-mono` with `text-accent font-mono` (mono OK here — it's a number)
**Bell button:** Standardize to ghost button style — `bg-surface-2/60 border border-subtle hover:border-medium rounded`
**Unread notification badge:** Replace `bg-orange-500` with `bg-accent` for consistency (or keep orange if it needs to stand out — document the exception)
**AFK badge:** Keep `bg-amber-500/20 text-amber-300` (this is a semantic status color, not chrome)

### Cards / Panels (all pages)

Uniform card style:
```
bg-surface-2 border border-subtle rounded p-3
```
For "elevated" or "interactive" cards (clickable items):
```
bg-surface-2 border border-subtle rounded p-3
hover:bg-surface-3 hover:border-medium transition-colors cursor-pointer
```
Selected/active card:
```
bg-accent-muted border border-accent rounded p-3
```

Remove all inline `bg-[#...]` hex backgrounds on cards — replace with surface tokens.

### Inputs / Text fields

```
bg-surface-3 border border-medium rounded px-2.5 py-1.5 text-sm text-white
placeholder:text-gray-500 focus:outline-none focus:border-accent transition-colors
```

### Modals

Standard modal wrapper:
```
bg-surface-2 border border-medium rounded shadow-modal
```
Modal header: `text-title text-white border-b border-subtle pb-2 mb-3`
Modal footer: `border-t border-subtle pt-3 mt-3 flex justify-end gap-2`

### Section headers within pages

```
text-caption text-gray-500 uppercase tracking-wider mb-2
```
(This replaces the mixed usage of font-mono / font-semibold / text-xs / text-[10px] section labels)

---

## Priority Pages — Specific Notes

### Home / ProfileBar
- Unify the top chrome: ProfileBar bg should be `surface-1`, no separate shadow strip
- The `WelcomeBanner` and `CurrentActivity` cards should use standard card style

### Inventory / Marketplace
- Item slot squares: keep `rounded` (4px), rarity color as border only (not background glow)
- `ListForSaleModal` and `GoldDisplay` should use standard modal/input tokens
- `MarketplacePage` table rows: use card hover style on rows

### Arena / DungeonMap
- Boss health bar: keep game-style (can use accent or skill color)
- Zone cards in `DungeonMap`: standard interactive card style
- Active battle pulse: the `bg-cyber-neon animate-pulse` dot on nav tab → replace with `bg-accent`
- Combat log text: `text-caption` size, `surface-3` background

### Friends / Guild
- `FriendList` rows: standard interactive card style
- `GuildHall` / `GuildTab` panels: standard card
- Chat bubbles in `ChatThread`: own = `bg-accent-muted`, other = `bg-surface-3`
- `FriendProfile` / `FriendCompare` headers: use `text-title` for names

---

## Implementation Order

1. **`tailwind.config.js`** — establish new tokens (surface, accent, shadow, radius)
2. **`src/renderer/index.css`** — scrollbar CSS, remove any root glow/pulse CSS vars
3. **`BottomNav.tsx`** — highest visibility, sets the tone
4. **`ProfileBar.tsx`** — top of every screen
5. **Shared components** (`PageHeader`, `EmptyState`, `ErrorState`, `ItemInspectModal`, `BackpackButton`, `BackButton`) — these propagate to all pages automatically
6. **Priority pages** — Home, Inventory, Marketplace, Arena, Friends/Guild
7. **Remaining pages** — Skills, Stats, Profile, Craft, Farm, Cooking, Settings

---

## Acceptance Criteria

- [ ] No raw `#00ff88` or `cyber-neon` references in UI chrome (only in game animation files: `LootDrop`, `ChestOpenModal`, `OrbBlast`, `StreakOverlay`)
- [ ] No raw hex backgrounds on cards/panels — all use surface tokens
- [ ] All active/selected states use accent (#5865F2) not neon green
- [ ] All border-radius values are 4px (`rounded`) except circles (`rounded-full`) and context menus (`rounded-md`)
- [ ] Typography follows the 5-level scale — no ad hoc `text-[11px]` inline sizes
- [ ] Scrollbars are 4px, semi-transparent
- [ ] Rarity colors unchanged
- [ ] Skill colors unchanged
- [ ] Existing Framer Motion animations unchanged
