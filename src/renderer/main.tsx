import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'sans-serif', padding: 24, gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>💥</div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Something went wrong</p>
          <p style={{ fontSize: 12, color: '#888', margin: 0, maxWidth: 320, textAlign: 'center', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '10px 28px', borderRadius: 10, border: '1px solid #00ff8840',
              background: '#00ff8820', color: '#00ff88', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Reload
          </button>
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
