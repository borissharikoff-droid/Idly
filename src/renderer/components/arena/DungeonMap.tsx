// ─── Dungeon Map ──────────────────────────────────────────────────────────────
// Horizontal 4-room progress indicator: mob1 → mob2 → mob3 → BOSS
// Shows which room is active, which are completed, which are upcoming.

import { motion } from 'framer-motion'
import { fmt } from '../../lib/format'
import type { ZoneDef } from '../../lib/combat'

interface DungeonMapProps {
  zone: ZoneDef
  mobIndex: number    // 0–2 = mobs, 3 = boss
  goldEarned: number
  themeColor: string
}

export function DungeonMap({ zone, mobIndex, goldEarned, themeColor }: DungeonMapProps) {
  const rooms = [
    { label: zone.mobs[0]?.name ?? 'Mob 1', icon: zone.mobs[0]?.icon ?? '👹', index: 0 },
    { label: zone.mobs[1]?.name ?? 'Mob 2', icon: zone.mobs[1]?.icon ?? '👹', index: 1 },
    { label: zone.mobs[2]?.name ?? 'Mob 3', icon: zone.mobs[2]?.icon ?? '👹', index: 2 },
    { label: zone.boss.name, icon: zone.boss.icon ?? '💀', index: 3, isBoss: true },
  ]

  return (
    <div className="flex flex-col gap-1.5">
      {/* Room progress chain */}
      <div className="flex items-center gap-1">
        {rooms.map((room, i) => {
          const done = mobIndex > room.index
          const active = mobIndex === room.index
          const upcoming = mobIndex < room.index

          return (
            <div key={room.index} className="flex items-center gap-1 flex-1 min-w-0">
              {/* Room node */}
              <div className="flex flex-col items-center gap-0.5 flex-1">
                <motion.div
                  animate={active ? { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] } : {}}
                  transition={active ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : {}}
                  className={`w-8 h-8 rounded flex items-center justify-center text-base border transition-all ${
                    done
                      ? 'border-green-500/50 bg-green-500/15'
                      : active
                        ? 'border-white/30 bg-white/10'
                        : 'border-white/[0.06] bg-white/[0.03] opacity-40'
                  }`}
                  style={active ? { borderColor: `${themeColor}60`, background: `${themeColor}18` } : undefined}
                >
                  {done ? (
                    <span className="text-green-400 text-caption font-bold">✓</span>
                  ) : (
                    <span className={upcoming ? 'opacity-40 text-sm' : 'text-sm'}>{room.icon}</span>
                  )}
                </motion.div>
                <p
                  className={`text-micro font-mono leading-tight text-center truncate w-full ${
                    active ? 'text-white' : done ? 'text-green-400/70' : 'text-gray-600'
                  }`}
                >
                  {room.isBoss ? 'BOSS' : `M${room.index + 1}`}
                </p>
              </div>

              {/* Connector arrow (not after last) */}
              {i < rooms.length - 1 && (
                <span className={`text-micro shrink-0 -mt-2 ${done ? 'text-green-500/60' : 'text-gray-700'}`}>›</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Accumulated gold */}
      {goldEarned > 0 && (
        <div className="flex items-center justify-center gap-1">
          <span className="text-micro text-amber-400 font-mono">🪙 {fmt(goldEarned)} accumulated</span>
        </div>
      )}
    </div>
  )
}
