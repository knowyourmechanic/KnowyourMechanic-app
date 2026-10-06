-- Security audit fixes (2026-10-05). Idempotent; safe to run more than once.
--
-- 1. PRIVILEGE ESCALATION: any signed-in user could `update profiles set
--    role = 'admin'` on their own row (the update policy allows own row, the
--    blanket table grant allows every column) and trg_sync_profile_role then
--    copied that into profile_roles -> is_admin() = true. They could also insert
--    their first profile with role 'admin', or with someone else's phone number
--    (current_phone_number() gates service history, deliveries and the
--    login-by-phone link). Client writes may now only touch harmless columns.
-- 2. Garage owners (and assigned employees) could write their own rating,
--    review count, fraud strikes, penalty, off-boarding flag and employee
--    attribution. Those columns are now server-managed.
-- 3. purge_stale_pending_service_records() was SECURITY DEFINER with the default
--    PUBLIC execute grant and a caller-controlled interval: anyone holding the
--    public key could delete every in-flight service record platform-wide.
-- 4. Reviews could be posted for garages the customer never used.
-- 5. A ticket opener could post messages flagged sender_kind = 'support'.
-- 6. garage_owed_balance() returned any garage's balance to any user.
-- 7. REGRESSION: 20260921000200 re-declared create_service_record_with_taxonomy
--    from an older body and silently dropped the auto-account step, so new
--    records had no customer_profile_id (customers were never reached by push
--    and never got the 'customer' role). Restored, plus amount/off-boarding
--    validation.
-- 8. Referral codes never resolved (employees is admin-only under RLS) and a
--    customer number could never add a garage role. Small definer RPCs for both.
-- 9. A push token re-registered by a different account on the same phone stayed
--    active for the previous account, so that person's OTPs/invoices kept
--    arriving on a device they no longer use.
-- 10. Fee-settlement webhook: atomic, amount-checked, exactly-once crediting.
-- 11. Garage photos move from base64-in-row to a storage bucket.

-- ---------------------------------------------------------------------------
-- Helper: the signed-in user's phone (last 10 digits) straight from auth.users.
create or replace function public.current_auth_phone()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
  from auth.users where id = auth.uid();
$$;
revoke all on function public.current_auth_phone() from public, anon;
grant execute on function public.current_auth_phone() to authenticated;

-- 1. Profiles ----------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is then the role that issued the
-- statement. Direct client writes run as 'authenticated'; SECURITY DEFINER RPCs,
-- triggers and the service role run as their owner and are trusted.
create or replace function public.guard_profile_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.auth_user_id is distinct from auth.uid() then
      raise exception 'Profile must belong to the signed-in user' using errcode = '42501';
    end if;
    if new.role not in ('customer', 'garage') then
      raise exception 'Role % cannot be self-assigned', new.role using errcode = '42501';
    end if;
    if new.phone_number is distinct from public.current_auth_phone() then
      raise exception 'Profile phone must match the verified login phone' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: identity and role are immutable from the client.
  if new.role is distinct from old.role
     or new.phone_number is distinct from old.phone_number
     or new.auth_user_id is distinct from old.auth_user_id
     or new.id is distinct from old.id then
    raise exception 'role, phone_number and auth_user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_write on public.profiles;
create trigger trg_guard_profile_write
  before insert or update on public.profiles
  for each row execute function public.guard_profile_write();

-- Self-service roles: a customer number can also register a garage (and vice
-- versa). Privileged roles are only ever granted by an admin.
create or replace function public.add_my_role(p_role public.app_role)
returns public.app_role[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_role not in ('customer', 'garage') then
    raise exception 'Role % cannot be self-assigned', p_role using errcode = '42501';
  end if;
  insert into public.profile_roles (profile_id, role)
  values (v_profile, p_role)
  on conflict do nothing;
  return public.my_roles();
end;
$$;
revoke all on function public.add_my_role(public.app_role) from public, anon;
grant execute on function public.add_my_role(public.app_role) to authenticated;

-- 2. Garages: server-managed columns ------------------------------------------
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
    new.fraud_strikes := 0;
    new.penalty_amount := 0;
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
  new.fraud_strikes := old.fraud_strikes;
  new.penalty_amount := old.penalty_amount;
  new.is_offboarded := old.is_offboarded;
  new.assigned_employee_id := old.assigned_employee_id;
  -- Self-verification is part of onboarding, but only once it is complete and
  -- never for an off-boarded garage.
  if new.is_verified and not old.is_verified
     and (new.onboarding_status <> 'completed' or old.is_offboarded) then
    new.is_verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_garage_write on public.garages;
create trigger trg_guard_garage_write
  before insert or update on public.garages
  for each row execute function public.guard_garage_write();

-- Referral codes: resolve to the employee's display name (for the live check
-- in onboarding) and attach the employee to the caller's garage once.
create or replace function public.lookup_referral_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name from public.employees
  where upper(referral_code) = upper(btrim(p_code)) and is_active
  limit 1;
