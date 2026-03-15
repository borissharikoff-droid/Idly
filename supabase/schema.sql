-- Grindly Supabase schema for auth and friends/social features
-- Run this in your Supabase project SQL editor after creating a project at https://supabase.com

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  email text,
  avatar_url text,
  level integer default 1,
  xp integer default 0,
  current_activity text,
  is_online boolean default false,
  streak_count integer default 0,
  equipped_badges text[] default '{}',
  equipped_frame text,
  equipped_loot jsonb default '{}'::jsonb,
  status_title text,
  updated_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Friendships
create table if not exists public.friendships (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  friend_id uuid references public.profiles(id) on delete cascade,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

create index if not exists idx_friendships_user on public.friendships(user_id);
create index if not exists idx_friendships_friend on public.friendships(friend_id);

alter table public.friendships enable row level security;

create policy "Users can see their friendships"
  on public.friendships for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can create friendship requests"
  on public.friendships for insert
  with check (auth.uid() = user_id);

create policy "Users can update (accept) friendships"
  on public.friendships for update
  using (auth.uid() = friend_id or auth.uid() = user_id);

create policy "Users can delete own friendships"
  on public.friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Session summaries (synced from app for leaderboards; no sensitive details)
create table if not exists public.session_summaries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_seconds integer not null,
  created_at timestamptz default now()
);

create index if not exists idx_session_summaries_user on public.session_summaries(user_id);

alter table public.session_summaries enable row level security;

create policy "Users can insert own session summaries"
  on public.session_summaries for insert
  with check (auth.uid() = user_id);

create policy "Users can view own and friends' session summaries (for leaderboard)"
  on public.session_summaries for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = session_summaries.user_id and f.status = 'accepted')
         or (f.friend_id = auth.uid() and f.user_id = session_summaries.user_id and f.status = 'accepted')
    )
  );

-- User inventory (required for marketplace cancel_listing, buy_listing, inventory sync)
create table if not exists public.user_inventory (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  item_id text not null,
  quantity integer not null default 1 check (quantity >= 0),
  first_acquired_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, item_id)
);

create index if not exists idx_user_inventory_user on public.user_inventory(user_id);

alter table public.user_inventory enable row level security;

create policy "Users can view own inventory"
  on public.user_inventory for select
  using (auth.uid() = user_id);

create policy "Users can insert own inventory"
  on public.user_inventory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own inventory"
  on public.user_inventory for update
  using (auth.uid() = user_id);

create policy "Users can delete own inventory"
  on public.user_inventory for delete
  using (auth.uid() = user_id);

-- Achievements unlocked (for display on profile)
create table if not exists public.user_achievements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz default now(),
  unique(user_id, achievement_id)
);

create index if not exists idx_user_achievements_user on public.user_achievements(user_id);

alter table public.user_achievements enable row level security;

create policy "Users can view own and friends' achievements"
  on public.user_achievements for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = user_achievements.user_id and f.status = 'accepted')
         or (f.friend_id = auth.uid() and f.user_id = user_achievements.user_id and f.status = 'accepted')
    )
  );

create policy "Users can insert own achievements"
  on public.user_achievements for insert
  with check (auth.uid() = user_id);

-- Social feed events (progress updates shared with friends)
create table if not exists public.social_feed_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_social_feed_events_user on public.social_feed_events(user_id);
create index if not exists idx_social_feed_events_created on public.social_feed_events(created_at desc);

alter table public.social_feed_events enable row level security;

create policy "Users can view own and friends social feed"
  on public.social_feed_events for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = social_feed_events.user_id and f.status = 'accepted')
         or (f.friend_id = auth.uid() and f.user_id = social_feed_events.user_id and f.status = 'accepted')
    )
  );

create policy "Users can insert own social feed events"
  on public.social_feed_events for insert
  with check (auth.uid() = user_id);

-- Skill XP event ledger (powers competitions and public progression feed)
create table if not exists public.skill_xp_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  skill_id text not null,
  xp_delta integer not null check (xp_delta >= 0),
  source text not null default 'session_complete',
  happened_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create index if not exists idx_skill_xp_events_user on public.skill_xp_events(user_id);
create index if not exists idx_skill_xp_events_skill_period on public.skill_xp_events(skill_id, happened_at desc);

alter table public.skill_xp_events enable row level security;

create policy "Users can view own and friends skill xp events"
  on public.skill_xp_events for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = skill_xp_events.user_id and f.status = 'accepted')
         or (f.friend_id = auth.uid() and f.user_id = skill_xp_events.user_id and f.status = 'accepted')
    )
  );

create policy "Users can insert own skill xp events"
  on public.skill_xp_events for insert
  with check (auth.uid() = user_id);

