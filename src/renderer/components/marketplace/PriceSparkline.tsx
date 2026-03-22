// Small SVG sparkline for price history visualization.

interface PriceSparklineProps {
  prices: number[]
  width?: number
  height?: number
  color?: string
}

export function PriceSparkline({ prices, width = 120, height = 32, color = '#f59e0b' }: PriceSparklineProps) {
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

  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * w
    const y = pad + h - ((p - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const polyline = points.join(' ')
  const lastPrice = prices[0]
  const firstPrice = prices[prices.length - 1]
  const trending = lastPrice >= firstPrice

  const lineColor = trending ? '#22c55e' : '#ef4444'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline
        points={polyline}
        fill="none"
        stroke={color !== '#f59e0b' ? color : lineColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* Last point dot */}
      {points[0] && (
        <circle
          cx={parseFloat(points[0].split(',')[0])}
          cy={parseFloat(points[0].split(',')[1])}
          r="2"
          fill={color !== '#f59e0b' ? color : lineColor}
        />
      )}
    </svg>
  )
}
