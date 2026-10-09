-- Garage staff (employees of a garage) + work history. Idempotent.
--
-- Not to be confused with app_role 'employee' (KYM's own field-sales staff with
-- referral codes). Garage staff hold the 'garage' role and a row in
-- garage_members with member_role = 'staff'. Design: supabase/GARAGE_STAFF.md.
--
-- Rules enforced here:
--  * A garage has exactly one active owner row; staff rows are pending (asked
--    to join, waiting for the owner), active, removed (by owner or left) or
--    rejected.
--  * A person is staff at ONE garage at a time (one pending/active row), and
--    cannot be staff anywhere while owning a garage, or own one while staff.
--  * Staff see and act on only the services THEY logged, and only while active.
--  * An employee may create a garage for an owner who is not on KYM yet. The
--    owner's account is pre-created by phone; the garage works but stays out of
--    search until that owner logs in and confirms. A declined claim off-boards it.
--  * The employee who set the garage up may edit its details/photo/QR only
--    until onboarding completes; afterwards only the owner can.
--  * Customers rate each service; owners rate each employee's stint. Both feed a
--    portable work history the employee keeps across garages.

-- 1. Schema -------------------------------------------------------------------
alter table public.garages
  add column if not exists owner_confirmed_at timestamptz,
  add column if not exists owner_declined_at timestamptz,
  add column if not exists onboarded_by_profile_id uuid references public.profiles(id) on delete set null;

-- Every garage that exists today was created by its owner.
update public.garages set owner_confirmed_at = coalesce(owner_confirmed_at, created_at)
where owner_confirmed_at is null and onboarded_by_profile_id is null and owner_declined_at is null;

alter table public.service_records
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists performed_by_name text;

update public.service_records sr
set created_by_profile_id = g.owner_profile_id
from public.garages g
where sr.garage_id = g.id and sr.created_by_profile_id is null;

create index if not exists idx_service_records_created_by on public.service_records(created_by_profile_id);

create table if not exists public.garage_members (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'staff')),
  status text not null check (status in ('pending', 'active', 'removed', 'rejected')),
  display_name text,
  requested_by text not null default 'owner' check (requested_by in ('owner', 'staff', 'system')),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_garage_members_garage on public.garage_members(garage_id, status);
create index if not exists idx_garage_members_profile on public.garage_members(profile_id, status);
-- One open staff membership per person; one active owner per garage.
create unique index if not exists uq_garage_members_open_staff
  on public.garage_members(profile_id) where member_role = 'staff' and status in ('pending', 'active');
create unique index if not exists uq_garage_members_owner
  on public.garage_members(garage_id) where member_role = 'owner' and status = 'active';

drop trigger if exists set_garage_members_updated_at on public.garage_members;
create trigger set_garage_members_updated_at before update on public.garage_members
  for each row execute function public.set_updated_at();

insert into public.garage_members (garage_id, profile_id, member_role, status, requested_by, joined_at)
select g.id, g.owner_profile_id, 'owner', 'active', 'system', g.created_at
from public.garages g
where not exists (
  select 1 from public.garage_members m
  where m.garage_id = g.id and m.member_role = 'owner' and m.status = 'active'
);