$$;
revoke all on function public.lookup_referral_code(text) from public, anon;
grant execute on function public.lookup_referral_code(text) to authenticated;

create or replace function public.apply_garage_referral(p_garage_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp record;
begin
  if not (public.owns_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized for this garage' using errcode = '42501';
  end if;
  select id, name into v_emp from public.employees
  where upper(referral_code) = upper(btrim(p_code)) and is_active
  limit 1;
  if v_emp.id is null then
    raise exception 'Invalid referral code' using errcode = 'P0002';
  end if;
  -- First referral wins; attribution never changes afterwards.
  update public.garages
    set assigned_employee_id = v_emp.id
    where id = p_garage_id and assigned_employee_id is null;
  return v_emp.name;
end;
$$;
revoke all on function public.apply_garage_referral(uuid, text) from public, anon;
grant execute on function public.apply_garage_referral(uuid, text) to authenticated;

-- 3. Purge RPC: server-only ---------------------------------------------------
-- Guarded: this function only exists if migration 20260726000200 was applied.
-- On a database where it was never created there is nothing to lock down, and an
-- unguarded REVOKE would error (no IF EXISTS form) and abort the whole migration.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_stale_pending_service_records'
  ) then
    execute 'revoke all on function public.purge_stale_pending_service_records(interval) from public, anon, authenticated';
  end if;
end $$;

-- 4. Reviews: only customers who completed a service with the garage ---------
create or replace function public.has_completed_service_with(p_garage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_records sr
    where sr.garage_id = p_garage_id
      and sr.status = 'completed'
      and (sr.customer_profile_id = public.current_profile_id()
           or sr.customer_phone = public.current_phone_number())
  );
$$;
grant execute on function public.has_completed_service_with(uuid) to authenticated;

drop policy if exists "reviews customer write" on public.reviews;
drop policy if exists "reviews customer insert" on public.reviews;
drop policy if exists "reviews customer update" on public.reviews;
drop policy if exists "reviews customer delete" on public.reviews;

create policy "reviews customer insert" on public.reviews
for insert with check (
  public.is_admin()
  or (customer_profile_id = public.current_profile_id()
      and public.has_completed_service_with(garage_id))
);
create policy "reviews customer update" on public.reviews
for update using (customer_profile_id = public.current_profile_id() or public.is_admin())
with check (
  public.is_admin()
  or (customer_profile_id = public.current_profile_id()
      and public.has_completed_service_with(garage_id))
);
create policy "reviews customer delete" on public.reviews
for delete using (customer_profile_id = public.current_profile_id() or public.is_admin());

-- 5. Support messages: only staff may speak as 'support' ----------------------
drop policy if exists "support messages insert" on public.support_messages;
create policy "support messages insert" on public.support_messages
for insert with check (
  sender_profile_id = public.current_profile_id()
  and (
    ((public.is_support() or public.is_admin()))
    or (
      sender_kind = 'user'
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.opener_profile_id = public.current_profile_id()
      )
    )
  )
);

