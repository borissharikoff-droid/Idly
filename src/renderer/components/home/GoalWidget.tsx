import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/* ── Types ── */

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

interface Task {
  id: string
  text: string
  done: number
  created_at: number
}

/* ── Constants ── */

const CATEGORY_ICONS: Record<string, string> = {
  coding: '💻', design: '🎨', games: '🎮', social: '💬',
  browsing: '🌐', creative: '🎬', learning: '📚', music: '🎵', other: '📁',
}

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'coding', label: '💻 Coding' },
  { value: 'design', label: '🎨 Design' },
  { value: 'learning', label: '📚 Learning' },
  { value: 'creative', label: '🎬 Creative' },
  { value: 'browsing', label: '🌐 Browsing' },
]

const TASKS_STORAGE_KEY = 'idly_tasks'

function getTasksFromStorage(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Task[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function setTasksInStorage(tasks: Task[]): void {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

/* ── Main Widget ── */

type ViewMode = 'list' | 'add-pick' | 'add-time' | 'add-task' | 'edit'

export function GoalWidget() {
  const [goals, setGoals] = useState<GoalWithProgress[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<ViewMode>('list')
  const [editingGoal, setEditingGoal] = useState<GoalWithProgress | null>(null)
  const [reachedGoal, setReachedGoal] = useState<GoalWithProgress | null>(null)
  const prevProgressRef = useRef<Record<string, number>>({})

  const loadGoals = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.db?.getActiveGoals || !api?.db?.getGoalProgress) return
    try {
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
      // Detect first-time reach: progress just crossed target_seconds
      for (const g of withProgress) {
        if (g.progress >= g.target_seconds) {
          const prev = prevProgressRef.current[g.id] ?? 0
          if (prev < g.target_seconds) {
            setReachedGoal(g)
            break
          }
        }
      }
      withProgress.forEach((g) => { prevProgressRef.current[g.id] = g.progress })
    } catch (e) { console.error('loadGoals failed', e) }
  }, [])

  const loadTasks = useCallback(async () => {
    const api = window.electronAPI
    if (api?.db?.getTasks) {
      try {
        const t = await api.db.getTasks()
        setTasks(t)
      } catch (e) { console.error('loadTasks failed', e) }
      return
    }
    setTasks(getTasksFromStorage())
  }, [])

  const loadAll = useCallback(() => { loadGoals(); loadTasks() }, [loadGoals, loadTasks])

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, 15000)
    return () => clearInterval(interval)
  }, [loadAll])

  const handleCompleteGoal = useCallback(async () => {
    if (!reachedGoal) return
    const api = window.electronAPI
    if (!api?.db?.completeGoal) return
    try {
      await api.db.completeGoal(reachedGoal.id)
      setReachedGoal(null)
      setTimeout(loadGoals, 100)
    } catch (e) { console.error('completeGoal failed', e) }
  }, [reachedGoal, loadGoals])

  const handleAddOneHour = useCallback(async () => {
    if (!reachedGoal) return
    const api = window.electronAPI
    if (!api?.db?.updateGoal) return
    try {
      await api.db.updateGoal({
        id: reachedGoal.id,
        target_seconds: reachedGoal.target_seconds + 3600,
        target_category: reachedGoal.target_category,
        period: reachedGoal.period,
      })
      prevProgressRef.current[reachedGoal.id] = reachedGoal.progress
      setReachedGoal(null)
      setTimeout(loadGoals, 100)
    } catch (e) { console.error('updateGoal +1h failed', e) }
  }, [reachedGoal, loadGoals])

  const handleDeleteGoal = useCallback(async (id: string) => {
    const api = window.electronAPI
    if (!api?.db?.deleteGoal) return
    try {
      await api.db.deleteGoal(id)
      setView('list')
      setEditingGoal(null)
      setTimeout(loadGoals, 100)
    } catch (err) {
      console.error('Failed to delete goal:', err)
    }
  }, [loadGoals])

  const handleUpdateGoal = useCallback(async (goal: { id: string; target_seconds: number; target_category: string | null; period: string }) => {
    const api = window.electronAPI
    if (!api?.db?.updateGoal) return
    try {
      await api.db.updateGoal(goal)
      setView('list')
      setEditingGoal(null)
      setTimeout(loadGoals, 100)
    } catch (err) {
      console.error('Failed to update goal:', err)
    }
  }, [loadGoals])

  const handleToggleTask = useCallback(async (id: string) => {
    const api = window.electronAPI
    if (api?.db?.toggleTask) {
      await api.db.toggleTask(id)
    } else {
      const list = getTasksFromStorage()
      const idx = list.findIndex((t) => t.id === id)
      if (idx >= 0) {
        list[idx] = { ...list[idx], done: list[idx].done ? 0 : 1 }
        setTasksInStorage(list)
      }
    }
    loadTasks()
  }, [loadTasks])

  const handleUpdateTaskText = useCallback(async (id: string, text: string) => {
    const api = window.electronAPI
    if (api?.db?.updateTaskText) {
      await api.db.updateTaskText(id, text)
    } else {
      const list = getTasksFromStorage().map((t) => t.id === id ? { ...t, text } : t)
      setTasksInStorage(list)
    }
    loadTasks()
  }, [loadTasks])

  const handleDeleteTask = useCallback(async (id: string) => {
    const api = window.electronAPI
    if (api?.db?.deleteTask) {
      await api.db.deleteTask(id)
    } else {
      setTasksInStorage(getTasksFromStorage().filter((t) => t.id !== id))
    }
    loadTasks()
  }, [loadTasks])

  const handleClearDone = useCallback(async () => {
    const api = window.electronAPI
    if (api?.db?.clearDoneTasks) {
      await api.db.clearDoneTasks()
    } else {
      setTasksInStorage(getTasksFromStorage().filter((t) => t.done === 0))
    }
    loadTasks()
  }, [loadTasks])

  const isEmpty = goals.length === 0 && tasks.length === 0

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Existing goals */}
      {goals.map((g) => (
        view === 'edit' && editingGoal?.id === g.id ? (
          <div key={`edit-${g.id}`} className="w-full">
            <GoalEditor
              goal={g}
              onSave={handleUpdateGoal}
              onDelete={() => handleDeleteGoal(g.id)}
              onCancel={() => { setView('list'); setEditingGoal(null) }}
            />
          </div>
        ) : (
          <GoalCard
            key={g.id}
            goal={g}
            onEdit={() => { setEditingGoal(g); setView('edit') }}
          />
        )
      ))}

      {/* Tasks checklist */}
      {tasks.length > 0 && (
        <div className="w-full space-y-1">
          {tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggle={() => handleToggleTask(t.id)}
              onDelete={() => handleDeleteTask(t.id)}
              onUpdateText={(text) => handleUpdateTaskText(t.id, text)}
            />
          ))}
          {tasks.some(t => t.done) && (
            <button
              onClick={handleClearDone}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors font-mono ml-1"
            >
              clear done
            </button>
          )}
        </div>
      )}

      {/* Add flow */}
      <AnimatePresence mode="wait">
        {view === 'add-pick' && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full overflow-hidden"
          >
            <GoalTypePicker
              onPickTime={() => setView('add-time')}
              onPickTask={() => setView('add-task')}
              onCancel={() => setView('list')}
            />
          </motion.div>
        )}
        {view === 'add-time' && (
          <motion.div
            key="time"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full overflow-hidden"
          >
            <GoalCreator
              onCreated={() => { setView('list'); loadGoals() }}
              onCancel={() => setView('add-pick')}
            />
          </motion.div>
        )}
        {view === 'add-task' && (
          <motion.div
            key="task"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full overflow-hidden"
          >
            <TaskCreator
              onCreated={() => { setView('list'); loadTasks() }}
              onCancel={() => setView('add-pick')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add button — centered */}
      {view === 'list' && (
        <button
          onClick={() => setView('add-pick')}
          className="w-full text-center text-xs text-gray-500 hover:text-cyber-neon/90 transition-colors font-mono py-2 rounded-lg hover:bg-cyber-neon/[0.06] active:scale-[0.98] border border-transparent hover:border-cyber-neon/20"
        >
          {isEmpty ? '+ set a goal' : '+ add goal'}
        </button>
      )}

      <GoalReachedModal
        goal={reachedGoal}
        onClose={handleCompleteGoal}
        onAddOneHour={handleAddOneHour}
      />
    </div>
  )
}

