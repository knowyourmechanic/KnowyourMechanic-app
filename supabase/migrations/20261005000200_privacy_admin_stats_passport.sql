-- 2026-10-05 (b). Idempotent; safe to run more than once.
--
-- 1. Garage standing (fraud strikes, penalty) leaves the public garages row:
--    `garages` is readable by anyone (anon + every signed-in user) for
--    discovery, and Postgres column grants can't hide columns per row. They
--    move to garage_standing, readable only by the owning garage and staff.
-- 2. Admin/employee/fee statistics are aggregated in the database instead of
--    shipping every completed service record to the browser.
-- 3. Public "services completed on KYM" counts for discovery (no verification
--    badge — garages are not vetted; this is just a count of OTP-confirmed jobs).
-- 4. Vehicle Service Passport: a customer can share a read-only link to one
--    vehicle's confirmed service history (e.g. when selling it).

-- 1. Garage standing ----------------------------------------------------------
create table if not exists public.garage_standing (
  garage_id uuid primary key references public.garages(id) on delete cascade,
  fraud_strikes integer not null default 0 check (fraud_strikes >= 0),
  penalty_amount numeric(12, 2) not null default 0 check (penalty_amount >= 0),
  note text,
  updated_at timestamptz not null default now()
);

alter table public.garage_standing enable row level security;

drop policy if exists "standing owner staff read" on public.garage_standing;
create policy "standing owner staff read" on public.garage_standing
  for select using (public.owns_garage(garage_id) or public.is_admin() or public.is_support());

drop policy if exists "standing admin write" on public.garage_standing;
create policy "standing admin write" on public.garage_standing
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.garage_standing from anon;
grant select, insert, update, delete on public.garage_standing to authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garages' and column_name = 'fraud_strikes'
  ) then
    insert into public.garage_standing (garage_id, fraud_strikes, penalty_amount)
    select id, fraud_strikes, penalty_amount from public.garages
    where fraud_strikes <> 0 or penalty_amount <> 0
    on conflict (garage_id) do nothing;
  end if;
end $$;

-- The write guard referenced the moved columns; redefine it first.
create or replace function public.guard_garage_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.rating := 0;
    new.total_reviews := 0;
    new.is_offboarded := false;
    new.is_verified := false;
    new.assigned_employee_id := null;   -- set via apply_garage_referral()
    return new;
  end if;

  -- Silently keep server-managed values (clients often send whole rows).
  new.id := old.id;
  new.owner_profile_id := old.owner_profile_id;
  new.rating := old.rating;
  new.total_reviews := old.total_reviews;
  new.is_offboarded := old.is_offboarded;
  new.assigned_employee_id := old.assigned_employee_id;
  -- is_verified only means "listed in discovery" (onboarding finished); it is
  -- not a vetting badge and is never shown to customers as one.
  if new.is_verified and not old.is_verified
     and (new.onboarding_status <> 'completed' or old.is_offboarded) then
    new.is_verified := false;
  end if;
  return new;
end;
$$;

alter table public.garages
  drop column if exists fraud_strikes,
  drop column if exists penalty_amount;

