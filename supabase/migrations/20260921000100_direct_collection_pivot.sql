-- Direct-collection pivot (2026-09-21).
--
-- WHY: With the govt UPI MDR (0.4% on > ₹2,000) the "KYM collects from the
-- customer, holds float, pays the garage" model no longer makes sense. New model:
--   * The customer pays the GARAGE DIRECTLY on the garage's own static UPI QR
--     (amount = service + ₹3.90 platform fee). KYM never touches this money.
--   * The garage taps "Received"; the ₹3.90 fee is ACCRUED to the garage ledger
--     as an amount the garage owes KYM.
--   * At end of day the garage settles the accrued fees to KYM via Razorpay
--     (built later, when the Razorpay keys are in — enforced server-side).
--
-- This migration removes the old middleman machinery and reshapes fee handling.
-- Idempotent; safe to run more than once.

-- 1. Drop the garage payout ledger — KYM no longer pays garages -------------
drop table if exists public.garage_payouts cascade;

-- 2. garage_payout_details: strip bank/beneficiary/razorpay/UPI-VPA columns,
--    keep only the garage's uploaded static payment QR. (Table + its owner/admin
--    RLS are retained and simply repurposed.)
alter table public.garage_payout_details
  drop constraint if exists garage_payout_details_beneficiary_status_chk;

alter table public.garage_payout_details
  drop column if exists bank_account_number,
  drop column if exists bank_ifsc_code,
  drop column if exists bank_account_holder_name,
  drop column if exists bank_name,
  drop column if exists razorpay_account_id,
  drop column if exists beneficiary_id,
  drop column if exists beneficiary_status,
  drop column if exists beneficiary_registered_at,
  drop column if exists upi_vpa;

-- The garage's uploaded static UPI QR image (path in the 'garage-qr' bucket).
alter table public.garage_payout_details
  add column if not exists qr_image_path text;

-- 3. Storage bucket for the QR images --------------------------------------
-- Public read (a UPI QR is meant to be scanned; nothing secret). Writes are
-- restricted to the owning garage by path: '<garage_id>/qr'.
insert into storage.buckets (id, name, public)
values ('garage-qr', 'garage-qr', true)
on conflict (id) do nothing;

drop policy if exists "garage qr owner insert" on storage.objects;
create policy "garage qr owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'garage-qr'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "garage qr owner update" on storage.objects;
create policy "garage qr owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'garage-qr'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'garage-qr'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "garage qr owner delete" on storage.objects;
create policy "garage qr owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'garage-qr'
    and public.owns_garage(((storage.foldername(name))[1])::uuid)
  );

-- 4. Reshape payment completion to the direct-collection model --------------
-- QR  : customer paid the garage directly (amount + ₹3.90). Trusted. The ₹3.90
--       fee is accrued to garage_ledger as owed to KYM. Garage keeps the amount.
-- Cash: fee-free, Not Trusted — like real cash (unchanged).
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
  v_platform_fee constant numeric := 3.90;  -- fee the garage owes KYM per digital service
  v_record record;
  v_is_qr boolean;
  v_fee numeric;
  v_garage_short text;
  v_invoice text;
  v_channel public.invoice_delivery_channel;
  v_method public.payment_method;
begin
  if p_payment_method not in ('qr', 'cash') then
    raise exception 'Payment method must be qr or cash' using errcode = '22023';
  end if;

  select * into v_record
  from public.service_records
  where id = p_service_record_id
  for update;

  if v_record.id is null then
    raise exception 'Service record not found' using errcode = 'P0002';
  end if;

  if not (public.owns_garage(v_record.garage_id) or public.is_admin()) then
    raise exception 'Not authorized for this service record' using errcode = '42501';
  end if;

  if v_record.status <> 'otp_verified' then
    raise exception 'Customer OTP must be verified before payment' using errcode = '22023';
  end if;

  v_is_qr := p_payment_method = 'qr';
  v_fee := case when v_is_qr then v_platform_fee else 0 end;
  v_method := p_payment_method::public.payment_method;
  v_channel := case
    when v_record.verification_method = 'in_app' then 'push'::public.invoice_delivery_channel
    else 'whatsapp'::public.invoice_delivery_channel
  end;

  -- KYM-YYYYMMDD-<garage short>-<zero-padded global sequence>
  v_garage_short := upper(substr(replace(v_record.garage_id::text, '-', ''), 1, 4));
  v_invoice := 'KYM-' || to_char(now(), 'YYYYMMDD') || '-' || v_garage_short || '-'
    || lpad(nextval('public.invoice_seq')::text, 6, '0');

  update public.service_records
    set status = 'completed',
        payment_method = v_method,
        platform_fee = v_fee,
        garage_earnings = v_record.amount,   -- garage keeps the service amount
        is_reliable = v_is_qr,
        invoice_number = v_invoice,
        invoice_delivery_channel = v_channel,
        invoice_notification_status = 'pending'
    where id = p_service_record_id;

  insert into public.payments (
    service_record_id, customer_profile_id, garage_id, amount, platform_fee,
    method, provider, status
  ) values (
    p_service_record_id, v_record.customer_profile_id, v_record.garage_id,
    v_record.amount, v_fee, v_method,
    case when v_is_qr then 'upi' else 'cash' end, 'completed'
  );

  -- Accrue the platform fee the garage now owes KYM (digital only). The state
  -- machine guarantees this runs at most once per record (otp_verified ->
  -- completed), so it can never double-accrue.
  if v_is_qr and v_fee > 0 then
    insert into public.garage_ledger (garage_id, entry_type, amount, service_record_id, note)
    values (
      v_record.garage_id, 'fee_accrued', v_fee, p_service_record_id,
      'Platform fee on invoice ' || v_invoice
    );
  end if;

  return query select
    v_invoice,
    'completed'::public.service_record_status,
    v_record.amount + v_fee,   -- what the customer pays on the QR
    v_fee,
    v_record.amount,           -- garage's net earnings (fee owed separately)
    v_is_qr;
end;
$$;

revoke all on function public.complete_service_payment(uuid, text) from public;
grant execute on function public.complete_service_payment(uuid, text) to authenticated;
