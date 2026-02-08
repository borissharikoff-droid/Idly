import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'

interface Goal {
  id: string
  type: string
  target_seconds: number
  target_category: string | null
  period: string
  start_date: string
  completed_at: number | null
}

interface GoalWithProgress extends Goal {
  progress: number
}

const CATEGORY_ICONS: Record<string, string> = {
  coding: '💻',
  design: '🎨',
  games: '🎮',
  social: '💬',
  browsing: '🌐',
  creative: '🎬',
  learning: '📚',
  music: '🎵',
  other: '📁',
}

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'coding', label: '💻 Coding' },
  { value: 'design', label: '🎨 Design' },
  { value: 'learning', label: '📚 Learning' },
  { value: 'creative', label: '🎬 Creative' },
  { value: 'browsing', label: '🌐 Browsing' },
]

const smooth = { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

export function GoalWidget() {
  const [goals, setGoals] = useState<GoalWithProgress[]>([])
  const [showCreator, setShowCreator] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const loadGoals = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.db?.getActiveGoals || !api?.db?.getGoalProgress) return
    const active = await api.db.getActiveGoals()
    const withProgress: GoalWithProgress[] = []
    for (const g of active) {
      const progress = await api.db.getGoalProgress({
        target_category: g.target_category,
        period: g.period,
        start_date: g.start_date,
      })
      withProgress.push({ ...g, progress })
    }
    setGoals(withProgress)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const api = window.electronAPI
    if (!api?.db?.deleteGoal) return
    await api.db.deleteGoal(id)
    setEditingId(null)
    loadGoals()
  }, [loadGoals])

  const handleUpdate = useCallback(async (goal: { id: string; target_seconds: number; target_category: string | null; period: string }) => {
    const api = window.electronAPI
    if (!api?.db?.updateGoal) return
    await api.db.updateGoal(goal)
    setEditingId(null)
    loadGoals()
  }, [loadGoals])

  useEffect(() => {
    loadGoals()
    const interval = setInterval(loadGoals, 30000)
    return () => clearInterval(interval)
  }, [loadGoals])

  return (
    <LayoutGroup>
      <motion.div layout transition={smooth} className="w-full max-w-xs flex flex-col items-center gap-2">
        {/* Goal cards */}
        <AnimatePresence mode="popLayout">
          {goals.map((g) => (
            editingId === g.id ? (
              <motion.div
                key={`edit-${g.id}`}
                layout
                initial={{ opacity: 0, height: 0, scale: 0.97 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.97 }}
                transition={{ ...smooth, duration: 0.4 }}
                className="w-full overflow-hidden"
              >
                <GoalEditor
                  goal={g}
                  onSave={handleUpdate}
                  onDelete={() => handleDelete(g.id)}
                  onCancel={() => setEditingId(null)}
                />
              </motion.div>
            ) : (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={() => setEditingId(g.id)}
              />
            )
          ))}
        </AnimatePresence>

        {/* Creator or "+ add" button */}
        <AnimatePresence mode="wait">
          {showCreator ? (
            <motion.div
              key="creator"
              layout
              initial={{ opacity: 0, height: 0, scale: 0.97 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.97 }}
              transition={{ ...smooth, duration: 0.4 }}
              className="w-full overflow-hidden"
            >
              <GoalCreator
                onCreated={() => { setShowCreator(false); loadGoals() }}
                onCancel={() => setShowCreator(false)}
              />
            </motion.div>
          ) : (
            <motion.button
              key="add-btn"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={smooth}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowCreator(true)}
              className="text-xs text-gray-500 hover:text-gray-400 transition-colors font-mono py-1"
            >
              {goals.length === 0 ? '+ set a goal' : '+ add goal'}
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  )
}

/* ── Goal card (view mode) ──────────────────────────────────────── */

