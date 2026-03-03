-- ============================================================
-- Diagnose & fix Beluga's skill XP
-- Run in Supabase SQL Editor (service_role context)
-- ============================================================

-- STEP 1: Find Beluga's user_id
SELECT id, username, level, xp, streak_count, updated_at
FROM profiles
WHERE username ILIKE 'beluga';

-- ============================================================
-- STEP 2: Check current skill XP
-- Replace <USER_ID> with the id from Step 1
-- ============================================================
-- SELECT skill_id, level, total_xp, updated_at
-- FROM user_skills
-- WHERE user_id = '<USER_ID>'
-- ORDER BY total_xp DESC;

-- ============================================================
-- STEP 3: Set specific XP values for each skill
--
-- XP reference (approximate, based on the in-game formula):
--   Level 10  →    6 600 XP  (~1.8h)
--   Level 20  →   55 000 XP  (~15h)
--   Level 30  →  187 000 XP  (~52h)
--   Level 40  →  447 000 XP  (~124h)
--   Level 50  →  866 000 XP  (~240h)
--   Level 60  →  1 497 000 XP  (~416h)
--   Level 70  →  2 386 000 XP  (~663h)
--   Level 80  →  3 570 000 XP  (~992h)
--   Level 99  →  3 600 000 XP  (max)
--
-- Uses MAX() — never reduces existing XP, only increases it.
-- Replace <USER_ID> with the actual UUID from Step 1.
-- ============================================================

INSERT INTO user_skills (user_id, skill_id, level, total_xp, updated_at)
VALUES
  -- Set each skill to the XP you want (0 = skip / leave as-is)
  ('<USER_ID>', 'developer',    0,       0, now()),
  ('<USER_ID>', 'designer',     0,       0, now()),
  ('<USER_ID>', 'gamer',        0,       0, now()),
  ('<USER_ID>', 'communicator', 0,       0, now()),
  ('<USER_ID>', 'researcher',   0,       0, now()),
  ('<USER_ID>', 'creator',      0,       0, now()),
  ('<USER_ID>', 'learner',      0,       0, now()),
  ('<USER_ID>', 'listener',     0,       0, now()),
  ('<USER_ID>', 'farmer',       0,       0, now())
ON CONFLICT (user_id, skill_id)
DO UPDATE SET
  total_xp   = GREATEST(user_skills.total_xp, excluded.total_xp),
  level      = GREATEST(user_skills.level,    excluded.level),
  updated_at = excluded.updated_at;

-- ============================================================
-- STEP 4 (optional): Force-set exact XP ignoring current value
-- Use this if you want to OVERWRITE, not just take the max.
-- ============================================================
-- UPDATE user_skills
-- SET
--   total_xp   = 187000,   -- desired XP
--   level      = 30,        -- desired level
--   updated_at = now()
-- WHERE user_id = '<USER_ID>'
--   AND skill_id = 'developer';

-- ============================================================
-- STEP 5: Verify result
-- ============================================================
-- SELECT skill_id, level, total_xp
-- FROM user_skills
-- WHERE user_id = '<USER_ID>'
-- ORDER BY total_xp DESC;
