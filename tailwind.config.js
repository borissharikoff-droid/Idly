/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Design system surfaces (4 levels) ───────────────────────
        surface: {
          0: '#111214',   // deepest: app root bg
          1: '#1e2024',   // page bg, nav bar
          2: '#2b2d31',   // cards, panels, modals
          3: '#36393f',   // elevated: hover states, inputs
        },
        // ── Accent (Discord violet) ──────────────────────────────────
        accent: {
          DEFAULT: '#5865F2',
          hover:   '#4752c4',
          muted:   'rgba(88,101,242,0.15)',
        },
        // ── Cyber neon (game animations only — not UI chrome) ────────
        cyber: {
          neon: '#00ff88',
          glow: '#00ff8840',
        },
      },
      spacing: {
        'ui-xs': '0.25rem',
        'ui-sm': '0.5rem',
        'ui-md': '0.75rem',
        'ui-lg': '1rem',
      },
      borderRadius: {
        // `rounded` = 4px — all UI elements (buttons, inputs, cards, panels).
        // `rounded-card` = 8px — large surfaces (modals, page cards) for subtle lift.
        // `rounded-full` for circles/pills.
        // `rounded-md` = 6px — context menus, tooltips only.
        DEFAULT: '4px',
        'card': '8px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Legacy size aliases
        '2xs': ['9px', { lineHeight: '1.2' }],
        'xs-compact': ['10px', { lineHeight: '1.3' }],
        'sm-compact': ['11px', { lineHeight: '1.35' }],
        // Semantic typography scale (SPEC: 5-level system)
        'micro':   ['10px', { lineHeight: '1.3' }],   // badges, stat values, nav labels
        'caption': ['11px', { lineHeight: '1.35' }],  // timestamps, hints
        'body':    ['13px', { lineHeight: '1.4' }],   // default body text
        // text-title = text-sm (14px, Tailwind native)
        // text-secondary = text-xs (12px, Tailwind native)
      },
      boxShadow: {
        // ── UI elevation (no glow, just depth) ──────────────────────
        card:  '0 1px 3px rgba(0,0,0,0.4)',
        modal: '0 8px 32px rgba(0,0,0,0.6)',
        popup: '0 4px 16px rgba(0,0,0,0.5)',
        nav:   '0 -1px 0 rgba(255,255,255,0.06)',
        // ── Brand accent glow (UI elements, not game) ───────────────
        'accent-glow': '0 0 16px rgba(88,101,242,0.25)',
        'accent-glow-sm': '0 0 8px rgba(88,101,242,0.2)',
        // ── Game-only glows (loot drops, chest opens, etc.) ─────────
        'game-glow-xs': '0 0 6px rgba(0, 255, 136, 0.3)',
        'game-glow':    '0 0 20px rgba(0, 255, 136, 0.3)',
        'game-glow-sm': '0 0 10px rgba(0, 255, 136, 0.2)',
        'game-glow-md': '0 0 20px rgba(0, 255, 136, 0.3)',
        'game-glow-lg': '0 0 30px rgba(0, 255, 136, 0.5)',
        'game-glow-xl': '0 0 40px rgba(0, 255, 136, 0.3)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 255, 136, 0.3)' },
          '50%':      { boxShadow: '0 0 30px rgba(0, 255, 136, 0.5)' },
        },
      },
    },
  },
  plugins: [],
}