-- 6. Owed balance: owner/admin only -------------------------------------------
create or replace function public.garage_owed_balance(p_garage_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.owns_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return (select coalesce(sum(amount), 0) from public.garage_ledger where garage_id = p_garage_id);
end;
$$;

-- 7. Service create: auto-account + settlement lock + validation --------------
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
  v_garage record;
  v_service_codes text[];
  v_failure_codes text[];
  v_description text;
  v_record_id uuid;
  v_phone text;
  v_customer_profile_id uuid;
begin
  if not (public.owns_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized for this garage' using errcode = '42501';
  end if;

  select name, is_offboarded into v_garage from public.garages where id = p_garage_id;
  if v_garage.name is null then
    raise exception 'Garage not found' using errcode = 'P0002';
  end if;
  if v_garage.is_offboarded then
    raise exception 'This garage has been off-boarded' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Amount must be between 1 and 10,00,000' using errcode = '22023';
  end if;

  -- Next-day settlement lock (feature-flagged; inert until the pay flow is live).
  if public.app_flag('fee_settlement_enabled')
     and (select s.locked from public.garage_settlement_status(p_garage_id) s) then
    raise exception 'Please settle your pending platform fees before adding new services'
      using errcode = 'P0001';
  end if;

  v_phone := public.normalize_indian_phone(p_customer_phone);

  -- Auto-account: ensure a customer profile exists for this phone (reuse any
  -- existing profile, whatever its primary role) and link the record to it.
  insert into public.profiles (phone_number, role)
  values (v_phone, 'customer')
  on conflict (phone_number) do nothing;

  select id into v_customer_profile_id
  from public.profiles
  where phone_number = v_phone
  limit 1;

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
    garage_id, customer_phone, customer_profile_id, garage_name, vehicle_number, description, amount,
    platform_fee, garage_earnings, status, is_reliable, verification_method,
    approved_by_customer, vehicle_type, vehicle_make_code, vehicle_model_code,
    vehicle_make_other, vehicle_model_other, model_year, odometer_km, service_notes,
    invoice_delivery_channel, invoice_notification_status
  ) values (
    p_garage_id,
    v_phone,
    v_customer_profile_id,
    v_garage.name,
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

-- Backfill the link for records created while the step was missing.
update public.service_records sr
set customer_profile_id = p.id
from public.profiles p
where sr.customer_profile_id is null
  and p.phone_number = sr.customer_phone;

insert into public.profile_roles (profile_id, role)
select distinct customer_profile_id, 'customer'::public.app_role
from public.service_records
where customer_profile_id is not null
on conflict do nothing;

-- 9. Device tokens: one active owner per token ---------------------------------
create or replace function public.register_device(p_push_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  -- The token now belongs to this account only.
  update public.user_devices
    set is_active = false, updated_at = now()
    where push_token = p_push_token and profile_id <> v_profile and is_active;

  insert into public.user_devices (profile_id, push_token, platform, is_active, last_seen_at)
  values (v_profile, p_push_token, p_platform, true, now())
  on conflict (profile_id, push_token)
  do update set is_active = true, platform = excluded.platform,
                last_seen_at = now(), updated_at = now();
end;
$$;
revoke all on function public.register_device(text, text) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;

-- 10. Fee settlement: exactly-once, amount-checked crediting --------------------
create or replace function public.apply_fee_settlement_payment(
  p_order_id text,
  p_payment_id text,
  p_amount_paise bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fee_settlements;
begin
  select * into v_row from public.fee_settlements
  where razorpay_order_id = p_order_id
  for update;

  if v_row.id is null then
    return 'unknown_order';
  end if;
  if v_row.status = 'paid' then
    return 'already_processed';
  end if;
  if p_amount_paise is not null and p_amount_paise < round(v_row.amount * 100) then
    update public.fee_settlements set status = 'failed' where id = v_row.id;
    return 'amount_mismatch';
  end if;

  update public.fee_settlements
    set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
    where id = v_row.id;

  insert into public.garage_ledger (garage_id, entry_type, amount, note)
  values (v_row.garage_id, 'settlement', -v_row.amount,
          'Fee settlement via Razorpay ' || coalesce(p_payment_id, p_order_id));

  return 'ok';
end;
$$;
revoke all on function public.apply_fee_settlement_payment(text, text, bigint) from public, anon, authenticated;
grant execute on function public.apply_fee_settlement_payment(text, text, bigint) to service_role;

-- 11. Garage photos bucket (public read; owner writes under '<garage_id>/...') --
insert into storage.buckets (id, name, public)
values ('garage-photos', 'garage-photos', true)
on conflict (id) do nothing;

drop policy if exists "garage photo owner insert" on storage.objects;
create policy "garage photo owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'garage-photos'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "garage photo owner update" on storage.objects;
create policy "garage photo owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'garage-photos'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'garage-photos'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "garage photo owner delete" on storage.objects;
create policy "garage photo owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'garage-photos'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  );