/* ── Goal Type Picker ── */

function GoalTypePicker({ onPickTime, onPickTask, onCancel }: { onPickTime: () => void; onPickTask: () => void; onCancel: () => void }) {
  return (
    <div className="rounded-xl bg-discord-card/70 border border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">New goal</span>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 transition-colors text-xs">✕</button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onPickTime}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg bg-discord-darker border border-white/5 hover:border-cyber-neon/30 hover:bg-cyber-neon/5 transition-all active:scale-[0.97]"
        >
          <span className="text-lg">⏱</span>
          <span className="text-[11px] text-gray-300 font-medium">Time goal</span>
          <span className="text-[9px] text-gray-600">Track hours</span>
        </button>
        <button
          onClick={onPickTask}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg bg-discord-darker border border-white/5 hover:border-[#8b5cf6]/30 hover:bg-[#8b5cf6]/5 transition-all active:scale-[0.97]"
        >
          <span className="text-lg">✅</span>
          <span className="text-[11px] text-gray-300 font-medium">Task</span>
          <span className="text-[9px] text-gray-600">Checklist item</span>
        </button>
      </div>
    </div>
  )
}

/* ── Task Item ── */

function TaskItem({ task, onToggle, onDelete, onUpdateText }: { task: Task; onToggle: () => void; onDelete: () => void; onUpdateText: (text: string) => void }) {
  const done = task.done === 1
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(task.text)
  const inputRef = useRef<HTMLInputElement>(null)

  const commitEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== task.text) {
      onUpdateText(trimmed)
    } else {
      setEditText(task.text)
    }
    setEditing(false)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  return (
    <div className={`group flex items-center gap-2.5 w-full rounded-lg px-3 py-2 border transition-colors duration-150 ${
      done ? 'bg-discord-card/30 border-white/[0.03]' : 'bg-discord-card/50 border-white/5'
    }`}>
      <button
        onClick={onToggle}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
          done ? 'bg-cyber-neon border-cyber-neon text-discord-darker' : 'border-gray-600 hover:border-gray-400'
        }`}
      >
        {done && <span className="text-[10px] font-bold leading-none">✓</span>}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') { setEditText(task.text); setEditing(false) }
          }}
          className="flex-1 text-xs bg-transparent text-gray-200 outline-none border-b border-cyber-neon/40 py-0"
        />
      ) : (
        <span
          onClick={() => { if (!done) { setEditText(task.text); setEditing(true) } }}
          className={`flex-1 text-xs truncate transition-colors duration-150 ${
            done ? 'text-gray-600 line-through' : 'text-gray-300 cursor-text hover:text-white'
          }`}
        >
          {task.text}
        </span>
      )}

      <button
        onClick={onDelete}
        className="text-gray-700 hover:text-red-400 transition-colors text-[10px] opacity-0 group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

/* ── Task Creator ── */

function TaskCreator({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')

  const handleCreate = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const api = window.electronAPI
    if (api?.db?.createTask) {
      try {
        await api.db.createTask({ id: crypto.randomUUID(), text: trimmed })
        setText('')
        onCreated()
      } catch (e) { console.error('createTask failed', e) }
      return
    }
    const list = getTasksFromStorage()
    const newTask: Task = { id: crypto.randomUUID(), text: trimmed, done: 0, created_at: Date.now() }
    setTasksInStorage([...list, newTask])
    setText('')
    onCreated()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && text.trim()) handleCreate()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="rounded-xl bg-discord-card/70 border border-white/10 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">New task</span>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 transition-colors text-xs">✕</button>
      </div>
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What needs to get done?"
        className="w-full text-sm px-3 py-2 rounded-lg bg-discord-darker border border-white/10 text-white placeholder-gray-600 focus:border-[#8b5cf6]/40 outline-none transition-colors"
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-xs py-1.5 rounded-lg bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10 transition-colors active:scale-95"
        >
          Back
        </button>
        <button
          onClick={handleCreate}
          disabled={!text.trim()}
          className={`flex-1 text-xs py-1.5 rounded-lg border font-semibold transition-all active:scale-95 ${
            text.trim()
              ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border-[#8b5cf6]/30 hover:bg-[#8b5cf6]/30'
              : 'bg-discord-darker text-gray-600 border-white/5 cursor-default'
          }`}
        >
          Add task
        </button>
      </div>
    </div>
  )
}

/* ── Goal Reached Modal ── */

function GoalReachedModal({
  goal,
  onClose,
  onAddOneHour,
}: {
  goal: GoalWithProgress | null
  onClose: () => void
  onAddOneHour: () => void
}) {
  if (!goal) return null
  const categoryLabel = goal.target_category ? (CATEGORY_ICONS[goal.target_category] || '') + ' ' + goal.target_category : ''
  return (
    <AnimatePresence>
      <motion.div
        key={goal.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="rounded-2xl bg-discord-card border border-white/10 shadow-xl max-w-sm w-full p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-center text-gray-100 font-medium">
            Время вышло! Цель достигнута.
          </p>
          <p className="text-center text-sm text-gray-400">
            {formatDuration(goal.target_seconds)}
            {categoryLabel ? ` ${categoryLabel}` : ''}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-discord-darker text-gray-300 border border-white/10 hover:bg-white/5 font-medium text-sm transition-colors"
            >
              Ok
            </button>
            <button
              onClick={onAddOneHour}
              className="flex-1 py-2.5 rounded-xl bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30 hover:bg-cyber-neon/30 font-medium text-sm transition-colors"
            >
              Ещё час
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Goal Card ── */

function GoalCard({ goal, onEdit }: { goal: GoalWithProgress; onEdit: () => void }) {
  const pct = Math.min(100, (goal.progress / goal.target_seconds) * 100)
  const isComplete = pct >= 100

  return (
    <div
      className={`group w-full rounded-xl px-3.5 py-2.5 border transition-colors duration-150 cursor-pointer ${
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
          <span className="text-[10px] text-gray-600 group-hover:opacity-100 opacity-0 transition-opacity duration-150">
            ✏️
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-discord-darker/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isComplete ? 'bg-cyber-neon' : 'bg-cyber-neon/60'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ── Goal Editor ── */

function GoalEditor({
  goal, onSave, onDelete, onCancel,
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
    onSave({ id: goal.id, target_seconds: hours * 3600, target_category: category || null, period })
  }

  const hasChanges =
    period !== goal.period ||
    hours !== Math.round(goal.target_seconds / 3600) ||
    (category || null) !== (goal.target_category || null)

  return (
    <div className="rounded-xl bg-discord-card/80 border border-cyber-neon/20 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Edit goal</span>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 transition-colors text-xs">✕</button>
      </div>
      <div className="flex gap-2">
        {(['daily', 'weekly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-150 ${
              period === p ? 'bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30' : 'bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            {p === 'daily' ? 'Daily' : 'Weekly'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-gray-400 shrink-0">Hours:</span>
        <input type="range" min={1} max={period === 'daily' ? 12 : 40} value={hours}
          onChange={(e) => setHours(parseInt(e.target.value, 10))} className="flex-1 accent-cyber-neon h-1 cursor-pointer" />
        <span className="text-xs font-mono text-cyber-neon w-6 text-right font-bold">{hours}</span>
      </div>
      <select value={category} onChange={(e) => setCategory(e.target.value)}
        className="w-full text-xs py-1.5 px-2.5 rounded-lg bg-discord-darker border border-white/10 text-gray-300 focus:outline-none focus:border-cyber-neon/40 transition-colors cursor-pointer">
        {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
      </select>
      <div className="flex gap-2 pt-0.5">
        {confirmDelete ? (
          <div className="flex gap-1.5 flex-1">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs py-1.5 rounded-lg bg-discord-darker text-gray-400 border border-white/5 active:scale-95">Keep</button>
            <button onClick={onDelete} className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 font-semibold active:scale-95">Delete</button>
          </div>
        ) : (
          <>
            <button onClick={() => setConfirmDelete(true)} className="text-xs py-1.5 px-3 rounded-lg bg-discord-darker text-red-400/70 border border-white/5 hover:text-red-400 transition-all active:scale-95">🗑</button>
            <button onClick={handleSave} disabled={!hasChanges}
              className={`flex-1 text-xs py-1.5 rounded-lg border font-semibold transition-all active:scale-95 ${
                hasChanges ? 'bg-cyber-neon/20 text-cyber-neon border-cyber-neon/30 hover:bg-cyber-neon/30' : 'bg-discord-darker text-gray-500 border-white/5 cursor-default'
              }`}>Save</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Goal Creator (time-based) ── */

function GoalCreator({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const [hours, setHours] = useState(2)
  const [category, setCategory] = useState<string>('')

  const handleCreate = async () => {
    const api = window.electronAPI
    if (!api?.db?.createGoal) {
      console.error('createGoal not available')
      return
    }
    try {
      await api.db.createGoal({
        id: crypto.randomUUID(),
        type: category ? 'category' : 'total',
        target_seconds: hours * 3600,
        target_category: category || null,
        period,
        start_date: new Date().toISOString().slice(0, 10),
      })
      onCreated()
    } catch (e) {
      console.error('createGoal failed', e)
    }
  }

  return (
    <div className="rounded-xl bg-discord-card/70 border border-white/10 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Time goal</span>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 transition-colors text-xs">✕</button>
      </div>
      <div className="flex gap-2">
        {(['daily', 'weekly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all duration-150 ${
              period === p ? 'bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30' : 'bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            {p === 'daily' ? 'Daily' : 'Weekly'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-gray-400 shrink-0">Hours:</span>
        <input type="range" min={1} max={period === 'daily' ? 12 : 40} value={hours}
          onChange={(e) => setHours(parseInt(e.target.value, 10))} className="flex-1 accent-cyber-neon h-1 cursor-pointer" />
        <span className="text-xs font-mono text-cyber-neon w-6 text-right font-bold">{hours}</span>
      </div>
      <select value={category} onChange={(e) => setCategory(e.target.value)}
        className="w-full text-xs py-1.5 px-2.5 rounded-lg bg-discord-darker border border-white/10 text-gray-300 focus:outline-none focus:border-cyber-neon/40 transition-colors cursor-pointer">
        {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
      </select>
      <div className="flex gap-2 pt-0.5">
        <button onClick={onCancel}
          className="flex-1 text-xs py-1.5 rounded-lg bg-discord-darker text-gray-400 border border-white/5 hover:border-white/10 transition-colors active:scale-95">Back</button>
        <button onClick={handleCreate}
          className="flex-1 text-xs py-1.5 rounded-lg bg-cyber-neon/20 text-cyber-neon border border-cyber-neon/30 font-semibold hover:bg-cyber-neon/30 transition-colors active:scale-95">Create</button>
      </div>
    </div>
  )
}
