import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import mascotImg from '../../assets/mascot.png'

const AVATARS = ['🐺', '🦊', '🐱', '🐼', '🦁', '🐸', '🦉', '🐙', '🔥', '💀', '🤖', '👾']

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

  if (!supabase) return <>{children}</>
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
        localStorage.setItem('idly_remember_me', 'true')
      }
    } else {
      let loginEmail = loginId.trim()

      if (!loginEmail.includes('@')) {
        if (!supabase) { setError('Supabase not available'); setBusy(false); return }
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('id, email')
          .ilike('username', loginEmail)
          .limit(1)
        if (profileErr || !profileData?.length) {
          setError('User not found')
          setBusy(false)
          return
        }
        const emailFromProfile = profileData[0]?.email
        if (emailFromProfile) {
          loginEmail = emailFromProfile
        } else {
          setError('Use the email you signed up with to log in.')
          setBusy(false)
          return
        }
      }

      const { error: err } = await signIn(loginEmail, password)
      if (err) { setError(err.message); setBusy(false); return }

      if (rememberMe) {
        localStorage.setItem('idly_remember_me', 'true')
      } else {
        localStorage.setItem('idly_remember_me', 'false')
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
          <motion.div variants={itemVariants} className="text-center mb-4">
            <motion.img
              src={mascotImg}
              alt="Idly"
              className="w-20 h-20 mx-auto mb-2"
              draggable={false}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            />
            <h1 className="text-2xl font-mono font-bold text-[#8b5cf6] mb-1 tracking-wider">
              idly
            </h1>
            <p className="text-gray-400 text-xs">
              {isSignUp ? 'Create your account to start grinding' : 'Welcome back'}
            </p>
          </motion.div>

        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-discord-card border border-white/10 p-6 overflow-hidden"
        >
          <form onSubmit={handleAuth} className="space-y-3">
            <AnimatePresence mode="wait">
              {isSignUp ? (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs text-gray-400 font-mono block mb-1">Pick your avatar</label>
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
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Unique nickname"
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
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:border-discord-accent outline-none transition-colors"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="signin-field"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <input
                    type="text"
                    placeholder="Email or nickname"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                    className="w-full rounded-lg bg-discord-darker border border-white/10 px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:border-discord-accent outline-none transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="space-y-3"
            >
              <input
                type="password"
                placeholder="Password (6+ chars)"
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
                {busy ? '...' : isSignUp ? 'Create account' : 'Sign in'}
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
