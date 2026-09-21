-- Fee settlement (2026-09-21). The garage collects the ₹3.90 fee from the
-- customer on its own QR (it accrues to garage_ledger as owed to KYM). At end of
-- day the garage settles the accrued fees to KYM via Razorpay, IN-APP (Orders API
-- + Standard Checkout). This migration adds the server backbone:
--   * a 'settlement' ledger entry type,
--   * fee_settlements (idempotency + audit of each Razorpay order),
--   * garage_settlement_status() — outstanding, due-before-today, locked,
--   * a FEATURE-FLAGGED next-day lock in the service-create choke point.
-- The Razorpay create-order + webhook Edge Functions write these.
-- Idempotent; safe to run more than once.

-- 1. Feature flags (simple key/value; admin-managed) -----------------------
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

drop policy if exists "app_config read" on public.app_config;
create policy "app_config read" on public.app_config
  for select to authenticated using (true);

drop policy if exists "app_config admin write" on public.app_config;
create policy "app_config admin write" on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.app_config to authenticated;

-- Off until the whole in-app settlement flow is live + Razorpay keys are set.
-- Flip to 'true' (admin) to arm the next-day lock.
insert into public.app_config (key, value) values ('fee_settlement_enabled', 'false')
on conflict (key) do nothing;

create or replace function public.app_flag(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true' from public.app_config where key = p_key), false);
$$;
grant execute on function public.app_flag(text) to authenticated;

-- 2. Allow 'settlement' ledger entries (garage paying KYM the owed fees) -----
alter table public.garage_ledger drop constraint if exists garage_ledger_entry_type_chk;
alter table public.garage_ledger add constraint garage_ledger_entry_type_chk
  check (entry_type in ('fee_accrued', 'chargeback', 'recovery', 'adjustment', 'settlement'));

-- 3. fee_settlements — one row per Razorpay order (idempotency + audit) ------
create table if not exists public.fee_settlements (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  amount numeric not null,               -- rupees being settled
  razorpay_order_id text unique,         -- created server-side (create-order fn)
  razorpay_payment_id text,              -- captured payment (webhook)
  status text not null default 'created',-- created | paid | failed
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.fee_settlements drop constraint if exists fee_settlements_status_chk;
alter table public.fee_settlements add constraint fee_settlements_status_chk
  check (status in ('created', 'paid', 'failed'));
create index if not exists idx_fee_settlements_garage on public.fee_settlements(garage_id);

alter table public.fee_settlements enable row level security;
drop policy if exists "fee_settlements owner or admin read" on public.fee_settlements;
create policy "fee_settlements owner or admin read" on public.fee_settlements
  for select using (public.owns_garage(garage_id) or public.is_admin());
grant select on public.fee_settlements to authenticated;
-- All writes are server-side (the Razorpay Edge Functions use the service role).

-- 4. Settlement status (IST day boundary) -----------------------------------
--   outstanding = all-time owed (sum of the ledger).
--   due_now     = fees accrued BEFORE today, net of settlements/recoveries —
--                 what must be cleared to lift the next-day lock. Today's fresh
--                 fees are excluded (the garage has until tomorrow).
create or replace function public.garage_settlement_status(p_garage_id uuid)
returns table (outstanding numeric, due_now numeric, locked boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today_start timestamptz := (date_trunc('day', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata');
  v_accrued_before numeric;
  v_reductions numeric;   -- settlements + recoveries + adjustments (stored negative)
  v_outstanding numeric;
  v_due numeric;
begin
  if not (public.owns_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(sum(amount), 0) into v_outstanding
    from public.garage_ledger where garage_id = p_garage_id;

  select coalesce(sum(amount), 0) into v_accrued_before
    from public.garage_ledger
    where garage_id = p_garage_id
      and entry_type in ('fee_accrued', 'chargeback')
      and created_at < v_today_start;

  select coalesce(sum(amount), 0) into v_reductions
    from public.garage_ledger
    where garage_id = p_garage_id
      and entry_type in ('settlement', 'recovery', 'adjustment');

  v_due := greatest(0, v_accrued_before + v_reductions);  -- reductions are negative
  return query select v_outstanding, v_due, (v_due > 0);
end;
$$;
grant execute on function public.garage_settlement_status(uuid) to authenticated;

-- 5. Next-day lock at the service-create choke point (feature-flagged) -------
-- Re-declares create_service_record_with_taxonomy (same signature/body as
-- 20260718000300) with a settlement gate added right after the ownership check.
create or replace function public.create_service_record_with_taxonomy(
  p_garage_id uuid,
  p_customer_phone text,
  p_vehicle_type public.vehicle_type,
  p_vehicle_make_code text,
  p_vehicle_model_code text,
  p_vehicle_make_other text,
  p_vehicle_model_other text,
  p_vehicle_number text,
  p_model_year smallint,
  p_odometer_km integer,
  p_service_codes text[],
  p_failure_codes text[],
  p_service_notes text,
  p_amount numeric,
  p_customer_has_app boolean
)
returns table (
  service_record_id uuid,
  customer_phone text,
  status public.service_record_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_garage_name text;
  v_service_codes text[];
  v_failure_codes text[];
  v_description text;
  v_record_id uuid;
  v_phone text;
begin
  if not (public.owns_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized for this garage' using errcode = '42501';
  end if;

  -- Next-day settlement lock: block new services while yesterday's fees are
  -- unsettled. Feature-flagged so it stays inert until the pay flow is live.
  if public.app_flag('fee_settlement_enabled')
     and (select locked from public.garage_settlement_status(p_garage_id)) then
    raise exception 'Please settle your pending platform fees before adding new services'
      using errcode = 'P0001';
  end if;

  select name into v_garage_name from public.garages where id = p_garage_id;
  if v_garage_name is null then
    raise exception 'Garage not found' using errcode = 'P0002';
  end if;

  v_phone := public.normalize_indian_phone(p_customer_phone);

  -- Taxonomy is OPTIONAL. De-dupe whatever was passed (may be empty/null).
  v_service_codes := (select array_agg(distinct c) from unnest(coalesce(p_service_codes, '{}')) as c where nullif(btrim(c), '') is not null);
  v_failure_codes := (select array_agg(distinct c) from unnest(coalesce(p_failure_codes, '{}')) as c where nullif(btrim(c), '') is not null);

  if exists (
    select 1 from unnest(v_service_codes) as c
    where not exists (select 1 from public.service_categories sc where sc.code = c and sc.is_active)
  ) then
    raise exception 'Unknown or inactive service category' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_failure_codes) as c
    where not exists (select 1 from public.failure_categories fc where fc.code = c and fc.is_active)
  ) then
    raise exception 'Unknown or inactive failure category' using errcode = '22023';
  end if;

  select string_agg(display_name, ', ' order by sort_order)
    into v_description
  from public.service_categories
  where code = any(v_service_codes);

  insert into public.service_records (
    garage_id, customer_phone, garage_name, vehicle_number, description, amount,
    platform_fee, garage_earnings, status, is_reliable, verification_method,
    approved_by_customer, vehicle_type, vehicle_make_code, vehicle_model_code,
    vehicle_make_other, vehicle_model_other, model_year, odometer_km, service_notes,
    invoice_delivery_channel, invoice_notification_status
  ) values (
    p_garage_id,
    v_phone,
    v_garage_name,
    nullif(btrim(upper(coalesce(p_vehicle_number, ''))), ''),
    coalesce(v_description, nullif(btrim(coalesce(p_service_notes, '')), ''), 'Service'),
    p_amount,
    0,
    p_amount,
    'pending_otp',
    false,
    case when p_customer_has_app then 'in_app'::public.verification_method else 'whatsapp_otp'::public.verification_method end,
    false,
    p_vehicle_type,
    nullif(btrim(coalesce(p_vehicle_make_code, '')), ''),
    nullif(btrim(coalesce(p_vehicle_model_code, '')), ''),
    nullif(btrim(coalesce(p_vehicle_make_other, '')), ''),
    nullif(btrim(coalesce(p_vehicle_model_other, '')), ''),
    p_model_year,
    p_odometer_km,
    nullif(btrim(coalesce(p_service_notes, '')), ''),
    'none',
    'not_required'
  )
  returning id into v_record_id;

  insert into public.service_record_services (service_record_id, service_category_code)
  select v_record_id, c from unnest(v_service_codes) as c;

  insert into public.service_record_failures (service_record_id, failure_category_code)
  select v_record_id, c from unnest(v_failure_codes) as c;

  return query select v_record_id, v_phone, 'pending_otp'::public.service_record_status;
end;
$$;
