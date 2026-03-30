// Small SVG sparkline for price history visualization with hover tooltip.

import { useState, useRef, useCallback } from 'react'

interface PriceSparklineProps {
  prices: number[]
  dates?: string[]
  width?: number
  height?: number
  color?: string
}

export function PriceSparkline({ prices, dates, width = 120, height = 32, color = '#f59e0b' }: PriceSparklineProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; price: number; date: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (prices.length < 2) {
    return (
      <span className="text-micro text-gray-600 font-mono">no data</span>
    )
  }

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2

  const coords = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * w,
    y: pad + h - ((p - min) / range) * h,
  }))

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')

  const lastPrice = prices[0]
  const firstPrice = prices[prices.length - 1]
  const trending = lastPrice >= firstPrice
  const lineColor = trending ? '#22c55e' : '#ef4444'
  const resolvedColor = color !== '#f59e0b' ? color : lineColor

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const rx = e.clientX - rect.left
    const idx = Math.round((rx / rect.width) * (prices.length - 1))
    const clampedIdx = Math.max(0, Math.min(prices.length - 1, idx))
    const date = dates?.[clampedIdx] ? new Date(dates[clampedIdx]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      price: prices[clampedIdx],
      date,
    })
  }, [prices, dates])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className="relative inline-block">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="shrink-0 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <polyline
          points={polyline}
          fill="none"
          stroke={resolvedColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.9"
        />
        {/* Last point dot */}
        {coords[0] && (
          <circle
            cx={coords[0].x}
            cy={coords[0].y}
            r="2"
            fill={resolvedColor}
          />
        )}
        {/* Hover crosshair dot */}
        {tooltip && (() => {
          const rx = (tooltip.x - (svgRef.current?.getBoundingClientRect().left ?? 0))
          const idx = Math.round((rx / width) * (prices.length - 1))
          const c = coords[Math.max(0, Math.min(prices.length - 1, idx))]
          return c ? (
            <circle cx={c.x} cy={c.y} r="3" fill={resolvedColor} opacity="0.9" />
          ) : null
        })()}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded px-2 py-1 text-xs font-mono leading-tight"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 36,
            background: 'rgba(15,14,26,0.97)',
            border: '1px solid rgba(124,58,237,0.35)',
            color: '#eae6f5',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.date && (
            <div className="text-gray-500" style={{ fontSize: 10 }}>{tooltip.date}</div>
          )}
          <div>
            <span style={{ color: resolvedColor, fontWeight: 700 }}>{tooltip.price.toLocaleString()}</span>
            <span className="text-gray-500"> gold</span>
          </div>
        </div>
      )}
    </div>
  )
}
