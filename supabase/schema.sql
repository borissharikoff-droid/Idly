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
  weekly_goal_reset_at TIMESTAMPTZ,
  hall_level INT DEFAULT 1,
  hall_build_started_at TIMESTAMPTZ,
  hall_build_target_level INT
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

CREATE TABLE IF NOT EXISTS public.guild_hall_contributions (
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  total_donated INT DEFAULT 0,
  PRIMARY KEY (guild_id, item_id)
);

-- RLS for guild tables (policies live in the DB; listed here for documentation)
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guilds_public_read"    ON public.guilds FOR SELECT USING (true);
CREATE POLICY "guilds_insert_auth"    ON public.guilds FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());
CREATE POLICY "guilds_owner_update"   ON public.guilds FOR UPDATE USING (owner_id = auth.uid());

ALTER TABLE public.guild_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guild_members_read"        ON public.guild_members FOR SELECT USING (true);
CREATE POLICY "guild_members_insert"      ON public.guild_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "guild_members_delete_own"  ON public.guild_members FOR DELETE USING (user_id = auth.uid());

ALTER TABLE public.guild_chest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guild_chest_read"    ON public.guild_chest_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM guild_members WHERE guild_id = guild_chest_items.guild_id AND user_id = auth.uid()));
CREATE POLICY "guild_chest_insert"  ON public.guild_chest_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.guild_members WHERE guild_id = guild_chest_items.guild_id AND user_id = auth.uid())
  );

ALTER TABLE public.guild_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guild_activity_read"    ON public.guild_activity_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM guild_members WHERE guild_id = guild_activity_log.guild_id AND user_id = auth.uid()));
CREATE POLICY "guild_activity_insert"  ON public.guild_activity_log FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.guild_members WHERE guild_id = guild_activity_log.guild_id AND user_id = auth.uid())
  );

ALTER TABLE guild_hall_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guild_members_read_contributions"
  ON guild_hall_contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM guild_members
      WHERE guild_members.guild_id = guild_hall_contributions.guild_id
        AND guild_members.user_id = auth.uid()
    )
  );

CREATE POLICY "guild_members_upsert_contributions"
  ON guild_hall_contributions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guild_members
      WHERE guild_members.guild_id = guild_hall_contributions.guild_id
        AND guild_members.user_id = auth.uid()
    )
  );

CREATE POLICY "guild_members_update_contributions"
  ON guild_hall_contributions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM guild_members
      WHERE guild_members.guild_id = guild_hall_contributions.guild_id
        AND guild_members.user_id = auth.uid()
    )
  );

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

