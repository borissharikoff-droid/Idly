-- Skills: per-user skill levels and XP (synced from app)
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.user_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  level INTEGER DEFAULT 0,
  total_xp INTEGER DEFAULT 0,
  prestige_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, skill_id)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_badges TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipped_frame TEXT;

CREATE INDEX IF NOT EXISTS idx_user_skills_user ON public.user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON public.user_skills(skill_id);

ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

-- Users can read own and friends' skills
CREATE POLICY "Users can view own and friends skills"
  ON public.user_skills FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = auth.uid() AND f.friend_id = user_skills.user_id)
             OR (f.friend_id = auth.uid() AND f.user_id = user_skills.user_id))
    )
  );

-- Users can insert/update own skills only
CREATE POLICY "Users can insert own skills"
  ON public.user_skills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skills"
  ON public.user_skills FOR UPDATE
  USING (auth.uid() = user_id);

-- Required for removing friends from UI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'friendships'
      AND policyname = 'Users can delete own friendships'
  ) THEN
    CREATE POLICY "Users can delete own friendships"
      ON public.friendships FOR DELETE
      USING (auth.uid() = user_id OR auth.uid() = friend_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.skill_xp_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  skill_id TEXT NOT NULL,
  xp_delta INTEGER NOT NULL CHECK (xp_delta >= 0),
  source TEXT NOT NULL DEFAULT 'session_complete',
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_xp_events_user ON public.skill_xp_events(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_xp_events_skill_period ON public.skill_xp_events(skill_id, happened_at DESC);

ALTER TABLE public.skill_xp_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'skill_xp_events'
      AND policyname = 'Users can view own and friends skill xp events'
  ) THEN
    CREATE POLICY "Users can view own and friends skill xp events"
      ON public.skill_xp_events FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.user_id = auth.uid() AND f.friend_id = skill_xp_events.user_id)
              OR (f.friend_id = auth.uid() AND f.user_id = skill_xp_events.user_id))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'skill_xp_events'
      AND policyname = 'Users can insert own skill xp events'
  ) THEN
    CREATE POLICY "Users can insert own skill xp events"
      ON public.skill_xp_events FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.skill_competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period TEXT NOT NULL CHECK (period IN ('24h', '7d')),
  skill_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period, skill_id, starts_at)
);

CREATE TABLE IF NOT EXISTS public.skill_competition_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id UUID REFERENCES public.skill_competitions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  score_xp INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_competition_scores_comp ON public.skill_competition_scores(competition_id, score_xp DESC);

ALTER TABLE public.skill_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_competition_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'skill_competitions'
      AND policyname = 'Users can view competitions'
  ) THEN
    CREATE POLICY "Users can view competitions"
      ON public.skill_competitions FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'skill_competition_scores'
      AND policyname = 'Users can view own and friends competition scores'
  ) THEN
    CREATE POLICY "Users can view own and friends competition scores"
      ON public.skill_competition_scores FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.user_id = auth.uid() AND f.friend_id = skill_competition_scores.user_id)
              OR (f.friend_id = auth.uid() AND f.user_id = skill_competition_scores.user_id))
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.social_feed_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_feed_events_user ON public.social_feed_events(user_id);
CREATE INDEX IF NOT EXISTS idx_social_feed_events_created ON public.social_feed_events(created_at DESC);

ALTER TABLE public.social_feed_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_feed_events'
      AND policyname = 'Users can view own and friends social feed'
  ) THEN
    CREATE POLICY "Users can view own and friends social feed"
      ON public.social_feed_events FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.user_id = auth.uid() AND f.friend_id = social_feed_events.user_id)
              OR (f.friend_id = auth.uid() AND f.user_id = social_feed_events.user_id))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_feed_events'
      AND policyname = 'Users can insert own social feed events'
  ) THEN
    CREATE POLICY "Users can insert own social feed events"
      ON public.social_feed_events FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
