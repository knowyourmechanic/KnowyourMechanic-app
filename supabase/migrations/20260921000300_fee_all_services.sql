-- Remove the cash / "not trusted" distinction entirely (2026-09-21).
--
-- WHY: the garage collects directly and just taps "Received" — KYM has no way to
-- know whether the customer actually paid by UPI or cash. So a "cash = not
-- trusted, fee-free" mode is both unenforceable and a fee loophole. Every
-- completed service now carries the flat ₹3.90 platform fee and is recorded as
-- reliable/verified, whatever value the (now vestigial) method arg holds.
-- Idempotent.
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
  v_platform_fee constant numeric := 3.90;  -- flat fee owed to KYM per service
  v_record record;
  v_garage_short text;
  v_invoice text;
  v_channel public.invoice_delivery_channel;
begin
  -- Method is accepted for backward compatibility but no longer changes anything.
  if p_payment_method is not null and p_payment_method not in ('qr', 'cash') then
    raise exception 'Invalid payment method' using errcode = '22023';
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

  v_channel := case
    when v_record.verification_method = 'in_app' then 'push'::public.invoice_delivery_channel
    else 'whatsapp'::public.invoice_delivery_channel
  end;

  v_garage_short := upper(substr(replace(v_record.garage_id::text, '-', ''), 1, 4));
  v_invoice := 'KYM-' || to_char(now(), 'YYYYMMDD') || '-' || v_garage_short || '-'
    || lpad(nextval('public.invoice_seq')::text, 6, '0');

  update public.service_records
    set status = 'completed',
        payment_method = 'qr'::public.payment_method,  -- single settled method
        platform_fee = v_platform_fee,
        garage_earnings = v_record.amount,             -- garage keeps the service amount
        is_reliable = true,                            -- OTP-confirmed => always trusted
        invoice_number = v_invoice,
        invoice_delivery_channel = v_channel,
        invoice_notification_status = 'pending'
    where id = p_service_record_id;

  insert into public.payments (
    service_record_id, customer_profile_id, garage_id, amount, platform_fee,
    method, provider, status
  ) values (
    p_service_record_id, v_record.customer_profile_id, v_record.garage_id,
    v_record.amount, v_platform_fee, 'qr'::public.payment_method, 'upi', 'completed'
  );

  -- Always accrue the fee the garage owes KYM. The state machine (otp_verified
  -- -> completed) guarantees this runs at most once per record.
  insert into public.garage_ledger (garage_id, entry_type, amount, service_record_id, note)
  values (
    v_record.garage_id, 'fee_accrued', v_platform_fee, p_service_record_id,
    'Platform fee on invoice ' || v_invoice
  );

  return query select
    v_invoice,
    'completed'::public.service_record_status,
    v_record.amount + v_platform_fee,   -- what the customer pays
    v_platform_fee,
    v_record.amount,                    -- garage's net earnings (fee owed separately)
    true;
end;
$$;

revoke all on function public.complete_service_payment(uuid, text) from public;
grant execute on function public.complete_service_payment(uuid, text) to authenticated;
