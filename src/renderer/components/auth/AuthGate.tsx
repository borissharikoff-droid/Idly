import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import mascotImg from '../../assets/mascot.png'

const AVATARS = ['🐺', '🦊', '🐱', '🐼', '🦁', '🐸', '🦉', '🐙', '🔥', '💀', '🤖', '👾']

const BG_ICONS: {
  emoji: string; x: number; y: number; size: number
  depth: number; rotate: number; floatDur: number
}[] = [
  { emoji: '🎁', x: 6,  y: 8,   size: 22, depth: 1.8, rotate: -12, floatDur: 2.8 },
  { emoji: '⚡', x: 88, y: 6,   size: 20, depth: 2.2, rotate: 15,  floatDur: 2.2 },
  { emoji: '🎯', x: 4,  y: 72,  size: 18, depth: 1.5, rotate: 8,   floatDur: 3.2 },
  { emoji: '👥', x: 90, y: 70,  size: 19, depth: 2.0, rotate: -10, floatDur: 2.6 },
  { emoji: '🏆', x: 92, y: 40,  size: 20, depth: 1.6, rotate: 5,   floatDur: 3.0 },
  { emoji: '⭐', x: 3,  y: 42,  size: 17, depth: 2.4, rotate: -20, floatDur: 2.4 },
  { emoji: '💎', x: 50, y: 82,  size: 16, depth: 1.9, rotate: -8,  floatDur: 3.4 },
]

