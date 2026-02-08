/**
 * Zod schemas for IPC input validation.
 * Prevents malicious or malformed data from reaching the database.
 */

import { z } from 'zod'

export const saveSessionSchema = z.object({
  id: z.string().min(1).max(128),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  durationSeconds: z.number().int().nonnegative(),
  summary: z.unknown().optional(),
})

export const activitySchema = z.object({
  appName: z.string().max(512),
  windowTitle: z.string().max(1024),
  category: z.string().max(64),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  keystrokes: z.number().int().nonnegative().optional().default(0),
})

export const saveActivitiesSchema = z.object({
  sessionId: z.string().min(1).max(128),
  activities: z.array(activitySchema).max(50000),
})

export const goalSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  target_seconds: z.number().int().positive(),
  target_category: z.string().max(64).nullable(),
  period: z.enum(['daily', 'weekly', 'custom']),
  start_date: z.string().min(1).max(32),
})

export const updateGoalSchema = z.object({
  id: z.string().min(1).max(128),
  target_seconds: z.number().int().positive(),
  target_category: z.string().max(64).nullable(),
  period: z.enum(['daily', 'weekly', 'custom']),
})

export const goalProgressSchema = z.object({
  target_category: z.string().max(64).nullable(),
  period: z.string().min(1).max(32),
  start_date: z.string().min(1).max(32),
})

export const stringId = z.string().min(1).max(256)
export const optionalSinceMs = z.number().int().nonnegative().optional()
export const optionalLimit = z.number().int().positive().max(100000).optional()
export const positiveInt = z.number().int().positive()
export const nonNegativeInt = z.number().int().nonnegative()

export const localStatKey = z.string().min(1).max(256)
export const localStatValue = z.string().max(10000)