-- Customer rating of ONE service (attributed to whoever logged it).
create table if not exists public.service_ratings (
  service_record_id uuid primary key references public.service_records(id) on delete cascade,
  customer_profile_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Owner's rating of an employee's time at the garage (one per membership).
create table if not exists public.staff_reviews (
  member_id uuid primary key references public.garage_members(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  note text check (note is null or length(note) <= 500),
  updated_at timestamptz not null default now()
);

-- 2. Helpers --------------------------------------------------------------------
create or replace function public.is_garage_staff(target_garage_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.garage_members
    where garage_id = target_garage_id and profile_id = public.current_profile_id()
      and member_role = 'staff' and status = 'active'
  );
$$;

create or replace function public.can_operate_garage(target_garage_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.owns_garage(target_garage_id) or public.is_garage_staff(target_garage_id);
$$;

-- Owner, or the employee who set the garage up while onboarding is unfinished.
create or replace function public.can_manage_garage(target_garage_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.owns_garage(target_garage_id) or exists (
    select 1 from public.garages g
    where g.id = target_garage_id
      and g.onboarded_by_profile_id = public.current_profile_id()
      and g.onboarding_status <> 'completed'
      and g.owner_declined_at is null
      and public.is_garage_staff(g.id)
  );
$$;

-- Owner / admin: any record of the garage. Staff: only records they logged.
create or replace function public.can_operate_service(p_service_record_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_records sr
    where sr.id = p_service_record_id
      and (public.is_admin()
           or public.owns_garage(sr.garage_id)
           or (public.is_garage_staff(sr.garage_id) and sr.created_by_profile_id = public.current_profile_id()))
  );
$$;

grant execute on function public.is_garage_staff(uuid), public.can_operate_garage(uuid),
  public.can_manage_garage(uuid), public.can_operate_service(uuid) to authenticated;

-- 3. Row security -----------------------------------------------------------------
alter table public.garage_members enable row level security;
alter table public.service_ratings enable row level security;
alter table public.staff_reviews enable row level security;

drop policy if exists "garage members visible" on public.garage_members;
create policy "garage members visible" on public.garage_members
  for select using (
    profile_id = public.current_profile_id()
    or public.owns_garage(garage_id)
    or public.is_admin() or public.is_support()
  );
-- All membership writes go through the RPCs below.
revoke insert, update, delete on public.garage_members from authenticated, anon;
grant select on public.garage_members to authenticated;

drop policy if exists "service ratings visible" on public.service_ratings;
create policy "service ratings visible" on public.service_ratings
  for select using (
    customer_profile_id = public.current_profile_id()
    or public.is_admin()
    or exists (
      select 1 from public.service_records sr
      where sr.id = service_record_id
        and (public.owns_garage(sr.garage_id) or sr.created_by_profile_id = public.current_profile_id())
    )
  );
revoke insert, update, delete on public.service_ratings from authenticated, anon;
grant select on public.service_ratings to authenticated;

drop policy if exists "staff reviews visible" on public.staff_reviews;
create policy "staff reviews visible" on public.staff_reviews
  for select using (
    staff_profile_id = public.current_profile_id()
    or public.owns_garage(garage_id)
    or public.is_admin()
  );
revoke insert, update, delete on public.staff_reviews from authenticated, anon;
grant select on public.staff_reviews to authenticated;

-- Garages: unconfirmed / declined garages stay out of search; members see theirs.
drop policy if exists "garages select visible" on public.garages;
create policy "garages select visible" on public.garages
for select using (
  public.is_admin()
  or owner_profile_id = public.current_profile_id()
  or public.employee_assigned_to_garage(id)
  or public.is_garage_staff(id)
  or onboarded_by_profile_id = public.current_profile_id()
  or (is_verified and not is_offboarded and owner_confirmed_at is not null)
);

drop policy if exists "garages update owner employee or admin" on public.garages;
create policy "garages update owner employee or admin" on public.garages
for update using (
  public.is_admin() or public.can_manage_garage(id) or public.employee_assigned_to_garage(id)
)
with check (
  public.is_admin() or public.can_manage_garage(id) or public.employee_assigned_to_garage(id)
);

drop policy if exists "garage services select visible" on public.garage_services;
create policy "garage services select visible" on public.garage_services
for select using (
  public.is_admin()
  or public.can_operate_garage(garage_id)
  or public.employee_assigned_to_garage(garage_id)
  or exists (
    select 1 from public.garages g
    where g.id = garage_id and g.is_verified and not g.is_offboarded and g.owner_confirmed_at is not null
  )
);
drop policy if exists "garage services owner or admin write" on public.garage_services;
create policy "garage services owner or admin write" on public.garage_services
for all using (public.is_admin() or public.can_manage_garage(garage_id))
with check (public.is_admin() or public.can_manage_garage(garage_id));

-- Payment QR + photos: the owner, or the onboarding employee until it completes.
drop policy if exists "payout owner or admin read" on public.garage_payout_details;
create policy "payout owner or admin read" on public.garage_payout_details
  for select using (public.can_operate_garage(garage_id) or public.can_manage_garage(garage_id) or public.is_admin());
drop policy if exists "payout owner or admin write" on public.garage_payout_details;
create policy "payout owner or admin write" on public.garage_payout_details
  for all using (public.can_manage_garage(garage_id) or public.is_admin())
  with check (public.can_manage_garage(garage_id) or public.is_admin());

do $$
declare b text;
begin
  foreach b in array array['garage-qr', 'garage-photos'] loop
    execute format('drop policy if exists %I on storage.objects', b || ' manager insert');
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.can_manage_garage(((storage.foldername(name))[1])::uuid))', b || ' manager insert', b);
    execute format('drop policy if exists %I on storage.objects', b || ' manager update');
    execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and public.can_manage_garage(((storage.foldername(name))[1])::uuid)) with check (bucket_id = %L and public.can_manage_garage(((storage.foldername(name))[1])::uuid))', b || ' manager update', b, b);
  end loop;
end $$;

-- Service records: staff see their own while active (owner/customer unchanged).
drop policy if exists "service records involved parties select" on public.service_records;
create policy "service records involved parties select" on public.service_records
for select using (
  public.is_admin()
  or customer_profile_id = public.current_profile_id()
  or customer_phone = public.current_phone_number()
  or public.owns_garage(garage_id)
  or public.employee_assigned_to_garage(garage_id)
  or (created_by_profile_id = public.current_profile_id() and public.is_garage_staff(garage_id))
);

-- 4. Garage write guard: protect the new ownership columns too ---------------------
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
    -- A garage created directly by a user is that user's own: confirmed.
    new.owner_confirmed_at := now();
    new.owner_declined_at := null;
    new.onboarded_by_profile_id := null;
    return new;
  end if;

  new.id := old.id;
  new.owner_profile_id := old.owner_profile_id;
  new.rating := old.rating;
  new.total_reviews := old.total_reviews;
  new.is_offboarded := old.is_offboarded;
  new.assigned_employee_id := old.assigned_employee_id;
  new.owner_confirmed_at := old.owner_confirmed_at;
  new.owner_declined_at := old.owner_declined_at;
  new.onboarded_by_profile_id := old.onboarded_by_profile_id;
  -- is_verified only means "onboarding finished"; listing in search also needs
  -- the owner's confirmation. Never a vetting badge.
  if new.is_verified and not old.is_verified
     and (new.onboarding_status <> 'completed' or old.is_offboarded) then
    new.is_verified := false;
  end if;
  return new;
end;
$$;

-- Every garage gets its owner membership row.
create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.garage_members (garage_id, profile_id, member_role, status, requested_by, joined_at)
  values (new.id, new.owner_profile_id, 'owner', 'active', 'system', now())
  on conflict do nothing;
  insert into public.profile_roles (profile_id, role) values (new.owner_profile_id, 'garage')
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_add_owner_membership on public.garages;
create trigger trg_add_owner_membership after insert on public.garages
  for each row execute function public.add_owner_membership();

-- 5. Where does this person belong? (drives routing after login) ------------------
create or replace function public.my_garage_membership()
returns table (
  garage_id uuid,
  garage_name text,
  member_role text,
  status text,
  owner_confirmed boolean,
  onboarding_status public.onboarding_status,
  onboarded_by_me boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, m.member_role, m.status, g.owner_confirmed_at is not null,
         g.onboarding_status, g.onboarded_by_profile_id = public.current_profile_id()
  from public.garage_members m
  join public.garages g on g.id = m.garage_id
  where m.profile_id = public.current_profile_id()
    and m.status in ('active', 'pending')
    and g.owner_declined_at is null
  order by (m.member_role = 'owner') desc, m.created_at desc
  limit 1;
$$;
grant execute on function public.my_garage_membership() to authenticated;

-- 6. Employee onboarding ----------------------------------------------------------
-- Garages owned by this phone (for "select your owner"). Names only.
create or replace function public.find_garages_by_owner_phone(p_owner_phone text)
returns table (garage_id uuid, garage_name text, address text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_phone text := public.normalize_indian_phone(p_owner_phone);
begin
  if public.current_profile_id() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return query
  select g.id, g.name, g.address
  from public.garages g
  join public.profiles p on p.id = g.owner_profile_id
  where p.phone_number = v_phone and not g.is_offboarded and g.owner_declined_at is null
  order by g.created_at;
end;
$$;
grant execute on function public.find_garages_by_owner_phone(text) to authenticated;

-- Shared checks: the caller can start a new staff relationship.
create or replace function public.assert_can_become_staff(p_profile uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.garages where owner_profile_id = p_profile and not is_offboarded and owner_declined_at is null) then
    raise exception 'You own a garage, so you cannot join another as an employee' using errcode = '22023';
  end if;
  if exists (select 1 from public.garage_members where profile_id = p_profile and member_role = 'staff' and status in ('pending', 'active')) then
    raise exception 'Already an employee (or waiting to join) at a garage' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.assert_can_become_staff(uuid) from public, anon, authenticated;

create or replace function public.request_to_join_garage(p_garage_id uuid, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
  v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.garages where id = p_garage_id and not is_offboarded and owner_declined_at is null) then
    raise exception 'Garage not found' using errcode = 'P0002';
  end if;
  perform public.assert_can_become_staff(v_me);
  insert into public.garage_members (garage_id, profile_id, member_role, status, display_name, requested_by)
  values (p_garage_id, v_me, 'staff', 'pending', nullif(btrim(p_display_name), ''), 'staff')
  returning id into v_id;
  insert into public.profile_roles (profile_id, role) values (v_me, 'garage') on conflict do nothing;
  if nullif(btrim(p_display_name), '') is not null then
    update public.profiles set name = coalesce(name, btrim(p_display_name)) where id = v_me;
  end if;
  return v_id;
end;
$$;

create or replace function public.cancel_join_request()
returns void language sql security definer set search_path = public as $$
  update public.garage_members set status = 'rejected', ended_at = now()
  where profile_id = public.current_profile_id() and member_role = 'staff' and status = 'pending';
$$;

-- Employee sets up a NEW garage for an owner who is not on KYM yet.
create or replace function public.create_garage_as_staff(
  p_owner_phone text,
  p_owner_name text,
  p_staff_name text,
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_service_hours text,
  p_working_days text[],
  p_business_type public.business_type,
  p_legal_business_name text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
  v_my_phone text;
  v_owner_phone text := public.normalize_indian_phone(p_owner_phone);
  v_owner uuid;
  v_garage uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select phone_number into v_my_phone from public.profiles where id = v_me;
  if v_owner_phone = v_my_phone then
    raise exception 'The owner''s number must be different from yours. If you own the garage, choose Owner.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Garage name is required' using errcode = '22023';
  end if;
  perform public.assert_can_become_staff(v_me);

  -- Owner account by phone (reused if it exists, like customer auto-accounts).
  insert into public.profiles (phone_number, role, name)
  values (v_owner_phone, 'garage', nullif(btrim(p_owner_name), ''))
  on conflict (phone_number) do nothing;
  select id into v_owner from public.profiles where phone_number = v_owner_phone;

  if exists (select 1 from public.garages where owner_profile_id = v_owner and not is_offboarded and owner_declined_at is null) then
    raise exception 'This owner already has a garage on KYM. Choose it from the list to ask to join.' using errcode = '22023';
  end if;
  if exists (select 1 from public.garage_members where profile_id = v_owner and member_role = 'staff' and status in ('pending', 'active')) then
    raise exception 'That number belongs to an employee of another garage' using errcode = '22023';
  end if;

  insert into public.garages (
    owner_profile_id, name, email, phone, address, latitude, longitude, service_hours,
    working_days, business_type, legal_business_name, onboarded_by_profile_id, owner_confirmed_at
  ) values (
    v_owner, btrim(p_name), nullif(btrim(p_email), ''), nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), ''),
    p_address, p_latitude, p_longitude, p_service_hours,
    coalesce(p_working_days, array['Mon','Tue','Wed','Thu','Fri','Sat']), p_business_type,
    coalesce(nullif(btrim(p_legal_business_name), ''), btrim(p_name)), v_me, null
  ) returning id into v_garage;

  insert into public.garage_members (garage_id, profile_id, member_role, status, display_name, requested_by, joined_at)
  values (v_garage, v_me, 'staff', 'active', nullif(btrim(p_staff_name), ''), 'staff', now());
  insert into public.profile_roles (profile_id, role) values (v_me, 'garage') on conflict do nothing;
  if nullif(btrim(p_staff_name), '') is not null then
    update public.profiles set name = coalesce(name, btrim(p_staff_name)) where id = v_me;
  end if;
  return v_garage;
end;
$$;

-- The owner confirms (or rejects) a garage an employee set up in their name.
create or replace function public.respond_to_garage_claim(p_garage_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_g public.garages;
begin
  select * into v_g from public.garages where id = p_garage_id for update;
  if v_g.id is null or v_g.owner_profile_id is distinct from public.current_profile_id() then
    raise exception 'Not your garage' using errcode = '42501';
  end if;
  if v_g.owner_confirmed_at is not null or v_g.owner_declined_at is not null then
    return;   -- already answered
  end if;
  if p_accept then
    update public.garages set owner_confirmed_at = now(), updated_at = now() where id = p_garage_id;
  else
    update public.garages set owner_declined_at = now(), is_offboarded = true, updated_at = now() where id = p_garage_id;
    update public.garage_members set status = 'removed', ended_at = now()
      where garage_id = p_garage_id and status in ('active', 'pending');
    insert into public.reports (reporter_profile_id, garage_id, reason, description)
    values (v_g.owner_profile_id, p_garage_id, 'ownership_declined',
            'The listed owner says this garage is not theirs. It was set up by an employee and has been taken offline.');
  end if;
end;
$$;

-- 7. Owner: team management ----------------------------------------------------------
create or replace function public.respond_join_request(p_member_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_m public.garage_members;
begin
  select * into v_m from public.garage_members where id = p_member_id for update;
  if v_m.id is null or not public.owns_garage(v_m.garage_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_m.status <> 'pending' then
    raise exception 'This request was already answered or withdrawn' using errcode = '22023';
  end if;
  update public.garage_members
    set status = case when p_approve then 'active' else 'rejected' end,
        joined_at = case when p_approve then now() else null end,
        ended_at = case when p_approve then null else now() end
    where id = p_member_id;
end;
$$;

create or replace function public.add_staff_by_phone(p_garage_id uuid, p_phone text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.normalize_indian_phone(p_phone);
  v_profile uuid;
  v_id uuid;
begin
  if not public.owns_garage(p_garage_id) then
    raise exception 'Only the owner can add employees' using errcode = '42501';
  end if;
  insert into public.profiles (phone_number, role, name)
  values (v_phone, 'garage', nullif(btrim(p_name), ''))
  on conflict (phone_number) do nothing;
  select id into v_profile from public.profiles where phone_number = v_phone;
  if v_profile = public.current_profile_id() then
    raise exception 'That is your own number' using errcode = '22023';
  end if;
  -- A pending request from this person to THIS garage is simply approved.
  update public.garage_members set status = 'active', joined_at = now(), display_name = coalesce(display_name, nullif(btrim(p_name), ''))
    where garage_id = p_garage_id and profile_id = v_profile and member_role = 'staff' and status = 'pending'
    returning id into v_id;
  if v_id is not null then return v_id; end if;
  if exists (select 1 from public.garage_members where garage_id = p_garage_id and profile_id = v_profile and member_role = 'staff' and status = 'active') then
    raise exception 'Already on your team' using errcode = '22023';
  end if;
  perform public.assert_can_become_staff(v_profile);
  insert into public.garage_members (garage_id, profile_id, member_role, status, display_name, requested_by, joined_at)
  values (p_garage_id, v_profile, 'staff', 'active', nullif(btrim(p_name), ''), 'owner', now())
  returning id into v_id;
  insert into public.profile_roles (profile_id, role) values (v_profile, 'garage') on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.remove_staff(p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_m public.garage_members;
begin
  select * into v_m from public.garage_members where id = p_member_id for update;
  if v_m.id is null or v_m.member_role <> 'staff'
     or not (public.owns_garage(v_m.garage_id) or v_m.profile_id = public.current_profile_id()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.garage_members set status = 'removed', ended_at = now()
    where id = p_member_id and status in ('active', 'pending');
end;
$$;

create or replace function public.leave_garage()
returns void language sql security definer set search_path = public as $$
  update public.garage_members set status = 'removed', ended_at = now()
  where profile_id = public.current_profile_id() and member_role = 'staff' and status in ('active', 'pending');
$$;

create or replace function public.rate_staff(p_member_id uuid, p_rating integer, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_m public.garage_members;
begin
  select * into v_m from public.garage_members where id = p_member_id;
  if v_m.id is null or v_m.member_role <> 'staff' or not public.owns_garage(v_m.garage_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_m.status not in ('active', 'removed') then
    raise exception 'Only current or former employees can be rated' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5' using errcode = '22023';
  end if;
  insert into public.staff_reviews (member_id, garage_id, staff_profile_id, rating, note, updated_at)
  values (v_m.id, v_m.garage_id, v_m.profile_id, p_rating, nullif(btrim(p_note), ''), now())
  on conflict (member_id) do update set rating = excluded.rating, note = excluded.note, updated_at = now();
end;
$$;

-- Team overview for the owner: everyone with their numbers at THIS garage.
create or replace function public.garage_team(p_garage_id uuid)
returns table (
  member_id uuid, profile_id uuid, name text, phone text, status text, requested_by text,
  joined_at timestamptz, ended_at timestamptz,
  jobs_total bigint, jobs_30d bigint, customer_avg numeric, customer_count bigint,
  owner_rating integer, owner_note text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.owns_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select m.id, m.profile_id, coalesce(m.display_name, p.name), p.phone_number, m.status, m.requested_by,
         m.joined_at, m.ended_at,
         (select count(*) from public.service_records sr where sr.garage_id = m.garage_id and sr.created_by_profile_id = m.profile_id and sr.status = 'completed'),
         (select count(*) from public.service_records sr where sr.garage_id = m.garage_id and sr.created_by_profile_id = m.profile_id and sr.status = 'completed' and sr.created_at >= now() - interval '30 days'),
         (select round(avg(r.rating)::numeric, 1) from public.service_ratings r join public.service_records sr on sr.id = r.service_record_id where sr.garage_id = m.garage_id and sr.created_by_profile_id = m.profile_id),
         (select count(*) from public.service_ratings r join public.service_records sr on sr.id = r.service_record_id where sr.garage_id = m.garage_id and sr.created_by_profile_id = m.profile_id),
         sv.rating, sv.note
  from public.garage_members m
  join public.profiles p on p.id = m.profile_id
  left join public.staff_reviews sv on sv.member_id = m.id
  where m.garage_id = p_garage_id and m.member_role = 'staff' and m.status <> 'rejected'
  order by (m.status = 'pending') desc, (m.status = 'active') desc, m.joined_at desc nulls last;
end;
$$;

-- 8. Work history (portable across garages) -----------------------------------------
-- The employee sees their own (with owners' notes). An owner sees the history
-- of someone who is asking to join / works at their garage — ratings and
-- numbers only, never other owners' notes.
create or replace function public.staff_work_history(p_profile_id uuid default null)
returns table (
  member_id uuid, garage_name text, status text, joined_at timestamptz, ended_at timestamptz,
  jobs_completed bigint, customer_avg numeric, customer_count bigint,
  owner_rating integer, owner_note text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_target uuid := coalesce(p_profile_id, public.current_profile_id());
  v_self boolean := v_target = public.current_profile_id();
begin
  if v_target is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not (v_self or public.is_admin() or exists (
      select 1 from public.garage_members m
      where m.profile_id = v_target and m.member_role = 'staff' and m.status in ('pending', 'active')
        and public.owns_garage(m.garage_id))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select m.id, g.name, m.status, m.joined_at, m.ended_at,
         (select count(*) from public.service_records sr where sr.garage_id = m.garage_id and sr.created_by_profile_id = v_target and sr.status = 'completed'),
         (select round(avg(r.rating)::numeric, 1) from public.service_ratings r join public.service_records sr on sr.id = r.service_record_id where sr.garage_id = m.garage_id and sr.created_by_profile_id = v_target),
         (select count(*) from public.service_ratings r join public.service_records sr on sr.id = r.service_record_id where sr.garage_id = m.garage_id and sr.created_by_profile_id = v_target),
         sv.rating,
         case when v_self or public.owns_garage(m.garage_id) or public.is_admin() then sv.note end
  from public.garage_members m
  join public.garages g on g.id = m.garage_id
  left join public.staff_reviews sv on sv.member_id = m.id
  where m.profile_id = v_target and m.member_role = 'staff' and m.status in ('active', 'removed')
  order by m.joined_at desc nulls last;
end;
$$;

-- 9. Customer rates a service ----------------------------------------------------------
create or replace function public.rate_service(p_service_record_id uuid, p_rating integer, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rec public.service_records;
  v_me uuid := public.current_profile_id();
begin
  select * into v_rec from public.service_records where id = p_service_record_id;
  if v_rec.id is null or not (v_rec.customer_profile_id = v_me or v_rec.customer_phone = public.current_phone_number()) then
    raise exception 'Not your service' using errcode = '42501';
  end if;
  if v_rec.status <> 'completed' then
    raise exception 'Only completed services can be rated' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5' using errcode = '22023';
  end if;
  insert into public.service_ratings (service_record_id, customer_profile_id, rating, comment)
  values (v_rec.id, v_me, p_rating, nullif(btrim(p_comment), ''))
  on conflict (service_record_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'request_to_join_garage(uuid, text)', 'cancel_join_request()',
    'create_garage_as_staff(text, text, text, text, text, text, text, numeric, numeric, text, text[], public.business_type, text)',
    'respond_to_garage_claim(uuid, boolean)', 'respond_join_request(uuid, boolean)',
    'add_staff_by_phone(uuid, text, text)', 'remove_staff(uuid)', 'leave_garage()',
    'rate_staff(uuid, integer, text)', 'garage_team(uuid)', 'staff_work_history(uuid)',
    'rate_service(uuid, integer, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 10. Service write path: staff may operate, attribution recorded ----------------------
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
  v_me uuid := public.current_profile_id();
  v_by_name text;
begin
  if not (public.can_operate_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized for this garage' using errcode = '42501';
  end if;

  select name, is_offboarded, owner_declined_at into v_garage from public.garages where id = p_garage_id;
  if v_garage.name is null then
    raise exception 'Garage not found' using errcode = 'P0002';
  end if;
  if v_garage.is_offboarded or v_garage.owner_declined_at is not null then
    raise exception 'This garage has been off-boarded' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Amount must be between 1 and 10,00,000' using errcode = '22023';
  end if;

  if public.app_flag('fee_settlement_enabled')
     and (select s.locked from public.garage_settlement_status_internal(p_garage_id) s) then
    raise exception 'Platform fees are pending. The garage owner needs to settle them before new services can be added.'
      using errcode = 'P0001';
  end if;

  v_phone := public.normalize_indian_phone(p_customer_phone);

  insert into public.profiles (phone_number, role)
  values (v_phone, 'customer')
  on conflict (phone_number) do nothing;

  select id into v_customer_profile_id
  from public.profiles
  where phone_number = v_phone
  limit 1;

  -- Who did the work, as the customer will see it ("Serviced by Ravi").
  select coalesce(m.display_name, p.name) into v_by_name
  from public.profiles p
  left join public.garage_members m
    on m.profile_id = p.id and m.garage_id = p_garage_id and m.member_role = 'staff' and m.status = 'active'
  where p.id = v_me;

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
    invoice_delivery_channel, invoice_notification_status, created_by_profile_id, performed_by_name
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
    'not_required',
    v_me,
    v_by_name
  )
  returning id into v_record_id;

  insert into public.service_record_services (service_record_id, service_category_code)
  select v_record_id, c from unnest(v_service_codes) as c;

  insert into public.service_record_failures (service_record_id, failure_category_code)
  select v_record_id, c from unnest(v_failure_codes) as c;

  return query select v_record_id, v_phone, 'pending_otp'::public.service_record_status;
end;
$$;

-- garage_settlement_status() is owner-only by design; staff must still hit the
-- lock, so the create path reads the status through this internal twin.
create or replace function public.garage_settlement_status_internal(p_garage_id uuid)
returns table (outstanding numeric, due_now numeric, locked boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today_start timestamptz := (date_trunc('day', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata');
  v_accrued_before numeric;
  v_reductions numeric;
  v_outstanding numeric;
  v_due numeric;
begin
  select coalesce(sum(amount), 0) into v_outstanding from public.garage_ledger where garage_id = p_garage_id;
  select coalesce(sum(amount), 0) into v_accrued_before from public.garage_ledger
    where garage_id = p_garage_id and entry_type in ('fee_accrued', 'chargeback') and created_at < v_today_start;
  select coalesce(sum(amount), 0) into v_reductions from public.garage_ledger
    where garage_id = p_garage_id and entry_type in ('settlement', 'recovery', 'adjustment');
  v_due := greatest(0, v_accrued_before + v_reductions);
  return query select v_outstanding, v_due, (v_due > 0);
end;
$$;
revoke all on function public.garage_settlement_status_internal(uuid) from public, anon, authenticated;

-- OTP verify + payment completion: owner/admin any record, staff only their own.
create or replace function public.verify_service_otp(
  p_service_record_id uuid,
  p_otp_hash_candidate text
)
returns table (
  ok boolean,
  reason text,
  remaining_attempts integer,
  status public.service_record_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otp record;
begin
  if not exists (select 1 from public.service_records where id = p_service_record_id) then
    raise exception 'Service record not found' using errcode = 'P0002';
  end if;
  if not public.can_operate_service(p_service_record_id) then
    raise exception 'Not authorized for this service record' using errcode = '42501';
  end if;

  select * into v_otp
  from public.service_otps
  where service_record_id = p_service_record_id and consumed = false and verified_at is null
  order by created_at desc
  limit 1
  for update;

  if v_otp.id is null then
    raise exception 'No pending OTP for this service record' using errcode = 'P0002';
  end if;

  if v_otp.expires_at < now() then
    update public.service_otps set consumed = true where id = v_otp.id;
    return query select false, 'expired', 0, 'pending_otp'::public.service_record_status;
    return;
  end if;

  if v_otp.attempt_count >= v_otp.max_attempts then
    update public.service_otps set consumed = true where id = v_otp.id;
    return query select false, 'locked', 0, 'pending_otp'::public.service_record_status;
    return;
  end if;

  if v_otp.otp_hash <> p_otp_hash_candidate then
    update public.service_otps set attempt_count = attempt_count + 1 where id = v_otp.id;
    return query
      select false, 'invalid', greatest(v_otp.max_attempts - (v_otp.attempt_count + 1), 0),
             'pending_otp'::public.service_record_status;
    return;
  end if;

  update public.service_otps set verified_at = now(), consumed = true where id = v_otp.id;
  update public.service_records set status = 'otp_verified', approved_by_customer = true
    where id = p_service_record_id;

  return query select true, 'verified', 0, 'otp_verified'::public.service_record_status;
end;
$$;

create or replace function public.complete_service_payment(
  p_service_record_id uuid,
  p_payment_method text
)
returns table (
  invoice_number text,
  status public.service_record_status,
  customer_pays numeric,
  platform_fee numeric,
  garage_receives numeric,
  verified boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform_fee constant numeric := 3.90;
  v_record record;
  v_garage_short text;
  v_invoice text;
  v_channel public.invoice_delivery_channel;
begin
  if p_payment_method is not null and p_payment_method not in ('qr', 'cash') then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;

  select * into v_record from public.service_records where id = p_service_record_id for update;
  if v_record.id is null then
    raise exception 'Service record not found' using errcode = 'P0002';
  end if;
  if not public.can_operate_service(p_service_record_id) then
    raise exception 'Not authorized for this service record' using errcode = '42501';
  end if;
  if v_record.status <> 'otp_verified' then
    raise exception 'Customer OTP must be verified before payment' using errcode = '22023';
  end if;

  v_channel := case
    when v_record.verification_method = 'in_app' then 'push'::public.invoice_delivery_channel
    else 'whatsapp'::public.invoice_delivery_channel
  end;

  v_garage_short := upper(substr(replace(v_record.garage_id::text, '-', ''), 1, 4));
  v_invoice := 'KYM-' || to_char(now(), 'YYYYMMDD') || '-' || v_garage_short || '-'
    || lpad(nextval('public.invoice_seq')::text, 6, '0');

  update public.service_records
    set status = 'completed',
        payment_method = 'qr'::public.payment_method,
        platform_fee = v_platform_fee,
        garage_earnings = v_record.amount,
        is_reliable = true,
        invoice_number = v_invoice,
        invoice_delivery_channel = v_channel,
        invoice_notification_status = 'pending'
    where id = p_service_record_id;

  insert into public.payments (
    service_record_id, customer_profile_id, garage_id, amount, platform_fee, method, provider, status
  ) values (
    p_service_record_id, v_record.customer_profile_id, v_record.garage_id,
    v_record.amount, v_platform_fee, 'qr'::public.payment_method, 'upi', 'completed'
  );

  insert into public.garage_ledger (garage_id, entry_type, amount, service_record_id, note)
  values (v_record.garage_id, 'fee_accrued', v_platform_fee, p_service_record_id,
          'Platform fee on invoice ' || v_invoice);

  return query select v_invoice, 'completed'::public.service_record_status,
    v_record.amount + v_platform_fee, v_platform_fee, v_record.amount, true;
end;
$$;

revoke all on function public.complete_service_payment(uuid, text) from public;
grant execute on function public.complete_service_payment(uuid, text) to authenticated;
revoke all on function public.verify_service_otp(uuid, text) from public;
grant execute on function public.verify_service_otp(uuid, text) to authenticated;

-- 11. Public counts: only listed (confirmed) garages ---------------------------------
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
    and g.is_verified and not g.is_offboarded and g.owner_confirmed_at is not null
  group by sr.garage_id;
$$;

-- 12. Referral codes can be applied by whoever is setting the garage up.
create or replace function public.apply_garage_referral(p_garage_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp record;
begin
  if not (public.can_manage_garage(p_garage_id) or public.is_admin()) then
    raise exception 'Not authorized for this garage' using errcode = '42501';
  end if;
  select id, name into v_emp from public.employees
  where upper(referral_code) = upper(btrim(p_code)) and is_active
  limit 1;
  if v_emp.id is null then
    raise exception 'Invalid referral code' using errcode = 'P0002';
  end if;
  update public.garages
    set assigned_employee_id = v_emp.id
    where id = p_garage_id and assigned_employee_id is null;
  return v_emp.name;
end;
$$;
