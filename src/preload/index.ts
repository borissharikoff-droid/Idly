/**
 * Preload script — must be self-contained (no imports from shared) so it loads
 * reliably from inside app.asar in the packaged app.
 */
const { contextBridge, ipcRenderer } = require('electron')

const CH = {
  tracker: {
    start: 'tracker:start',
    stop: 'tracker:stop',
    pause: 'tracker:pause',
    resume: 'tracker:resume',
    getCurrentActivity: 'tracker:getCurrentActivity',
    setAfkThreshold: 'tracker:setAfkThreshold',
    activityUpdate: 'tracker:activityUpdate',
    idleChange: 'tracker:idleChange',
  },
  db: {
    getSessions: 'db:getSessions',
    getSessionById: 'db:getSessionById',
    getActivitiesBySessionId: 'db:getActivitiesBySessionId',
    saveSession: 'db:saveSession',
    saveActivities: 'db:saveActivities',
    getStreak: 'db:getStreak',
    getUserStats: 'db:getUserStats',
    getSessionAnalysis: 'db:getSessionAnalysis',
    getLocalStat: 'db:getLocalStat',
    setLocalStat: 'db:setLocalStat',
    getUnlockedAchievements: 'db:getUnlockedAchievements',
    unlockAchievement: 'db:unlockAchievement',
    getAppUsageStats: 'db:getAppUsageStats',
    getCategoryStats: 'db:getCategoryStats',
    getContextSwitchCount: 'db:getContextSwitchCount',
    getSessionCount: 'db:getSessionCount',
    getTotalSeconds: 'db:getTotalSeconds',
    getWindowTitleStats: 'db:getWindowTitleStats',
    getHourlyDistribution: 'db:getHourlyDistribution',
    getTotalKeystrokes: 'db:getTotalKeystrokes',
    getKeystrokesByApp: 'db:getKeystrokesByApp',
    getSkillXP: 'db:getSkillXP',
    addSkillXP: 'db:addSkillXP',
    getAllSkillXP: 'db:getAllSkillXP',
    getActiveGoals: 'db:getActiveGoals',
    getAllGoals: 'db:getAllGoals',
    createGoal: 'db:createGoal',
    completeGoal: 'db:completeGoal',
    updateGoal: 'db:updateGoal',
    deleteGoal: 'db:deleteGoal',
    getGoalProgress: 'db:getGoalProgress',
    getTasks: 'db:getTasks',
    createTask: 'db:createTask',
    toggleTask: 'db:toggleTask',
    updateTaskText: 'db:updateTaskText',
    deleteTask: 'db:deleteTask',
    clearDoneTasks: 'db:clearDoneTasks',
    getDailyTotals: 'db:getDailyTotals',
    getSessionsPage: 'db:getSessionsPage',
    getDistractionMetrics: 'db:getDistractionMetrics',
    getFocusBlocks: 'db:getFocusBlocks',
    getSiteUsageStats: 'db:getSiteUsageStats',
    getCategoryTrends: 'db:getCategoryTrends',
    getPeriodComparison: 'db:getPeriodComparison',
    addSkillXPLog: 'db:addSkillXPLog',
    getSkillXPHistory: 'db:getSkillXPHistory',
    saveCheckpoint: 'db:saveCheckpoint',
    getCheckpoint: 'db:getCheckpoint',
    clearCheckpoint: 'db:clearCheckpoint',
    restoreSkillXP: 'db:restoreSkillXP',
  },
  ai: {
    analyzeSession: 'ai:analyzeSession',
    analyzeOverview: 'ai:analyzeOverview',
    refineActivityLabels: 'ai:refineActivityLabels',
  },
  settings: {
    getAutoLaunch: 'settings:getAutoLaunch',
    setAutoLaunch: 'settings:setAutoLaunch',
  },
  notify: { show: 'notify:show', smart: 'notification:smart' },
  window: { flashFrame: 'window:flashFrame', setBadgeCount: 'window:setBadgeCount' },
  data: { exportSessions: 'data:exportSessions', getLogsPath: 'data:getLogsPath', openLogsFolder: 'data:openLogsFolder' },
  updater: { status: 'updater:status', install: 'updater:install' },
  focus: { enable: 'focus:enable', disable: 'focus:disable', status: 'focus:status' },
}

