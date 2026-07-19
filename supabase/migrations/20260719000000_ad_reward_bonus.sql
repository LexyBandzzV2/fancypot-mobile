-- Rewarded-ad bonus allowance. Additive, non-breaking.
--
-- Free-tier users can watch a rewarded ad to earn one extra AI action
-- (an "extra try-on"). The AI limit enforced server-side in
-- _shared/ai-router.ts (chargeAiSpend) is a rolling 30-day DOLLAR cap, so the
-- reward must add real server-side allowance — a client-only reward would be
-- instantly overridden by the server's 402. We model the reward as a small
-- pool of bonus cents on the profile that chargeAiSpend consults ONLY when a
-- user is already over their plan cap. When nobody has earned a bonus
-- (bonus_ai_cents = 0), the cap logic behaves exactly as before.
--
-- Grants happen ONLY through AdMob Server-Side Verification (the admob-ssv edge
-- function), which cryptographically verifies the callback before crediting.
-- The client is never trusted to grant a reward.
--
-- Safe to run on the live project: adds one nullable-defaulted column, one
-- table, and two SECURITY DEFINER functions. Nothing existing is altered.

-- 1) Bonus balance (USD cents) carried on the profile.
alter table if exists public.profiles
  add column if not exists bonus_ai_cents integer not null default 0;

-- 2) Audit log of granted rewards. transaction_id is AdMob's unique id for the
--    reward event, so the UNIQUE constraint makes grants idempotent (replay of
--    the same SSV callback can never double-credit). Also drives the per-day cap.
create table if not exists public.ad_reward_grants (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null unique,
  cents          integer not null,
  created_at     timestamptz not null default now()
);

create index if not exists ad_reward_grants_user_day
  on public.ad_reward_grants (user_id, created_at);

-- ad_reward_grants is written only by the service role (the SSV edge function).
-- Enable RLS with no policies so it is unreadable/unwritable by end users.
alter table public.ad_reward_grants enable row level security;

-- 3) Atomically consume up to p_cents of a user's bonus balance.
--    Returns the amount actually consumed (0 if the balance was insufficient).
--    The `bonus_ai_cents >= p_cents` guard in WHERE makes this race-safe: two
--    concurrent AI calls can never drive the balance negative.
create or replace function public.consume_ai_bonus(p_user_id uuid, p_cents integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if p_cents is null or p_cents <= 0 then
    return 0;
  end if;
  update public.profiles
     set bonus_ai_cents = bonus_ai_cents - p_cents
   where user_id = p_user_id
     and bonus_ai_cents >= p_cents;
  get diagnostics v_ok = row_count;
  if v_ok then
    return p_cents;
  end if;
  return 0;
end;
$$;

-- 4) Atomically grant a rewarded-ad bonus, enforcing a per-UTC-day cap and
--    replay protection. Returns one of: 'granted' | 'duplicate' | 'capped'.
--    Called only by the admob-ssv edge function AFTER it verifies the signature.
create or replace function public.grant_ai_reward(
  p_user_id        uuid,
  p_transaction_id text,
  p_cents          integer,
  p_daily_cap      integer default 3
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_count integer;
begin
  -- Replay guard: same AdMob transaction already credited.
  if exists (select 1 from public.ad_reward_grants where transaction_id = p_transaction_id) then
    return 'duplicate';
  end if;

  -- Server-side daily cap (defense-in-depth beyond the client's 3/day gate).
  select count(*) into v_today_count
    from public.ad_reward_grants
   where user_id = p_user_id
     and created_at >= date_trunc('day', now() at time zone 'utc');
  if v_today_count >= p_daily_cap then
    return 'capped';
  end if;

  insert into public.ad_reward_grants (user_id, transaction_id, cents)
  values (p_user_id, p_transaction_id, p_cents)
  on conflict (transaction_id) do nothing;

  -- If the insert lost a race to a concurrent identical callback, don't credit.
  if not found then
    return 'duplicate';
  end if;

  update public.profiles
     set bonus_ai_cents = bonus_ai_cents + p_cents
   where user_id = p_user_id;

  return 'granted';
end;
$$;

comment on column public.profiles.bonus_ai_cents is
  'Rewarded-ad bonus AI allowance (USD cents). Consumed by chargeAiSpend only when a user is over their plan cap. Granted only via verified AdMob SSV.';
comment on function public.consume_ai_bonus is
  'Atomically consume bonus AI cents when a user is over their plan cap. Returns cents consumed (0 if insufficient).';
comment on function public.grant_ai_reward is
  'Atomically credit a verified AdMob rewarded-ad bonus with per-day cap + replay protection. Returns granted|duplicate|capped.';