-- Optional persisted competitions and score snapshots
create table if not exists public.skill_competitions (
  id uuid primary key default uuid_generate_v4(),
  period text not null check (period in ('24h', '7d')),
  skill_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz default now(),
  unique(period, skill_id, starts_at)
);

create table if not exists public.skill_competition_scores (
  id uuid primary key default uuid_generate_v4(),
  competition_id uuid references public.skill_competitions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  score_xp integer not null default 0,
  rank integer,
  updated_at timestamptz default now(),
  unique(competition_id, user_id)
);

create index if not exists idx_skill_competition_scores_comp on public.skill_competition_scores(competition_id, score_xp desc);

alter table public.skill_competitions enable row level security;
alter table public.skill_competition_scores enable row level security;

create policy "Users can view competitions"
  on public.skill_competitions for select
  using (true);

create policy "Users can view own and friends competition scores"
  on public.skill_competition_scores for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = skill_competition_scores.user_id and f.status = 'accepted')
         or (f.friend_id = auth.uid() and f.user_id = skill_competition_scores.user_id and f.status = 'accepted')
    )
  );

-- DMs between friends. Enable Realtime in Supabase: Database → Replication → public.messages.
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists idx_messages_receiver on public.messages(receiver_id);
create index if not exists idx_messages_sender on public.messages(sender_id);
create index if not exists idx_messages_created on public.messages(created_at desc);

alter table public.messages enable row level security;

-- Only participants can read messages (and must be friends — check in app or add FK to friendships)
create policy "Users can read own DMs"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages as sender"
  on public.messages for insert
  with check (auth.uid() = sender_id);

create policy "Receiver can mark as read"
  on public.messages for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Guild System (v3.8) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guilds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL CHECK (char_length(name) BETWEEN 3 AND 30),
  tag TEXT NOT NULL CHECK (char_length(tag) BETWEEN 2 AND 5),
  description TEXT,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  member_count INT DEFAULT 1,
  chest_gold INT DEFAULT 0 CHECK (chest_gold >= 0),
  weekly_goal_progress JSONB DEFAULT '{}'::jsonb,
  weekly_goal_reset_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.guild_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'officer', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  contribution_gold INT DEFAULT 0,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);

CREATE TABLE IF NOT EXISTS public.guild_chest_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INT DEFAULT 1 CHECK (quantity >= 1),
  deposited_by UUID REFERENCES profiles(id),
  deposited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.guild_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guild_activity_guild_created ON guild_activity_log(guild_id, created_at DESC);

-- RPC: increment guild weekly goal progress
CREATE OR REPLACE FUNCTION increment_guild_progress(p_guild_id UUID, p_type TEXT, p_delta INT DEFAULT 1)
RETURNS VOID AS $$
  UPDATE guilds
  SET weekly_goal_progress = jsonb_set(
    weekly_goal_progress,
    ARRAY[p_type],
    to_jsonb(COALESCE((weekly_goal_progress->p_type)::INT, 0) + p_delta)
  )
  WHERE id = p_guild_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- RPC: get price history for marketplace sparkline
CREATE OR REPLACE FUNCTION get_price_history(p_item_id TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE(price_gold INT, sold_at TIMESTAMPTZ) AS $$
  SELECT price_gold, created_at as sold_at
  FROM marketplace_listings
  WHERE item_id = p_item_id AND status = 'sold'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Raids ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.raids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier TEXT NOT NULL CHECK (tier IN ('ancient', 'mythic', 'eternal')),
  leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'failed')),
  boss_hp_remaining BIGINT NOT NULL,
  boss_hp_max BIGINT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  tribute_items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.raids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raids_select" ON public.raids
  FOR SELECT USING (
    auth.uid() = leader_id
    OR auth.uid() IN (
      SELECT user_id FROM public.raid_participants WHERE raid_id = id
    )
  );

CREATE POLICY "raids_insert" ON public.raids
  FOR INSERT WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "raids_update" ON public.raids
  FOR UPDATE USING (
    auth.uid() = leader_id
    OR auth.uid() IN (
      SELECT user_id FROM public.raid_participants WHERE raid_id = id
    )
  );

CREATE TABLE IF NOT EXISTS public.raid_participants (
  raid_id UUID REFERENCES raids(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  tribute_paid BOOLEAN DEFAULT FALSE,
  daily_attacks JSONB DEFAULT '[]'::jsonb,
  PRIMARY KEY (raid_id, user_id)
);

ALTER TABLE public.raid_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raid_participants_select" ON public.raid_participants
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM public.raid_participants rp2 WHERE rp2.raid_id = raid_id
    )
  );

CREATE POLICY "raid_participants_insert" ON public.raid_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "raid_participants_update" ON public.raid_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Add raid_medals column to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS raid_medals INTEGER DEFAULT 0;
