import { useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getItemPower, getItemPerks, type LootItemDef, type LootRarity, type LootSlot } from '../../lib/loot'
import { LootVisual, RARITY_THEME, normalizeRarity, SLOT_LABEL } from '../loot/LootUI'

interface BuffTooltipProps {
  /** Item with name and perkDescription; if null, no tooltip */
  item: { name: string; perkDescription: string; rarity?: LootRarity; slot?: LootSlot; icon?: string; image?: string; renderScale?: number; perks?: LootItemDef['perks']; perkType?: string; perkValue?: string | number; perkTarget?: string } | null
  children: React.ReactNode
  /** Prefer 'top' to avoid overlapping content below */
  placement?: 'top' | 'bottom'
  /** When true, span uses display:block + height:100% so children can use h-full inside flex columns */
  stretch?: boolean
}

const TOOLTIP_OFFSET = 8
const VIEWPORT_PADDING = 8

const PERK_ICONS: Record<string, { icon: string; color: string }> = {
  atk_boost:   { icon: '⚔',  color: '#f87171' },
  hp_boost:    { icon: '♥',  color: '#4ade80' },
  regen_boost: { icon: '❋',  color: '#22d3ee' },
  def_boost:   { icon: '🛡', color: '#818cf8' },
  cosmetic:    { icon: '✦',  color: '#fcd34d' },
}

function ItemTooltipCard({ item }: { item: NonNullable<BuffTooltipProps['item']> }) {
  const rarity = item.rarity ? normalizeRarity(item.rarity) : null
  const theme = rarity ? RARITY_THEME[rarity] : null
  const ip = getItemPower(item as LootItemDef)
  const perks = item.rarity ? getItemPerks(item as LootItemDef) : []

  return (
    <div
      className="rounded overflow-hidden"
      style={{
        minWidth: 188,
        maxWidth: 240,
        background: `linear-gradient(160deg, rgba(20,21,26,0.98) 0%, rgba(12,13,17,0.99) 100%)`,
        border: `1px solid ${theme ? theme.border : 'rgba(255,255,255,0.10)'}`,
        boxShadow: theme
          ? `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${theme.glow}18, inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Top accent bar */}
      {theme && (
        <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, transparent 0%, ${theme.color} 40%, ${theme.color}88 70%, transparent 100%)` }} />
      )}

      {/* Header: icon + name */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
        {(item.icon || item.image) && (
          <div
            className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
            style={theme
              ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}50 0%, rgba(5,5,10,0.95) 70%)`, border: `1px solid ${theme.border}66` }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <LootVisual icon={item.icon} image={item.image} className="w-6 h-6 object-contain" scale={item.renderScale ?? 1} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight" style={{ color: theme ? theme.color : 'rgba(255,255,255,0.9)' }}>
            {item.name}
          </p>
          {item.rarity && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="text-[9px] font-mono font-bold uppercase tracking-wider px-1 py-px rounded-sm"
                style={{ color: theme?.color, background: `${theme?.glow}22`, border: `1px solid ${theme?.border}55` }}
              >
                {item.rarity}
              </span>
              {item.slot && (
                <span className="text-[9px] font-mono uppercase tracking-wide text-gray-500">
                  {SLOT_LABEL[item.slot] ?? item.slot}
                </span>
              )}
              {ip > 0 && (
                <span className="text-[9px] font-mono text-amber-400/60 ml-auto">
                  {ip} IP
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Perks */}
      {perks.length > 0 && (
        <>
          <div className="mx-3 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="px-3 py-2 space-y-1.5">
            {perks.map((p, i) => {
              const perkMeta = PERK_ICONS[p.perkType ?? ''] ?? { icon: '✦', color: '#fcd34d' }
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs flex-shrink-0" style={{ color: perkMeta.color, textShadow: `0 0 8px ${perkMeta.color}66` }}>
                    {perkMeta.icon}
                  </span>
                  <span className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {p.perkDescription}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Fallback perk text (non-gear items) */}
      {perks.length === 0 && item.perkDescription && (
        <>
          <div className="mx-3 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="px-3 py-2">
            <p className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.55)' }}>{item.perkDescription}</p>
          </div>
        </>
      )}
    </div>
  )
}

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
      setStyle({ left: centerX, top, transform })
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
            className="fixed z-[200] pointer-events-none"
            style={{
              left: style.left,
              top: style.top,
              transform: style.transform,
            }}
          >
            <ItemTooltipCard item={item} />
          </div>,
          document.body,
        )}
    </>
  )
}