function HeroBanner() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setTilt({
      x: (e.clientX - cx) / (rect.width / 2),
      y: (e.clientY - cy) / (rect.height / 2),
    })
  }, [])

  const mascotX = tilt.x * 5
  const mascotY = tilt.y * -3
  const glowX = 50 + tilt.x * 12
  const glowY = 40 + tilt.y * 10

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setTilt({ x: 0, y: 0 }) }}
      className="relative w-full select-none mb-2"
      style={{ height: 140 }}
    >
      {/* Parallax glow */}
      <div
        className="absolute w-32 h-32 rounded-full pointer-events-none blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(88,101,242,0.15), transparent 70%)',
          left: `${glowX}%`,
          top: `${glowY}%`,
          transform: 'translate(-50%, -50%)',
          transition: hovering ? 'left 0.1s, top 0.1s' : 'left 0.5s, top 0.5s',
        }}
      />

      {/* Floating icons */}
      {BG_ICONS.map((icon, i) => (
        <motion.span
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: `${icon.x}%`,
            top: `${icon.y}%`,
            fontSize: icon.size,
          }}
          animate={{
            opacity: hovering ? 0.35 : 0.10,
            scale: hovering ? 1.1 : 0.85,
            rotate: hovering ? icon.rotate + (i % 2 === 0 ? 6 : -6) : icon.rotate,
            x: tilt.x * icon.depth * 4,
            y: hovering ? tilt.y * icon.depth * -3 : 0,
            filter: hovering ? 'grayscale(0)' : 'grayscale(0.6)',
          }}
          transition={{
            x: { type: 'spring', stiffness: 180, damping: 22 },
            y: { type: 'spring', stiffness: 180, damping: 22 },
            opacity: { duration: 0.3 },
            scale: { type: 'spring', stiffness: 300, damping: 18 },
            rotate: { type: 'spring', stiffness: 120, damping: 14 },
            filter: { duration: 0.3 },
          }}
        >
          <span
            className="inline-block"
            style={{
              animation: `authFloat${i % 3} ${icon.floatDur}s ease-in-out infinite`,
              animationDelay: `${i * 0.35}s`,
            }}
          >
            {icon.emoji}
          </span>
        </motion.span>
      ))}

      {/* Mascot */}
      <motion.img
        src={mascotImg}
        alt="Grindly"
        className="absolute left-1/2 top-[28%] w-20 h-20 drop-shadow-[0_0_12px_rgba(88,101,242,0.3)]"
        style={{ x: '-50%' }}
        draggable={false}
        animate={{ x: `calc(-50% + ${mascotX}px)`, y: mascotY }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      />

      {/* Title + subtitle */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 text-center"
        animate={{ x: tilt.x * 2, y: tilt.y * -1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <h1 className="text-xl font-semibold text-white tracking-wide">Grindly</h1>
      </motion.div>

      <style>{`
        @keyframes authFloat0 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(3deg); }
        }
        @keyframes authFloat1 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-6px) rotate(-2deg); }
        }
        @keyframes authFloat2 {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.05); }
        }
      `}</style>
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, init, signIn, signUp } = useAuthStore()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [isSignUp, setIsSignUp] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [rememberMe, setRememberMe] = useState(true)

  useEffect(() => { init() }, [init])

  useEffect(() => {
    if (!username.trim() || username.length < 3 || !supabase) {
      setUsernameAvailable(null)
      return
    }
    const t = setTimeout(async () => {
      if (!supabase) return
      const { data } = await supabase.from('profiles').select('id').eq('username', username.trim()).limit(1)
      setUsernameAvailable(!data || data.length === 0)
    }, 500)
    return () => clearTimeout(t)
  }, [username])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-discord-darker">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-3"
        >
          <motion.div
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-3xl"
          >
            ⏳
          </motion.div>
          <span className="text-xs text-gray-500 font-mono">Loading...</span>
        </motion.div>
      </div>
    )
  }
  if (user) return <>{children}</>

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)

    if (isSignUp) {
      if (!username.trim() || username.length < 3) {
        setError('Username must be 3+ characters')
        setBusy(false)
        return
      }
      if (!email.includes('@')) {
        setError('Enter a valid email')
        setBusy(false)
        return
      }
      if (usernameAvailable === false) {
        setError('Username taken. Pick another.')
        setBusy(false)
        return
      }
      const { error: err } = await signUp(email, password, username.trim())
      if (err) { setError(err.message); setBusy(false); return }
      if (supabase) {
        const { data: { user: newUser } } = await supabase.auth.getUser()
        if (newUser) {
          await supabase.from('profiles').upsert(
            {
              id: newUser.id,
              username: username.trim(),
              avatar_url: avatar,
              email: email.trim().toLowerCase(),
            },
            { onConflict: 'id' }
          )
        }
        localStorage.setItem('grindly_remember_me', 'true')
      }
    } else {
      let loginEmail = loginId.trim()

      if (!loginEmail.includes('@')) {
        if (!supabase) { setError('Supabase not available'); setBusy(false); return }
        const { data: email, error: rpcErr } = await supabase
          .rpc('get_email_by_username', { p_username: loginEmail })
        console.log('[auth] username lookup:', { loginEmail, email, rpcErr })
        if (rpcErr || !email) {
          setError(rpcErr ? rpcErr.message : 'User not found')
          setBusy(false)
          return
        }
        loginEmail = email as string
      }

      const { error: err } = await signIn(loginEmail, password)
      if (err) { setError(err.message); setBusy(false); return }

      if (rememberMe) {
        localStorage.setItem('grindly_remember_me', 'true')
      } else {
        localStorage.setItem('grindly_remember_me', 'false')
      }
    }

    setBusy(false)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.1 },
    },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-discord-darker p-4 overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center py-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-sm flex-shrink-0"
        >
          <motion.div variants={itemVariants}>
            <HeroBanner />
            <AnimatePresence mode="wait">
              <motion.p
                key={isSignUp ? 'sub-signup' : 'sub-signin'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="text-gray-400 text-sm text-center mb-4"
              >
                {isSignUp ? 'Create your account to start focus tracking' : 'Welcome back'}
              </motion.p>
            </AnimatePresence>
          </motion.div>

        <motion.div
          variants={itemVariants}
          layout
          transition={{ layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
          className="rounded-2xl bg-discord-card border border-white/10 p-6 overflow-hidden"
        >
          <form onSubmit={handleAuth} className="space-y-3">
            <motion.div
              animate={{ height: 'auto' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
            <AnimatePresence mode="wait" initial={false}>
              {isSignUp ? (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Pick your avatar</label>
                    <div className="flex flex-wrap gap-2">
                      {AVATARS.map((a) => (
                        <button
                          type="button"
                          key={a}
                          onClick={() => setAvatar(a)}
                          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90 ${
                            avatar === a
                              ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                              : 'bg-discord-dark border border-white/10 hover:border-white/20'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Username</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. phil_dev"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                        className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:border-discord-accent outline-none transition-colors"
                      />
                      {username.length >= 3 && usernameAvailable !== null && (
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${usernameAvailable ? 'text-cyber-neon' : 'text-discord-red'}`}>
                          {usernameAvailable ? 'available' : 'taken'}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1 ml-0.5">Usernames are unique and visible to friends</p>
                  </div>
                  <label className="text-xs text-gray-400 block -mb-2">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:border-discord-accent outline-none transition-colors"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="signin-field"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <input
                    type="text"
                    placeholder="Email or username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                    className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:border-discord-accent outline-none transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="space-y-3"
            >
              <input
                type="password"
                placeholder="Password (minimum 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:border-discord-accent outline-none transition-colors"
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-discord-red text-xs"
                >
                  {error}
                </motion.p>
              )}
              {!isSignUp && (
                <div className="flex items-center gap-2 px-1">
                  <input
                    type="checkbox"
                    id="remember-me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-white/10 bg-discord-darker accent-cyber-neon focus:ring-0 w-3.5 h-3.5"
                  />
                  <label htmlFor="remember-me" className="text-xs text-gray-400 cursor-pointer select-none">
                    Remember me
                  </label>
                </div>
              )}

              <motion.button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-cyber-neon text-discord-darker font-bold text-sm hover:shadow-glow disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                whileHover={!busy ? { scale: 1.01 } : undefined}
                whileTap={!busy ? { scale: 0.99 } : undefined}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={busy ? 'busy' : isSignUp ? 'btn-signup' : 'btn-signin'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {busy ? '...' : isSignUp ? 'Create account' : 'Sign in'}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </motion.div>
          </form>
          <motion.button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError('') }}
            className="mt-4 w-full text-center text-xs text-gray-500 hover:text-white transition-colors duration-200"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </motion.button>
        </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