-- RPC: sync_chests — кап 999/тип, дельта +50/sync, только легитимные типы
CREATE OR REPLACE FUNCTION public.sync_chests(p_chests jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chest jsonb; v_type text; v_qty int; v_old_qty int; v_final_qty int;
  MAX_QTY CONSTANT int:=999; MAX_DELTA CONSTANT int:=50;
  VALID_TYPES CONSTANT text[]:=ARRAY['common_chest','rare_chest','epic_chest','legendary_chest'];
BEGIN
  FOR v_chest IN SELECT * FROM jsonb_array_elements(p_chests) LOOP
    v_type:=trim(v_chest->>'chest_type'); v_qty:=LEAST(GREATEST(COALESCE((v_chest->>'quantity')::int,0),0),MAX_QTY);
    CONTINUE WHEN v_type IS NULL OR NOT(v_type=ANY(VALID_TYPES));
    SELECT quantity INTO v_old_qty FROM public.user_chests WHERE user_id=auth.uid() AND chest_type=v_type;
    IF NOT FOUND THEN v_final_qty:=LEAST(v_qty,MAX_DELTA);
    ELSIF v_qty<v_old_qty THEN v_final_qty:=GREATEST(v_qty,0);
    ELSE v_final_qty:=LEAST(v_qty,v_old_qty+MAX_DELTA); END IF;
    IF v_final_qty=0 THEN DELETE FROM public.user_chests WHERE user_id=auth.uid() AND chest_type=v_type;
    ELSE INSERT INTO public.user_chests(user_id,chest_type,quantity,updated_at) VALUES(auth.uid(),v_type,v_final_qty,now())
      ON CONFLICT(user_id,chest_type) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now(); END IF;
  END LOOP;
END;$$;
REVOKE ALL ON FUNCTION public.sync_chests(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_chests(jsonb) TO authenticated;

-- RPC: sync_inventory — server caps items at 9999, uses auth.uid()
-- (replaces direct user_inventory upsert from client)
CREATE OR REPLACE FUNCTION public.sync_inventory(p_items jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_item_id text; v_qty int;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := trim(v_item->>'item_id');
    v_qty := LEAST(GREATEST(COALESCE((v_item->>'quantity')::int,0),0),9999);
    CONTINUE WHEN v_item_id IS NULL OR v_item_id='';
    IF v_qty=0 THEN DELETE FROM public.user_inventory WHERE user_id=auth.uid() AND item_id=v_item_id;
    ELSE INSERT INTO public.user_inventory(user_id,item_id,quantity,updated_at) VALUES(auth.uid(),v_item_id,v_qty,now()) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now(); END IF;
  END LOOP;
END;$$;
REVOKE ALL ON FUNCTION public.sync_inventory(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_inventory(jsonb) TO authenticated;

-- RPC: sync_skills — caps XP 5M, level 99, prestige 10, uses auth.uid()
CREATE OR REPLACE FUNCTION public.sync_skills(p_skills jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_skill jsonb; v_skill_id text; v_xp bigint; v_level int; v_prestige int;
BEGIN
  FOR v_skill IN SELECT * FROM jsonb_array_elements(p_skills) LOOP
    v_skill_id:=trim(v_skill->>'skill_id'); v_xp:=LEAST(GREATEST(COALESCE((v_skill->>'total_xp')::bigint,0),0),5000000);
    v_level:=LEAST(GREATEST(COALESCE((v_skill->>'level')::int,0),0),99); v_prestige:=LEAST(GREATEST(COALESCE((v_skill->>'prestige_count')::int,0),0),10);
    CONTINUE WHEN v_skill_id IS NULL OR v_skill_id='';
    INSERT INTO public.user_skills(user_id,skill_id,total_xp,level,prestige_count,updated_at) VALUES(auth.uid(),v_skill_id,v_xp,v_level,v_prestige,now())
    ON CONFLICT(user_id,skill_id) DO UPDATE SET total_xp=EXCLUDED.total_xp,level=EXCLUDED.level,prestige_count=EXCLUDED.prestige_count,updated_at=now();
  END LOOP;
END;$$;
REVOKE ALL ON FUNCTION public.sync_skills(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_skills(jsonb) TO authenticated;

-- RPC: create_listing — atomic price validation + inventory deduction
CREATE OR REPLACE FUNCTION public.create_listing(p_item_id text,p_quantity int,p_price_gold int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_current_qty int; v_listing_id uuid;
BEGIN
  IF p_item_id IS NULL OR trim(p_item_id)='' THEN RETURN jsonb_build_object('ok',false,'error','invalid item_id'); END IF;
  IF p_quantity<1 THEN RETURN jsonb_build_object('ok',false,'error','quantity must be >= 1'); END IF;
  IF p_price_gold<1 OR p_price_gold>10000000 THEN RETURN jsonb_build_object('ok',false,'error','price must be 1-10000000'); END IF;
  SELECT quantity INTO v_current_qty FROM public.user_inventory WHERE user_id=auth.uid() AND item_id=p_item_id FOR UPDATE;
  IF v_current_qty IS NULL OR v_current_qty<p_quantity THEN RETURN jsonb_build_object('ok',false,'error','insufficient inventory'); END IF;
  IF v_current_qty-p_quantity<=0 THEN DELETE FROM public.user_inventory WHERE user_id=auth.uid() AND item_id=p_item_id;
  ELSE UPDATE public.user_inventory SET quantity=quantity-p_quantity,updated_at=now() WHERE user_id=auth.uid() AND item_id=p_item_id; END IF;
  INSERT INTO public.marketplace_listings(seller_id,item_id,quantity,price_gold,status) VALUES(auth.uid(),p_item_id,p_quantity,p_price_gold,'active') RETURNING id INTO v_listing_id;
  RETURN jsonb_build_object('ok',true,'listing_id',v_listing_id);
END;$$;
REVOKE ALL ON FUNCTION public.create_listing(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_listing(text,int,int) TO authenticated;

-- RPC: sync gold — server-side cap, uses auth.uid(), cannot touch other users
CREATE OR REPLACE FUNCTION public.sync_gold(p_gold BIGINT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_capped BIGINT;
BEGIN
  v_capped := LEAST(GREATEST(p_gold, 0), 100000000);
  UPDATE public.profiles SET gold = v_capped, updated_at = now() WHERE id = auth.uid();
  RETURN v_capped;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_gold(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_gold(BIGINT) TO authenticated;

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

-- Read access: open to all authenticated users (UUIDs are unguessable;
-- cross-table policies between raids↔raid_participants cause infinite recursion)
CREATE POLICY "raids_select" ON public.raids
  FOR SELECT TO authenticated USING (true);

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
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "raid_participants_insert" ON public.raid_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "raid_participants_update" ON public.raid_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Add raid_medals column to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS raid_medals INTEGER DEFAULT 0;

-- ── Raid Invites ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.raid_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  raid_id UUID REFERENCES raids(id) ON DELETE CASCADE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('ancient', 'mythic', 'eternal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours')
);

CREATE INDEX IF NOT EXISTS idx_raid_invites_to_user ON raid_invites(to_user_id, status);

ALTER TABLE public.raid_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raid_invites_select" ON public.raid_invites
  FOR SELECT TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "raid_invites_insert" ON public.raid_invites
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "raid_invites_update" ON public.raid_invites
  FOR UPDATE USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

-- ── Raid phase column ─────────────────────────────────────────────────────────

ALTER TABLE public.raids ADD COLUMN IF NOT EXISTS current_phase INTEGER NOT NULL DEFAULT 1 CHECK (current_phase IN (1, 2, 3));

-- ── Raid history ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.raid_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raid_id UUID NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tier TEXT NOT NULL,
  damage_dealt BIGINT NOT NULL DEFAULT 0,
  survived BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raid_history_user ON raid_history(user_id, completed_at DESC);

ALTER TABLE public.raid_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raid_history_select" ON public.raid_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "raid_history_insert" ON public.raid_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Realtime REPLICA IDENTITY ─────────────────────────────────────────────────
-- Required for Supabase Realtime filtered subscriptions on DELETE/UPDATE events.
-- Without FULL, DELETE events don't carry old row data → party_id/to_user_id
-- filters never match → member-leave and invite events are silently dropped.
ALTER TABLE public.party_members REPLICA IDENTITY FULL;
ALTER TABLE public.party_invites REPLICA IDENTITY FULL;
ALTER TABLE public.party_craft_sessions REPLICA IDENTITY FULL;

-- ── Realtime Publication ───────────────────────────────────────────────────────
-- All party/craft tables must be in supabase_realtime for events to fire.
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_craft_sessions;

-- ── Auth security: login rate limiting ────────────────────────────────────────

-- Stores every login attempt so server-side rate limiting RPCs can count failures.
-- No RLS — only accessible through security-definer functions below.
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier   TEXT        NOT NULL,      -- email or username, lowercased+trimmed
  success      BOOLEAN     NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_id_time
  ON public.login_attempts(identifier, attempted_at DESC);

-- Check if an identifier is currently rate-limited.
-- Returns {blocked, failures, retry_after} — callable by anon for login flow.
-- Rule: 5 failures within 15 minutes → blocked for the remainder of that window.
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failures   int;
  v_oldest     timestamptz;
  v_retry_after int;
BEGIN
  SELECT count(*), min(attempted_at)
  INTO   v_failures, v_oldest
  FROM   public.login_attempts
  WHERE  identifier = lower(trim(p_identifier))
    AND  success    = false
    AND  attempted_at > now() - interval '15 minutes';

  IF v_failures >= 5 THEN
    v_retry_after := greatest(0,
      extract(epoch from (v_oldest + interval '15 minutes' - now()))::int);
    RETURN json_build_object(
      'blocked',      true,
      'failures',     v_failures,
      'retry_after',  v_retry_after
    );
  END IF;

  RETURN json_build_object('blocked', false, 'failures', v_failures, 'retry_after', 0);
END;
$$;
REVOKE ALL  ON FUNCTION public.check_login_rate_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO anon, authenticated;

-- Record one login attempt. Automatically purges entries older than 24 h.
CREATE OR REPLACE FUNCTION public.record_login_attempt(p_identifier text, p_success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (identifier, success)
  VALUES (lower(trim(p_identifier)), p_success);

  -- Rolling cleanup — keeps the table small
  DELETE FROM public.login_attempts
  WHERE attempted_at < now() - interval '24 hours';
END;
$$;
REVOKE ALL  ON FUNCTION public.record_login_attempt(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean) TO anon, authenticated;

-- Resolve a username to its email for the login-by-username flow.
-- Security definer so anon callers cannot read the profiles table directly.
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM   public.profiles
  WHERE  username = trim(p_username)
  LIMIT  1;

  RETURN v_email;
END;
$$;
REVOKE ALL  ON FUNCTION public.get_email_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
