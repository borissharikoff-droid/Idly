import { FRAMES } from '../../lib/cosmetics'

interface AvatarWithFrameProps {
  avatar: string
  frameId?: string | null
  sizeClass: string
  textClass: string
  roundedClass?: string
  ringInsetClass?: string
  ringOpacity?: number
  className?: string
  title?: string
}

export function AvatarWithFrame({
  avatar,
  frameId,
  sizeClass,
  textClass,
  roundedClass = 'rounded-full',
  ringInsetClass = '-inset-0.5',
  ringOpacity = 0.7,
  className,
  title,
}: AvatarWithFrameProps) {
  const frame = FRAMES.find((entry) => entry.id === frameId)
  const frameStyleClass = frame ? `frame-style-${frame.style}` : ''
  const isImageAvatar = /^(https?:\/\/|data:|blob:|file:|\/)/i.test(avatar)
  return (
    <div className={`relative shrink-0 overflow-visible ${frameStyleClass} ${className ?? ''}`} title={title}>
      {frame && (
        <div
          className={`absolute frame-ring ${ringInsetClass} ${roundedClass}`}
          style={{ background: frame.gradient, opacity: ringOpacity, borderColor: frame.color, color: frame.color }}
        />
      )}
      <div
        className={`relative frame-avatar ${sizeClass} ${roundedClass} flex items-center justify-center bg-surface-0 overflow-hidden ${
          frame ? 'border-2' : 'border border-white/10'
        }`}
        style={frame ? { borderColor: frame.color } : undefined}
      >
        {isImageAvatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <span className={textClass}>{avatar}</span>
        )}
      </div>
    </div>
  )
}
