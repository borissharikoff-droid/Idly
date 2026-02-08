import { useSessionStore } from '../../stores/sessionStore'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => n.toString().padStart(2, '0')).join(':')
}

export function Timer() {
  const elapsed = useSessionStore((s) => s.elapsedSeconds)
  const status = useSessionStore((s) => s.status)
  const isAfkPaused = useSessionStore((s) => s.isAfkPaused)

  return (
    <div className="text-center">
      <div
        className={`font-mono text-5xl font-bold tabular-nums tracking-wider transition-colors duration-150 ${
          status === 'running'
            ? 'text-cyber-neon animate-timer-glow'
            : status === 'paused'
              ? 'text-yellow-400'
              : 'text-white'
        }`}
      >
        {formatTime(elapsed)}
      </div>
      {/* Status line — always same height, instant switch */}
      <div className="h-5 flex items-center justify-center gap-2 mt-3">
        {status !== 'idle' && (
          <p className="text-xs text-gray-500 font-mono">
            {status === 'running' ? '● grinding...' : '◆ on pause'}
          </p>
        )}
        {isAfkPaused && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/30">
              AFK
            </span>
            <button
              type="button"
              onClick={() => {
                useSessionStore.getState().resume()
                useSessionStore.setState({ isAfkPaused: false })
              }}
              className="text-[10px] font-mono text-cyber-neon hover:underline"
            >
              Продолжить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
