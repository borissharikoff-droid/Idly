-- Analytics RPCs v3: platform stats, version distribution, session histogram, retention cohorts

-- ── Platform distribution ────────────────────────────────────────────────────
create or replace function admin_platform_stats()
returns table (
  platform  text,
  cnt       bigint
) language sql security definer as $$
  select coalesce(platform, 'unknown') as platform, count(*) as cnt
  from public.profiles
  group by 1
  order by 2 desc;
$$;

-- ── Client version distribution ──────────────────────────────────────────────
create or replace function admin_version_distribution()
returns table (
  client_version text,
  cnt            bigint
) language sql security definer as $$
  select coalesce(client_version, 'unknown') as client_version, count(*) as cnt
  from public.profiles
  group by 1
  order by 2 desc
  limit 20;
$$;

-- ── Session duration histogram ───────────────────────────────────────────────
-- Buckets: <5min, 5-15min, 15-60min, 60min+
create or replace function admin_session_histogram()
returns table (
  bucket text,
  cnt    bigint
) language sql security definer as $$
  select bucket, cnt from (
    select
      case
        when duration_seconds < 300   then '<5min'
        when duration_seconds < 900   then '5-15min'
        when duration_seconds < 3600  then '15-60min'
        else '60min+'
      end as bucket,
      count(*) as cnt
    from public.session_summaries
    where start_time >= now() - interval '30 days'
    group by 1
  ) sub
  order by
    case bucket
      when '<5min'    then 1
      when '5-15min'  then 2
      when '15-60min' then 3
      else 4
    end;
$$;

-- Drop first — return type changed (added retained_d1/d7/d30 columns)
drop function if exists admin_retention_cohorts();

-- ── Retention cohorts (weekly, last 12 weeks) ────────────────────────────────
-- D1: returned within 24-48h of first session
-- D7: returned 7-8 days after first session
-- D30: returned 30-31 days after first session
create or replace function admin_retention_cohorts()
returns table (
  cohort_week  date,
  users_joined bigint,
  retained_d1  bigint,
  retained_d7  bigint,
  retained_d30 bigint
) language sql security definer as $$
  with first_sessions as (
    select
      user_id,
      min(start_time) as first_time
    from public.session_summaries
    group by user_id
  ),
  cohorts as (
    select
      date_trunc('week', fs.first_time)::date as cohort_week,
      fs.user_id,
      fs.first_time
    from first_sessions fs
    where fs.first_time >= now() - interval '12 weeks'
  )
  select
    c.cohort_week,
    count(distinct c.user_id) as users_joined,
    count(distinct case
      when exists (
        select 1 from public.session_summaries s
        where s.user_id = c.user_id
          and s.start_time >= c.first_time + interval '1 day'
          and s.start_time <  c.first_time + interval '2 days'
      ) then c.user_id end
    ) as retained_d1,
    count(distinct case
      when exists (
        select 1 from public.session_summaries s
        where s.user_id = c.user_id
          and s.start_time >= c.first_time + interval '7 days'
          and s.start_time <  c.first_time + interval '8 days'
      ) then c.user_id end
    ) as retained_d7,
    count(distinct case
      when exists (
        select 1 from public.session_summaries s
        where s.user_id = c.user_id
          and s.start_time >= c.first_time + interval '30 days'
          and s.start_time <  c.first_time + interval '31 days'
      ) then c.user_id end
    ) as retained_d30
  from cohorts c
  group by 1
  order by 1 desc;
$$;

-- ── User segment counts ───────────────────────────────────────────────────────
-- Power users: seen in last 24h AND have sessions this week
-- New users: created_at within last 7 days
-- At risk: last seen 7-30 days ago
-- Churned: not seen in 30+ days
create or replace function admin_user_segments()
returns table (
  segment text,
  cnt     bigint
) language sql security definer as $$
  select 'power_users' as segment,
    count(*) as cnt
  from public.profiles
  where updated_at >= now() - interval '24 hours'
    and is_online = false  -- recently active but not necessarily online right now
  union all
  select 'new_users',
    count(*)
  from public.profiles
  where created_at >= now() - interval '7 days'
  union all
  select 'at_risk',
    count(*)
  from public.profiles
  where updated_at >= now() - interval '30 days'
    and updated_at <  now() - interval '7 days'
  union all
  select 'churned',
    count(*)
  from public.profiles
  where updated_at < now() - interval '30 days'
  order by 1;
$$;
