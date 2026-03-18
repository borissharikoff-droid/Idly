import { useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getItemPower, getItemPerks, type LootItemDef, type LootRarity, type LootSlot } from '../../lib/loot'
import { RARITY_THEME, normalizeRarity, SLOT_LABEL } from '../loot/LootUI'

interface BuffTooltipProps {
  /** Item with name and perkDescription; if null, no tooltip */
  item: { name: string; perkDescription: string; rarity?: LootRarity; slot?: LootSlot; perks?: LootItemDef['perks']; perkType?: string; perkValue?: string | number; perkTarget?: string } | null
  children: React.ReactNode
  /** Prefer 'top' to avoid overlapping content below */
  placement?: 'top' | 'bottom'
  /** When true, span uses display:flex + height:100% so children can use h-full inside flex columns */
  stretch?: boolean
}

const TOOLTIP_OFFSET = 6
const VIEWPORT_PADDING = 8

/**
 * Shows a hover tooltip with the item's buff (perk description).
 * Tooltip is rendered in a portal with position:fixed so layout never shifts.
 * Flips placement when near viewport edges so it stays fully visible.
 */
export function BuffTooltip({ item, children, placement = 'bottom', stretch = false }: BuffTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  const [style, setStyle] = useState<{ left: number; top: number; transform: string }>({
    left: 0,
    top: 0,
    transform: 'translateX(-50%)',
  })

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    let top = placement === 'top' ? rect.top - TOOLTIP_OFFSET : rect.bottom + TOOLTIP_OFFSET
    let transform = placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)'

    if (tooltip) {
      const tr = tooltip.getBoundingClientRect()
      const halfW = tr.width / 2

      let left = centerX
      if (centerX - halfW < VIEWPORT_PADDING) {
        left = VIEWPORT_PADDING + halfW
      } else if (centerX + halfW > window.innerWidth - VIEWPORT_PADDING) {
        left = window.innerWidth - VIEWPORT_PADDING - halfW
      }

      if (placement === 'top') {
        const tooltipTop = top - tr.height
        if (tooltipTop < VIEWPORT_PADDING) {
          top = rect.bottom + TOOLTIP_OFFSET
          transform = 'translateX(-50%)'
        }
      } else {
        const tooltipBottom = top + tr.height
        if (tooltipBottom > window.innerHeight - VIEWPORT_PADDING) {
          top = rect.top - TOOLTIP_OFFSET
          transform = 'translate(-50%, -100%)'
        }
      }

      setStyle({ left, top, transform })
    } else {
      setStyle({
        left: centerX,
        top,
        transform,
      })
    }
  }, [placement])

  useLayoutEffect(() => {
    if (!show) return
    updatePosition()
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [show, updatePosition])

  if (!item) {
    return <>{children}</>
  }

  const onEnter = () => {
    const trigger = triggerRef.current
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const top = placement === 'top' ? rect.top - TOOLTIP_OFFSET : rect.bottom + TOOLTIP_OFFSET
      const transform = placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)'
      setStyle({ left: centerX, top, transform })
    }
    setShow(true)
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={onEnter}
        onMouseLeave={() => setShow(false)}
        style={stretch ? { display: 'block', height: '100%' } : { display: 'inline-flex' }}
      >
        {children}
      </span>
      {show &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-[200] max-w-[240px] rounded-lg border border-cyber-neon/25 bg-discord-card px-2.5 py-2 shadow-xl pointer-events-none"
            style={{
              left: style.left,
              top: style.top,
              transform: style.transform,
            }}
          >
            <p className="text-[10px] font-semibold text-cyber-neon">{item.name}</p>
            {item.rarity && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono font-bold uppercase" style={{ color: RARITY_THEME[normalizeRarity(item.rarity)].color }}>
                  {item.rarity}
                </span>
                {item.slot && <span className="text-[10px] font-mono text-gray-500 uppercase">{SLOT_LABEL[item.slot] ?? item.slot}</span>}
                <span className="text-[10px] font-mono text-amber-400/70">IP {getItemPower(item as LootItemDef)}</span>
              </div>
            )}
            {item.rarity && (item.perks?.length || item.perkType) ? (
              <div className="mt-1 space-y-0.5">
                {getItemPerks(item as LootItemDef).map((p, i) => (
                  <p key={i} className="text-[10px] text-green-400 leading-snug">{p.perkDescription}</p>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-300 leading-snug mt-0.5">{item.perkDescription}</p>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
