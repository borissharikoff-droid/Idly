import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// ── One-time admin skill fixes ──
// Fix 003: Phil — farmer→21 (1500 XP), chef→1 (0 XP)
// Force-sets localStorage, cookingStore, and queues SQLite override
if (!localStorage.getItem('grindly_admin_fix_003')) {
  try {
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    stored['farmer'] = 1500
    stored['chef'] = 0
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
    // Reset cookingStore's separate cookXp
    const cookSnap = JSON.parse(localStorage.getItem('grindly_cooking_v1') || '{}')
    cookSnap.cookXp = 0
    localStorage.setItem('grindly_cooking_v1', JSON.stringify(cookSnap))
    // Queue SQLite override — applied by syncSkillsToSupabase before it reads SQLite
    localStorage.setItem('grindly_pending_skill_overrides', JSON.stringify([
      { skill_id: 'farmer', total_xp: 1500 },
      { skill_id: 'chef', total_xp: 0 },
    ]))
    localStorage.setItem('grindly_admin_fix_003', '1')
    console.log('[admin] Fix 003: Phil farmer→21 (1500 XP), chef→1 (0 XP)')
  } catch { /* ignore */ }
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; updateVersion: string | null }
> {
  private unsubUpdater: (() => void) | null = null

  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null, updateVersion: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(_: unknown, prev: { error: Error | null }) {
    // Start listening for updates as soon as we enter error state
    if (!prev.error && this.state.error) {
      const api = window.electronAPI
      if (api?.updater?.onStatus && !this.unsubUpdater) {
        this.unsubUpdater = api.updater.onStatus((info) => {
          if (info.status === 'ready') {
            this.setState({ updateVersion: info.version || '?' })
          }
        })
      }
    }
  }
  componentWillUnmount() {
    this.unsubUpdater?.()
  }
  render() {
    if (this.state.error) {
      const { updateVersion } = this.state
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'sans-serif', padding: 24, gap: 16,
        }}>
          {updateVersion ? (
            <>
              <div style={{ fontSize: 40 }}>⬇️</div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Update {updateVersion} ready</p>
              <p style={{ fontSize: 12, color: '#888', margin: 0, maxWidth: 320, textAlign: 'center' }}>
                Restart to apply the update and fix this error.
              </p>
              <button
                onClick={() => window.electronAPI?.updater?.install?.()}
                style={{
                  marginTop: 8, padding: '10px 28px', borderRadius: 10, border: '1px solid #7289da40',
                  background: '#7289da', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Restart & Install
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40 }}>💥</div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Something went wrong</p>
              <p style={{ fontSize: 12, color: '#888', margin: 0, maxWidth: 320, textAlign: 'center', wordBreak: 'break-word' }}>
                {this.state.error.message}
              </p>
              <p style={{ fontSize: 11, color: '#555', margin: 0 }}>Checking for updates…</p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 8, padding: '10px 28px', borderRadius: 10, border: '1px solid #00ff8840',
                  background: '#00ff8820', color: '#00ff88', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Reload
              </button>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// Log unhandled promise rejections to console. The ErrorBoundary handles actual render errors.
// Auto-reloading on unhandled rejections causes the "black screen" problem since many benign
// network/Supabase errors are not caught at the call site.
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  console.warn('[unhandledrejection]', msg)
})


ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