try {
  const api = {
    tracker: {
      start: () => ipcRenderer.invoke(CH.tracker.start),
      stop: () => ipcRenderer.invoke(CH.tracker.stop),
      pause: () => ipcRenderer.invoke(CH.tracker.pause),
      resume: () => ipcRenderer.invoke(CH.tracker.resume),
      getCurrentActivity: () => ipcRenderer.invoke(CH.tracker.getCurrentActivity),
      setAfkThreshold: (ms: number) => ipcRenderer.invoke(CH.tracker.setAfkThreshold, ms),
      onActivityUpdate: (cb: (activity: unknown) => void) => {
        const handler = (_: unknown, activity: unknown) => cb(activity)
        ipcRenderer.on(CH.tracker.activityUpdate, handler)
        return () => ipcRenderer.removeListener(CH.tracker.activityUpdate, handler)
      },
      onIdleChange: (cb: (idle: boolean) => void) => {
        const handler = (_: unknown, idle: boolean) => cb(idle)
        ipcRenderer.on(CH.tracker.idleChange, handler)
        return () => ipcRenderer.removeListener(CH.tracker.idleChange, handler)
      },
    },
    db: {
      getSessions: (limit?: number) => ipcRenderer.invoke(CH.db.getSessions, limit),
      getSessionById: (id: string) => ipcRenderer.invoke(CH.db.getSessionById, id),
      getActivitiesBySessionId: (sessionId: string) => ipcRenderer.invoke(CH.db.getActivitiesBySessionId, sessionId),
      saveSession: (session: { id: string; startTime: number; endTime: number; durationSeconds: number; summary?: unknown }) =>
        ipcRenderer.invoke(CH.db.saveSession, session),
      saveActivities: (sessionId: string, activities: unknown[]) => ipcRenderer.invoke(CH.db.saveActivities, sessionId, activities),
      getStreak: () => ipcRenderer.invoke(CH.db.getStreak),
      getUserStats: () => ipcRenderer.invoke(CH.db.getUserStats),
      getSessionAnalysis: (sessionId: string) => ipcRenderer.invoke(CH.db.getSessionAnalysis, sessionId),
      getLocalStat: (key: string) => ipcRenderer.invoke(CH.db.getLocalStat, key),
      setLocalStat: (key: string, value: string) => ipcRenderer.invoke(CH.db.setLocalStat, key, value),
      getUnlockedAchievements: () => ipcRenderer.invoke(CH.db.getUnlockedAchievements),
      unlockAchievement: (achievementId: string) => ipcRenderer.invoke(CH.db.unlockAchievement, achievementId),
      getAppUsageStats: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getAppUsageStats, sinceMs),
      getCategoryStats: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getCategoryStats, sinceMs),
      getContextSwitchCount: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getContextSwitchCount, sinceMs),
      getSessionCount: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getSessionCount, sinceMs),
      getTotalSeconds: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getTotalSeconds, sinceMs),
      getWindowTitleStats: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getWindowTitleStats, sinceMs),
      getHourlyDistribution: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getHourlyDistribution, sinceMs),
      getTotalKeystrokes: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getTotalKeystrokes, sinceMs),
      getKeystrokesByApp: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getKeystrokesByApp, sinceMs),
      getSkillXP: (skillId: string) => ipcRenderer.invoke(CH.db.getSkillXP, skillId),
      addSkillXP: (skillId: string, amount: number) => ipcRenderer.invoke(CH.db.addSkillXP, skillId, amount),
      getAllSkillXP: () => ipcRenderer.invoke(CH.db.getAllSkillXP),
      restoreSkillXP: (rows: { skill_id: string; total_xp: number }[]) => ipcRenderer.invoke(CH.db.restoreSkillXP, rows),
      getActiveGoals: () => ipcRenderer.invoke(CH.db.getActiveGoals),
      getAllGoals: () => ipcRenderer.invoke(CH.db.getAllGoals),
      createGoal: (goal: { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string }) =>
        ipcRenderer.invoke(CH.db.createGoal, goal),
      completeGoal: (id: string) => ipcRenderer.invoke(CH.db.completeGoal, id),
      updateGoal: (goal: { id: string; target_seconds: number; target_category: string | null; period: string }) =>
        ipcRenderer.invoke(CH.db.updateGoal, goal),
      deleteGoal: (id: string) => ipcRenderer.invoke(CH.db.deleteGoal, id),
      getGoalProgress: (goal: { target_category: string | null; period: string; start_date: string }) =>
        ipcRenderer.invoke(CH.db.getGoalProgress, goal),
      getTasks: () => ipcRenderer.invoke(CH.db.getTasks),
      createTask: (task: { id: string; text: string }) => ipcRenderer.invoke(CH.db.createTask, task),
      toggleTask: (id: string) => ipcRenderer.invoke(CH.db.toggleTask, id),
      updateTaskText: (id: string, text: string) => ipcRenderer.invoke(CH.db.updateTaskText, id, text),
      deleteTask: (id: string) => ipcRenderer.invoke(CH.db.deleteTask, id),
      clearDoneTasks: () => ipcRenderer.invoke(CH.db.clearDoneTasks),
      getDailyTotals: (days: number) => ipcRenderer.invoke(CH.db.getDailyTotals, days),
      getSessionsPage: (limit?: number, offset?: number, sinceMs?: number) => ipcRenderer.invoke(CH.db.getSessionsPage, limit, offset, sinceMs),
      getDistractionMetrics: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getDistractionMetrics, sinceMs),
      getFocusBlocks: (sinceMs?: number, minMinutes?: number) => ipcRenderer.invoke(CH.db.getFocusBlocks, sinceMs, minMinutes),
      getSiteUsageStats: (sinceMs?: number) => ipcRenderer.invoke(CH.db.getSiteUsageStats, sinceMs),
      getCategoryTrends: (days?: number) => ipcRenderer.invoke(CH.db.getCategoryTrends, days),
      getPeriodComparison: (currentSinceMs: number, currentUntilMs: number, previousSinceMs: number, previousUntilMs: number) =>
        ipcRenderer.invoke(CH.db.getPeriodComparison, currentSinceMs, currentUntilMs, previousSinceMs, previousUntilMs),
      addSkillXPLog: (skillId: string, xpDelta: number) => ipcRenderer.invoke(CH.db.addSkillXPLog, skillId, xpDelta),
      getSkillXPHistory: (skillId: string) => ipcRenderer.invoke(CH.db.getSkillXPHistory, skillId),
      saveCheckpoint: (data: {
        sessionId: string
        startTime: number
        elapsedSeconds: number
        pausedAccumulated: number
        sessionSkillXP?: Record<string, number>
      }) =>
        ipcRenderer.invoke(CH.db.saveCheckpoint, data),
      getCheckpoint: () => ipcRenderer.invoke(CH.db.getCheckpoint),
      clearCheckpoint: () => ipcRenderer.invoke(CH.db.clearCheckpoint),
    },
    ai: {
      analyzeSession: (sessionId: string) => ipcRenderer.invoke(CH.ai.analyzeSession, sessionId),
      analyzeOverview: (data: unknown) => ipcRenderer.invoke(CH.ai.analyzeOverview, data),
      refineActivityLabels: (items: { app_name: string; window_title: string; current_category: string }[]) =>
        ipcRenderer.invoke(CH.ai.refineActivityLabels, items),
    },
    settings: {
      getAutoLaunch: () => ipcRenderer.invoke(CH.settings.getAutoLaunch),
      setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke(CH.settings.setAutoLaunch, enabled),
    },
    notify: {
      show: (title: string, body: string) => ipcRenderer.invoke(CH.notify.show, title, body),
      onSmart: (cb: (payload: { title: string; body: string }) => void) => {
        const handler = (_: unknown, payload: { title: string; body: string }) => cb(payload)
        ipcRenderer.on(CH.notify.smart, handler)
        return () => ipcRenderer.removeListener(CH.notify.smart, handler)
      },
    },
    window: {
      flashFrame: () => ipcRenderer.invoke(CH.window.flashFrame),
      setBadgeCount: (count: number) => ipcRenderer.invoke(CH.window.setBadgeCount, count),
    },
    data: {
      exportSessions: (format: 'csv' | 'json') => ipcRenderer.invoke(CH.data.exportSessions, format),
      getLogsPath: () => ipcRenderer.invoke(CH.data.getLogsPath),
      openLogsFolder: () => ipcRenderer.invoke(CH.data.openLogsFolder),
    },
    updater: {
      onStatus: (cb: (info: { status: string; version?: string }) => void) => {
        const handler = (_: unknown, info: { status: string; version?: string }) => cb(info)
        ipcRenderer.on(CH.updater.status, handler)
        return () => ipcRenderer.removeListener(CH.updater.status, handler)
      },
      install: () => ipcRenderer.invoke(CH.updater.install),
    },
    focus: {
      enable: (durationMs: number) => ipcRenderer.invoke(CH.focus.enable, durationMs),
      disable: () => ipcRenderer.invoke(CH.focus.disable),
      status: () => ipcRenderer.invoke(CH.focus.status),
    },
  }
  contextBridge.exposeInMainWorld('electronAPI', api)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  contextBridge.exposeInMainWorld('electronAPI', { _preloadError: true, _message: msg })
}