-- 2. Server-side statistics ---------------------------------------------------
-- Platform overview for the admin console (one round trip, no row dumps).
create or replace function public.admin_overview_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totalGarages', (select count(*) from public.garages),
    'totalCustomers', (select count(*) from public.profile_roles where role = 'customer'),
    'totalUsers', (select count(*) from public.profiles),
    'totalEmployees', (select count(*) from public.employees),
    'referredGarages', (select count(*) from public.garages where assigned_employee_id is not null),
    'totalServices', count(*),
    'totalRevenue', coalesce(sum(platform_fee), 0),
    'totalGMV', coalesce(sum(amount), 0),
    'totalVehicles', count(distinct vehicle_number),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'count', c, 'revenue', r) order by d)
      from (
        select (created_at at time zone 'Asia/Kolkata')::date as d, count(*) as c, sum(platform_fee) as r
        from public.service_records
        where status = 'completed'
          and created_at >= now() - make_interval(days => greatest(p_days, 1))
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v
  from public.service_records
  where status = 'completed';

  return v;
end;
$$;
revoke all on function public.admin_overview_stats(integer) from public, anon;
grant execute on function public.admin_overview_stats(integer) to authenticated;

-- Completed-service totals per garage. Admins see any garage, employees their
-- assigned garages, owners their own; other ids are silently skipped.
create or replace function public.garage_service_metrics(p_garage_ids uuid[] default null)
returns table (garage_id uuid, services bigint, gmv numeric, fees numeric, last_30d bigint)
language sql
stable
security definer
set search_path = public
as $$
  select sr.garage_id,
         count(*),
         coalesce(sum(sr.amount), 0),
         coalesce(sum(sr.platform_fee), 0),
         count(*) filter (where sr.created_at >= now() - interval '30 days')
  from public.service_records sr
  where sr.status = 'completed'
    and (p_garage_ids is null or sr.garage_id = any(p_garage_ids))
    and (public.is_admin()
         or public.owns_garage(sr.garage_id)
         or public.employee_assigned_to_garage(sr.garage_id))
  group by sr.garage_id;
$$;
revoke all on function public.garage_service_metrics(uuid[]) from public, anon;
grant execute on function public.garage_service_metrics(uuid[]) to authenticated;

-- Per-garage fee position for the admin Fees page.
create or replace function public.admin_fee_overview()
returns table (garage_id uuid, name text, outstanding numeric, accrued numeric, settled numeric, last_settled_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  with l as (
    select gl.garage_id,
           sum(gl.amount) as outstanding,
           sum(gl.amount) filter (where gl.entry_type = 'fee_accrued') as accrued
    from public.garage_ledger gl group by gl.garage_id
  ), s as (
    select fs.garage_id, sum(fs.amount) as settled, max(fs.paid_at) as last_paid
    from public.fee_settlements fs where fs.status = 'paid' group by fs.garage_id
  )
  select g.id, g.name,
         coalesce(l.outstanding, 0), coalesce(l.accrued, 0), coalesce(s.settled, 0), s.last_paid
  from public.garages g
  left join l on l.garage_id = g.id
  left join s on s.garage_id = g.id
  where l.garage_id is not null or s.garage_id is not null
  order by coalesce(l.outstanding, 0) desc;
end;
$$;
revoke all on function public.admin_fee_overview() from public, anon;
grant execute on function public.admin_fee_overview() to authenticated;

-- 3. Public completed-service counts (discovery cards / garage page) ----------
create or replace function public.public_garage_service_counts(p_garage_ids uuid[])
returns table (garage_id uuid, completed bigint)
language sql
stable
security definer
set search_path = public
as $$
  select sr.garage_id, count(*)
  from public.service_records sr
  join public.garages g on g.id = sr.garage_id
  where sr.garage_id = any(p_garage_ids)
    and sr.status = 'completed'
    and g.is_verified and not g.is_offboarded
  group by sr.garage_id;
$$;
grant execute on function public.public_garage_service_counts(uuid[]) to anon, authenticated;

-- 4. Vehicle Service Passport sharing -------------------------------------------
create table if not exists public.vehicle_shares (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_number text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists idx_vehicle_shares_owner on public.vehicle_shares(profile_id, vehicle_number);

alter table public.vehicle_shares enable row level security;
drop policy if exists "vehicle shares owner read" on public.vehicle_shares;
create policy "vehicle shares owner read" on public.vehicle_shares
  for select using (profile_id = public.current_profile_id());
revoke all on public.vehicle_shares from anon;
revoke insert, update, delete on public.vehicle_shares from authenticated;
grant select on public.vehicle_shares to authenticated;

-- Get-or-create the caller's active share link for one of their vehicles.
create or replace function public.create_vehicle_share(p_vehicle_number text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_vehicle text := upper(regexp_replace(coalesce(p_vehicle_number, ''), '[\s-]', '', 'g'));
  v_token text;
begin
  if v_profile is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.service_records sr
    where upper(regexp_replace(coalesce(sr.vehicle_number, ''), '[\s-]', '', 'g')) = v_vehicle
      and sr.status = 'completed'
      and (sr.customer_profile_id = v_profile or sr.customer_phone = public.current_phone_number())
  ) then
    raise exception 'No completed services for this vehicle' using errcode = 'P0002';
  end if;

  select token into v_token from public.vehicle_shares
  where profile_id = v_profile and vehicle_number = v_vehicle and revoked_at is null
  limit 1;
  if v_token is null then
    v_token := encode(gen_random_bytes(12), 'hex');
    insert into public.vehicle_shares (token, profile_id, vehicle_number)
    values (v_token, v_profile, v_vehicle);
  end if;
  return v_token;
end;
$$;
revoke all on function public.create_vehicle_share(text) from public, anon;
grant execute on function public.create_vehicle_share(text) to authenticated;

create or replace function public.revoke_vehicle_share(p_vehicle_number text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.vehicle_shares
    set revoked_at = now()
    where profile_id = public.current_profile_id()
      and vehicle_number = upper(regexp_replace(coalesce(p_vehicle_number, ''), '[\s-]', '', 'g'))
      and revoked_at is null;
$$;
revoke all on function public.revoke_vehicle_share(text) from public, anon;
grant execute on function public.revoke_vehicle_share(text) to authenticated;

-- Public read of a shared passport: work done, where and when — never the
-- owner's phone, name, or amounts paid.
create or replace function public.get_shared_vehicle_history(p_token text)
returns table (
  vehicle_number text,
  service_date timestamptz,
  garage_name text,
  work_done text,
  odometer_km integer,
  invoice_number text
)
language sql
stable
security definer
set search_path = public
as $$
  select vs.vehicle_number,
         sr.created_at,
         sr.garage_name,
         coalesce(nullif(btrim(sr.service_notes), ''), sr.description),
         sr.odometer_km,
         sr.invoice_number
  from public.vehicle_shares vs
  join public.profiles p on p.id = vs.profile_id
  join public.service_records sr
    on upper(regexp_replace(coalesce(sr.vehicle_number, ''), '[\s-]', '', 'g')) = vs.vehicle_number
   and sr.status = 'completed'
   and (sr.customer_profile_id = vs.profile_id or sr.customer_phone = p.phone_number)
  where vs.token = p_token and vs.revoked_at is null
  order by sr.created_at desc
  limit 200;
$$;
grant execute on function public.get_shared_vehicle_history(text) to anon, authenticated;
