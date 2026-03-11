-- Add prestige_count column to user_skills for prestige system support.
-- Each prestige = +99 bonus levels on the leaderboard.
-- Run this in your Supabase SQL Editor for existing deployments.

ALTER TABLE public.user_skills
  ADD COLUMN IF NOT EXISTS prestige_count INTEGER DEFAULT 0;
