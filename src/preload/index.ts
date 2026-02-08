import { contextBridge, ipcRenderer } from 'electron'

const api = {
  tracker: {
    start: () => ipcRenderer.invoke('tracker:start'),
    stop: () => ipcRenderer.invoke('tracker:stop'),
    pause: () => ipcRenderer.invoke('tracker:pause'),
    resume: () => ipcRenderer.invoke('tracker:resume'),
    getCurrentActivity: () => ipcRenderer.invoke('tracker:getCurrentActivity'),
    setAfkThreshold: (ms: number) => ipcRenderer.invoke('tracker:setAfkThreshold', ms),
    onActivityUpdate: (cb: (activity: unknown) => void) => {
      const handler = (_: unknown, activity: unknown) => cb(activity)
      ipcRenderer.on('tracker:activityUpdate', handler)
      return () => ipcRenderer.removeListener('tracker:activityUpdate', handler)
    },
    onIdleChange: (cb: (idle: boolean) => void) => {
      const handler = (_: unknown, idle: boolean) => cb(idle)
      ipcRenderer.on('tracker:idleChange', handler)
      return () => ipcRenderer.removeListener('tracker:idleChange', handler)
    },
  },
  db: {
    getSessions: (limit?: number) => ipcRenderer.invoke('db:getSessions', limit),
    getSessionById: (id: string) => ipcRenderer.invoke('db:getSessionById', id),
    getActivitiesBySessionId: (sessionId: string) => ipcRenderer.invoke('db:getActivitiesBySessionId', sessionId),
    saveSession: (session: { id: string; startTime: number; endTime: number; durationSeconds: number; summary?: unknown }) =>
      ipcRenderer.invoke('db:saveSession', session),
    saveActivities: (sessionId: string, activities: unknown[]) => ipcRenderer.invoke('db:saveActivities', sessionId, activities),
    getStreak: () => ipcRenderer.invoke('db:getStreak'),
    getUserStats: () => ipcRenderer.invoke('db:getUserStats'),
    getSessionAnalysis: (sessionId: string) => ipcRenderer.invoke('db:getSessionAnalysis', sessionId),
    getLocalStat: (key: string) => ipcRenderer.invoke('db:getLocalStat', key),
    setLocalStat: (key: string, value: string) => ipcRenderer.invoke('db:setLocalStat', key, value),
    getUnlockedAchievements: () => ipcRenderer.invoke('db:getUnlockedAchievements'),
    unlockAchievement: (achievementId: string) => ipcRenderer.invoke('db:unlockAchievement', achievementId),
    getAppUsageStats: (sinceMs?: number) => ipcRenderer.invoke('db:getAppUsageStats', sinceMs),
    getCategoryStats: (sinceMs?: number) => ipcRenderer.invoke('db:getCategoryStats', sinceMs),
    getContextSwitchCount: (sinceMs?: number) => ipcRenderer.invoke('db:getContextSwitchCount', sinceMs),
    getSessionCount: (sinceMs?: number) => ipcRenderer.invoke('db:getSessionCount', sinceMs),
    getTotalSeconds: (sinceMs?: number) => ipcRenderer.invoke('db:getTotalSeconds', sinceMs),
    getWindowTitleStats: (sinceMs?: number) => ipcRenderer.invoke('db:getWindowTitleStats', sinceMs),
    getHourlyDistribution: (sinceMs?: number) => ipcRenderer.invoke('db:getHourlyDistribution', sinceMs),
    getTotalKeystrokes: (sinceMs?: number) => ipcRenderer.invoke('db:getTotalKeystrokes', sinceMs),
    getKeystrokesByApp: (sinceMs?: number) => ipcRenderer.invoke('db:getKeystrokesByApp', sinceMs),
    getSkillXP: (skillId: string) => ipcRenderer.invoke('db:getSkillXP', skillId),
    addSkillXP: (skillId: string, amount: number) => ipcRenderer.invoke('db:addSkillXP', skillId, amount),
    getAllSkillXP: () => ipcRenderer.invoke('db:getAllSkillXP'),
    // Goals
    getActiveGoals: () => ipcRenderer.invoke('db:getActiveGoals'),
    getAllGoals: () => ipcRenderer.invoke('db:getAllGoals'),
    createGoal: (goal: { id: string; type: string; target_seconds: number; target_category: string | null; period: string; start_date: string }) => ipcRenderer.invoke('db:createGoal', goal),
    completeGoal: (id: string) => ipcRenderer.invoke('db:completeGoal', id),
    updateGoal: (goal: { id: string; target_seconds: number; target_category: string | null; period: string }) => ipcRenderer.invoke('db:updateGoal', goal),
    deleteGoal: (id: string) => ipcRenderer.invoke('db:deleteGoal', id),
    getGoalProgress: (goal: { target_category: string | null; period: string; start_date: string }) => ipcRenderer.invoke('db:getGoalProgress', goal),
    // Trends
    getDailyTotals: (days: number) => ipcRenderer.invoke('db:getDailyTotals', days),
    // Skill XP Log
    addSkillXPLog: (skillId: string, xpDelta: number) => ipcRenderer.invoke('db:addSkillXPLog', skillId, xpDelta),
    getSkillXPHistory: (skillId: string) => ipcRenderer.invoke('db:getSkillXPHistory', skillId),
    // Session Checkpoint (crash recovery)
    saveCheckpoint: (data: { sessionId: string; startTime: number; elapsedSeconds: number; pausedAccumulated: number }) => ipcRenderer.invoke('db:saveCheckpoint', data),
    getCheckpoint: () => ipcRenderer.invoke('db:getCheckpoint'),
    clearCheckpoint: () => ipcRenderer.invoke('db:clearCheckpoint'),
  },
  ai: {
    analyzeSession: (sessionId: string) => ipcRenderer.invoke('ai:analyzeSession', sessionId),
    analyzeOverview: (data: unknown) => ipcRenderer.invoke('ai:analyzeOverview', data),
  },
  settings: {
    getAutoLaunch: () => ipcRenderer.invoke('settings:getAutoLaunch'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('settings:setAutoLaunch', enabled),
  },
  notify: {
    show: (title: string, body: string) => ipcRenderer.invoke('notify:show', title, body),
  },
  data: {
    exportSessions: (format: 'csv' | 'json') => ipcRenderer.invoke('data:exportSessions', format),
  },
  updater: {
    onStatus: (cb: (info: { status: string; version?: string }) => void) => {
      const handler = (_: unknown, info: { status: string; version?: string }) => cb(info)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
    install: () => ipcRenderer.invoke('updater:install'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
