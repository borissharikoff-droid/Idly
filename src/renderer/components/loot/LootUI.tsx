import type { LootSlot } from '../../lib/loot'

export const SLOT_META: Record<LootSlot, { label: string; icon: string }> = {
  head: { label: 'Head', icon: '🪖' },
  body: { label: 'Body', icon: '👕' },
  legs: { label: 'Legs', icon: '🦵' },
  ring: { label: 'Ring', icon: '💍' },
  weapon: { label: 'Weapon', icon: '⚔️' },
  consumable: { label: 'Consumable', icon: '⚗️' },
  plant: { label: 'Plant', icon: '🌿' },
}

export const SLOT_LABEL: Record<LootSlot, string> = {
  head: 'Head',
  body: 'Body',
  legs: 'Legs',
  ring: 'Ring',
  weapon: 'Weapon',
  consumable: 'Consumable',
  plant: 'Plant',
}

export type InspectRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythical'

export const RARITY_THEME: Record<
  InspectRarity,
  { color: string; border: string; glow: string; panel: string }
> = {
  common: {
    color: '#9CA3AF',
    border: 'rgba(156, 163, 175, 0.38)',
    glow: 'rgba(156, 163, 175, 0.22)',
    panel: 'radial-gradient(circle at 50% 14%, rgba(156,163,175,0.16) 0%, rgba(31,41,55,0.92) 62%)',
  },
  rare: {
    color: '#38BDF8',
    border: 'rgba(56, 189, 248, 0.45)',
    glow: 'rgba(56, 189, 248, 0.28)',
    panel: 'radial-gradient(circle at 50% 14%, rgba(56,189,248,0.18) 0%, rgba(31,41,55,0.92) 62%)',
  },
  epic: {
    color: '#C084FC',
    border: 'rgba(192, 132, 252, 0.45)',
    glow: 'rgba(192, 132, 252, 0.28)',
    panel: 'radial-gradient(circle at 50% 14%, rgba(192,132,252,0.2) 0%, rgba(31,41,55,0.92) 62%)',
  },
  legendary: {
    color: '#FACC15',
    border: 'rgba(250, 204, 21, 0.48)',
    glow: 'rgba(250, 204, 21, 0.3)',
    panel: 'radial-gradient(circle at 50% 14%, rgba(250,204,21,0.2) 0%, rgba(31,41,55,0.92) 62%)',
  },
  mythical: {
    color: '#A855F7',
    border: 'rgba(168, 85, 247, 0.5)',
    glow: 'rgba(168, 85, 247, 0.34)',
    panel: 'radial-gradient(circle at 50% 14%, rgba(168,85,247,0.24) 0%, rgba(31,41,55,0.92) 62%)',
  },
}

export function normalizeRarity(value: string | null | undefined): InspectRarity {
  const rarity = String(value || '').toLowerCase()
  if (rarity === 'mythic' || rarity === 'mythical') return 'mythical'
  if (rarity === 'legendary') return 'legendary'
  if (rarity === 'epic') return 'epic'
  if (rarity === 'rare') return 'rare'
  return 'common'
}

export function LootVisual({
  icon,
  image,
  className,
  scale = 1,
}: {
  icon: string
  image?: string
  className?: string
  scale?: number
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className={className ?? 'w-7 h-7 object-contain'}
        style={{ imageRendering: 'pixelated', transform: `scale(${scale})`, transformOrigin: 'center center' }}
        draggable={false}
      />
    )
  }
  return <span className={className}>{icon}</span>
}