function GoalCard({ goal, onEdit }: { goal: GoalWithProgress; onEdit: () => void }) {
  const pct = Math.min(100, (goal.progress / goal.target_seconds) * 100)
  const isComplete = pct >= 100

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ ...smooth, duration: 0.4 }}
      className={`group w-full rounded-xl px-3.5 py-2.5 border transition-colors duration-300 cursor-pointer ${
        isComplete
          ? 'bg-cyber-neon/10 border-cyber-neon/30'
          : 'bg-discord-card/50 border-white/5 hover:border-white/10'
      }`}
      onClick={onEdit}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-300">
          {goal.target_category ? CATEGORY_ICONS[goal.target_category] || '🎯' : '🎯'}{' '}
          {goal.period === 'daily' ? 'Daily' : 'Weekly'}: {formatDuration(goal.target_seconds)}
          {goal.target_category ? ` ${goal.target_category}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono ${isComplete ? 'text-cyber-neon' : 'text-gray-500'}`}>
            {formatDuration(goal.progress)} / {formatDuration(goal.target_seconds)}
          </span>
          {/* Edit hint — visible on hover */}
          <motion.span
            initial={{ opacity: 0 }}
            className="text-[10px] text-gray-600 group-hover:opacity-100 opacity-0 transition-opacity duration-200"
          >
            ✏️
          </motion.span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-discord-darker/80 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full ${isComplete ? 'bg-cyber-neon shadow-[0_0_8px_rgba(0,255,136,0.4)]' : 'bg-cyber-neon/60'}`}
        />
      </div>
    </motion.div>
  )
}

/* ── Goal editor (inline edit mode) ─────────────────────────────── */

function GoalEditor({
  goal,
  onSave,
  onDelete,
  onCancel,
}: {
  goal: GoalWithProgress
  onSave: (g: { id: string; target_seconds: number; target_category: string | null; period: string }) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [period, setPeriod] = useState<'daily' | 'weekly'>(goal.period as 'daily' | 'weekly')
  const [hours, setHours] = useState(Math.round(goal.target_seconds / 3600))
  const [category, setCategory] = useState(goal.target_category || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = () => {
    onSave({
      id: goal.id,
      target_seconds: hours * 3600,
      target_category: category || null,
      period,
    })
  }

  const hasChanges =
    period !== goal.period ||
    hours !== Math.round(goal.target_seconds / 3600) ||
    (category || null) !== (goal.target_category || null)

  return (
    <div className="rounded-xl bg-discord-card/80 border border-cyber-neon/20 p-3.5 space-y-2.5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Edit goal</span>
        <button
          onClick={onCancel}
          className="text-gray-600 hover:text-gray-400 transition-colors text-xs w-5 h-5 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {/* Period toggle */}
      <div className="flex gap-2">
        {(['daily', 'weekly'] as const).map((p) => (
          <motion.button
            key={p}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPeriod(p)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-200 ${
              period === p
                ? 'bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30 shadow-[0_0_8px_rgba(0,255,136,0.1)]'
                : 'bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            {p === 'daily' ? 'Daily' : 'Weekly'}
          </motion.button>
        ))}
      </div>

      {/* Hours slider */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-gray-400 shrink-0">Hours:</span>
        <input
          type="range"
          min={1}
          max={period === 'daily' ? 12 : 40}
          value={hours}
          onChange={(e) => setHours(parseInt(e.target.value, 10))}
          className="flex-1 accent-cyber-neon h-1 cursor-pointer"
        />
        <span className="text-xs font-mono text-cyber-neon w-6 text-right font-bold">{hours}</span>
      </div>

      {/* Category picker */}
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full text-xs py-1.5 px-2.5 rounded-lg bg-discord-darker border border-white/10 text-gray-300 focus:outline-none focus:border-cyber-neon/40 transition-colors duration-200 cursor-pointer"
      >
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      {/* Actions */}
      <div className="flex gap-2 pt-0.5">
        {/* Delete button */}
        <AnimatePresence mode="wait">
          {confirmDelete ? (
            <motion.div
              key="confirm-delete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={smooth}
              className="flex gap-1.5 flex-1"
            >
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setConfirmDelete(false)}
                className="flex-1 text-xs py-1.5 rounded-lg bg-discord-darker text-gray-400 border border-white/5 transition-colors duration-200"
              >
                Keep
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onDelete}
                className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 font-semibold transition-colors duration-200 hover:bg-red-500/30"
              >
                Delete
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              key="delete-btn"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={smooth}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setConfirmDelete(true)}
              className="text-xs py-1.5 px-3 rounded-lg bg-discord-darker text-red-400/70 border border-white/5 hover:border-red-500/20 hover:text-red-400 transition-all duration-200"
            >
              🗑
            </motion.button>
          )}
        </AnimatePresence>

        {/* Save button */}
        {!confirmDelete && (
          <motion.button
            layout
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex-1 text-xs py-1.5 rounded-lg border font-semibold transition-all duration-200 ${
              hasChanges
                ? 'bg-cyber-neon/20 text-cyber-neon border-cyber-neon/30 hover:bg-cyber-neon/30'
                : 'bg-discord-darker text-gray-500 border-white/5 cursor-default'
            }`}
          >
            Save
          </motion.button>
        )}
      </div>
    </div>
  )
}

/* ── Goal creator form ────────────────────────────────────────────── */

function GoalCreator({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const [hours, setHours] = useState(2)
  const [category, setCategory] = useState<string>('')

  const handleCreate = async () => {
    const api = window.electronAPI
    if (!api?.db?.createGoal) return
    await api.db.createGoal({
      id: crypto.randomUUID(),
      type: category ? 'category' : 'total',
      target_seconds: hours * 3600,
      target_category: category || null,
      period,
      start_date: new Date().toISOString().slice(0, 10),
    })
    onCreated()
  }

  return (
    <div className="rounded-xl bg-discord-card/70 border border-white/10 p-3.5 space-y-2.5 backdrop-blur-sm">
      {/* Period toggle */}
      <div className="flex gap-2">
        {(['daily', 'weekly'] as const).map((p) => (
          <motion.button
            key={p}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPeriod(p)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-200 ${
              period === p
                ? 'bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30 shadow-[0_0_8px_rgba(0,255,136,0.1)]'
                : 'bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            {p === 'daily' ? 'Daily' : 'Weekly'}
          </motion.button>
        ))}
      </div>

      {/* Hours slider */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-gray-400 shrink-0">Hours:</span>
        <input
          type="range"
          min={1}
          max={period === 'daily' ? 12 : 40}
          value={hours}
          onChange={(e) => setHours(parseInt(e.target.value, 10))}
          className="flex-1 accent-cyber-neon h-1 cursor-pointer"
        />
        <span className="text-xs font-mono text-cyber-neon w-6 text-right font-bold">{hours}</span>
      </div>

      {/* Category picker */}
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full text-xs py-1.5 px-2.5 rounded-lg bg-discord-darker border border-white/10 text-gray-300 focus:outline-none focus:border-cyber-neon/40 transition-colors duration-200 cursor-pointer"
      >
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      {/* Actions */}
      <div className="flex gap-2 pt-0.5">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={onCancel}
          className="flex-1 text-xs py-1.5 rounded-lg bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10 transition-colors duration-200"
        >
          Cancel
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleCreate}
          className="flex-1 text-xs py-1.5 rounded-lg bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30 font-semibold hover:bg-cyber-neon/30 transition-colors duration-200"
        >
          Create
        </motion.button>
      </div>
    </div>
  )
}
