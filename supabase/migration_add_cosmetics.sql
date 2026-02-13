-- Add cosmetics fields to profiles so friends can see each other's equipped badges and frames
-- Run this in your Supabase SQL Editor

-- Add equipped_badges (array of badge IDs)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_badges TEXT[];

-- Add equipped_frame (single frame ID)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_frame TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.equipped_badges IS 'Array of equipped badge IDs (cosmetics unlocked via achievements)';
COMMENT ON COLUMN public.profiles.equipped_frame IS 'Currently equipped profile frame ID (cosmetic unlocked via achievements)';
