# TODOS

## UI

### Keyboard shortcut hints in sidebar tooltips
**Priority:** P2 | **Effort:** S

Show key hints in hover tooltips: `Skills [2]`, `Arena [7]`, etc.

**Why:** Makes the app feel like a power tool for users who prefer keyboard navigation.

**How:** Extend `TAB_LABELS` in `SideNav.tsx` with an optional shortcut slot. Wire up number-key handlers in `useKeyboardShortcuts`. Depends on sidebar being stable.

**Where to start:** `src/renderer/components/layout/SideNav.tsx` (tooltip render) + `src/renderer/hooks/useKeyboardShortcuts.ts`

---

### Skill-color active glow on sidebar
**Priority:** P3 | **Effort:** S

The active sidebar item's left-border glow adapts to the currently-leveled skill color (e.g. Developer = `#00ff88`, Gamer = `#5865F2`, Researcher = `#faa61a`).

**Why:** Subtle session-aware feedback that reinforces the RPG identity.

**How:** Read `sessionStore.currentActivity.category` → `categoryToSkillId` → `getSkillById` → `skill.color`. Apply as inline `style={{ backgroundColor: skill.color }}` on the active border span in `SideNav.tsx`. When idle, fall back to `cyber-neon`.

**Where to start:** `src/renderer/components/layout/SideNav.tsx` — the `<span>` with class `bg-cyber-neon` on active tab.
