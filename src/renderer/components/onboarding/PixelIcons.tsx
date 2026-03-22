/**
 * Hand-crafted 8×8 pixel art icons for the onboarding wizard.
 * Each icon is a string[] where '#' = filled pixel, '.' = empty.
 * Rendered as SVG <rect> elements with shape-rendering="crispEdges".
 */

// ── Icon definitions (8×8 grid) ─────────────────────────────────────────────

const ICONS = {
  // Lightning bolt pointing down-right
  zap: [
    '...###..',
    '..###...',
    '.######.',
    '...####.',
    '....###.',
    '....##..',
    '.....#..',
    '........',
  ],

  // Treasure chest with lock
  chest: [
    '.######.',
    '########',
    '#..##..#',
    '########',
    '#......#',
    '#......#',
    '#......#',
    '########',
  ],

  // Vertical sword with crossguard
  sword: [
    '...##...',
    '...##...',
    '...##...',
    '.######.',
    '...##...',
    '...##...',
    '..####..',
    '..####..',
  ],

  // Bullseye / target rings
  target: [
    '..####..',
    '.#....#.',
    '#..##..#',
    '#.####.#',
    '#.####.#',
    '#..##..#',
    '.#....#.',
    '..####..',
  ],

  // Gift box with ribbon
  gift: [
    '.######.',
    '#..##..#',
    '########',
    '#..##..#',
    '#......#',
    '#......#',
    '#......#',
    '########',
  ],

  // Monitor/screen with stand
  monitor: [
    '########',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '########',
    '...##...',
    '.######.',
  ],

  // Two vertical pause bars
  pause: [
    '........',
    '.##.##..',
    '.##.##..',
    '.##.##..',
    '.##.##..',
    '.##.##..',
    '.##.##..',
    '........',
  ],

  // Shield (pointed bottom)
  shield: [
    '.######.',
    '########',
    '#......#',
    '#......#',
    '#......#',
    '.#....#.',
    '..####..',
    '...##...',
  ],
} as const

export type PixelIconName = keyof typeof ICONS

interface PixelIconProps {
  name: PixelIconName
  color: string
  size?: number
}

export function PixelIcon({ name, color, size = 16 }: PixelIconProps) {
  const rows = ICONS[name]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated' }}
    >
      {rows.map((row, y) =>
        row.split('').map((ch, x) =>
          ch === '#' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
          ) : null,
        ),
      )}
    </svg>
  )
}
