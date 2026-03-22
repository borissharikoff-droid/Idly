import { useState } from 'react'
import { motion } from 'framer-motion'

interface OverviewAnalysisProps {
  totalSessions: number
  totalSeconds: number
  contextSwitches: number
  totalKeystrokes: number
  appUsage: { app_name: string; category: string; total_ms: number }[]
  categoryStats: { category: string; total_ms: number }[]
  windowTitles: { app_name: string; window_title: string; total_ms: number }[]
  periodLabel: string
}

const BLOCK_ICONS = ['🧠', '🎯', '💪', '🏆']
const BLOCK_LABELS = ['Behavior Profile', 'Main Distractions', 'Strengths & Risks', 'Recommended Next Step']

function parseBlocks(text: string): string[] {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length >= 2) return paragraphs.slice(0, 4)
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length >= 2) {
    const blocks: string[] = []
    let current = ''
    for (const line of lines) {
      if (/^\d+[\.\)]/.test(line) && current) {
        blocks.push(current.trim())
        current = line.replace(/^\d+[\.\)]\s*/, '')
      } else {
        current += (current ? ' ' : '') + line.replace(/^\d+[\.\)]\s*/, '')
      }
    }
    if (current) blocks.push(current.trim())
    return blocks.slice(0, 4)
  }
  return [text]
}

export function OverviewAnalysis(props: OverviewAnalysisProps) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = () => {
    const api = window.electronAPI
    if (!api?.ai?.analyzeOverview) return
    setLoading(true)
    setError(null)
    api.ai
      .analyzeOverview({
        totalSessions: props.totalSessions,
        totalSeconds: props.totalSeconds,
        contextSwitches: props.contextSwitches,
        totalKeystrokes: props.totalKeystrokes,
        appUsage: props.appUsage.slice(0, 15),
        categoryStats: props.categoryStats,
        windowTitles: props.windowTitles.slice(0, 30),
        periodLabel: props.periodLabel,
      })
      .then(setText)
      .catch((e: Error) => setError(e?.message || 'Analysis failed'))
      .finally(() => setLoading(false))
  }

  const blocks = text ? parseBlocks(text) : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card bg-surface-2/85 border border-white/10 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
          <span className="text-micro text-gray-300">AI</span>
        </div>
        <p className="text-xs uppercase tracking-widest text-gray-300 font-semibold">AI BEHAVIOR SUMMARY</p>
        <span className="text-micro text-gray-500 ml-auto">{props.periodLabel}</span>
      </div>

      {error && (
        <div className="rounded bg-red-500/10 border border-red-500/20 p-3 mb-2">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-6 gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-400"
          />
          <p className="text-gray-300 text-sm animate-pulse">Analyzing your activity patterns...</p>
        </div>
      ) : blocks.length > 0 ? (
        <div className="space-y-2.5">
          {blocks.map((block, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded bg-surface-0/80 border border-white/5 p-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">
                  {BLOCK_ICONS[i % BLOCK_ICONS.length]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-micro text-gray-500 mb-1 uppercase tracking-wider">
                    {BLOCK_LABELS[i % BLOCK_LABELS.length]}
                  </p>
                  <p className="text-sm text-gray-300 leading-relaxed">{block}</p>
                </div>
              </div>
            </motion.div>
          ))}
          <button onClick={() => setText(null)} className="text-micro text-gray-600 hover:text-gray-400 transition-colors">
            Reset
          </button>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-gray-500 text-sm mb-3">
            AI summary of your behavior: what helps your focus and what hurts it.
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={runAnalysis}
            disabled={props.totalSessions === 0}
            className="px-5 py-2.5 rounded bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate AI Summary
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}
