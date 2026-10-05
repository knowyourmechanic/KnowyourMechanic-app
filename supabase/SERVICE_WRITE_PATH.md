# Service record write path (Step 1)

Replaces the local prototype `createGarageServiceRecord` with a real,
transactional Supabase write plus server-side OTP delivery.

## Pieces

- **Migration** `migrations/20260630000100_service_write_path.sql`
  - `service_otps` table — hashed, salted, single-use, expiring OTPs. No client
    RLS policies; only the service-role Edge Function touches it.
  - `create_service_record_with_taxonomy(...)` — `SECURITY DEFINER` RPC. Checks
    `owns_garage()` against the caller, requires ≥1 service and ≥1 failure,
    validates codes, normalizes phone, and inserts the record + both join tables
    in one transaction. Returns only the new `service_record_id` (never the OTP).
  - Owner-scoped insert/update policies on `service_record_services` /
    `service_record_failures` (defense in depth).
  - `normalize_indian_phone(text)` helper.
- **Edge Function** `functions/service-record-create/`
  - Verifies the caller JWT, calls the RPC with the caller's identity (so the
    ownership check runs), then — using the service role — generates a 6-digit
    OTP, stores `SHA-256(pepper:salt:otp)`, and sends it via MSG91.
  - Returns `{ serviceRecordId, status, otpExpiresAt, otpDelivery }`. Includes
    `devOtp` only when `ALLOW_DEV_OTP=true`.
- **Shared provider** `functions/_shared/smsProvider.ts` — the only place that
  talks to MSG91, so Fast2SMS (or another provider) can be swapped here alone.
- **Mobile client** `mobile/src/garage/serviceRecordApi.ts` —
  `createServiceRecordViaSupabase(garageId, input)` wraps the Edge Function.
  Not yet wired into `GarageWorkspace`; the local prototype flow is unchanged.

## Why OTP generation is not in the RPC

If the RPC returned the OTP, any garage-authenticated client could read it and
approve on the customer's behalf. Keeping OTP creation/delivery in the
service-role Edge Function means the garage app only learns that an OTP was
sent, never its value (outside dev).

## Secrets (Edge Function only — never in the mobile app)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (injected)
- `SERVICE_OTP_PEPPER` — random server secret used in the OTP hash
- `MSG91_AUTH_KEY` — MSG91 account auth key (secret)
- `MSG91_SERVICE_OTP_TEMPLATE_ID` — MSG91 OTP template id (contains `##OTP##`)
- `ALLOW_DEV_OTP` — `"true"` only in dev/staging (returns the OTP in the response
  and lets the flow be tested before DLT/SMS delivery is live)

## OTP verify (Step 3)

- **Migration** `migrations/20260630000200_service_otp_verify.sql` — `verify_service_otp(record_id, otp_hash_candidate)` `SECURITY DEFINER` RPC.
  Checks ownership, loads the active OTP `for update`, enforces expiry and
  `attempt_count < max_attempts`, compares the candidate hash, and on success
  consumes the OTP + sets the record to `otp_verified` / `approved_by_customer`.
  A wrong OTP is **returned** (`ok=false`), not raised, so the attempt increment
  persists; the row is consumed on expiry or attempt-limit.
- **Edge Function** `functions/service-otp-verify/` — reads the per-row salt
  (service role), computes `SHA-256(pepper:salt:otp)`, and calls the RPC with the
  caller's identity. Returns `{ ok, status }` or `{ ok:false, reason, remainingAttempts }`.
- **Mobile** `verifyServiceOtpViaSupabase(recordId, otp)` in `serviceRecordApi.ts`.
- OTP hashing is shared in `functions/_shared/otpHash.ts` (used by create + verify).

## Payment completion (Step 4)

- **Migration** `migrations/20260630000250_payment_method_qr.sql` — adds `qr` to
  the `payment_method` enum (verified UPI, distinct from legacy `razorpay`).
- **Migration** `migrations/20260630000300_payment_completion.sql` —
  `invoice_seq` sequence + `complete_service_payment(record_id, method)` RPC
  (`SECURITY DEFINER`). Ownership check, requires `otp_verified`, then:
  QR → verified, `platform_fee = 1.90`, `is_reliable = true`; cash → unverified,
  no fee. Writes a strong invoice code `KYM-YYYYMMDD-<garage short>-<seq>`
  (unique via the global sequence + the existing `invoice_number` unique
  constraint), inserts a `payments` ledger row, and sets the record to
  `completed` with `invoice_notification_status = 'pending'`.
- **Mobile** `completeServicePaymentViaSupabase(recordId, method)` — a direct
  `supabase.rpc` call (no Edge Function; no provider call at this step).

## Not done yet

- Wire `GarageWorkspace` to call the Edge Functions / RPCs when Supabase is configured.
- Apply the migrations to a real Supabase DB and regenerate `src/lib/database.types.ts` (`npm run gen:types`)
  (until then, the mobile payment wrapper calls the RPC through a narrow shim).
- OTP **resend** endpoint (`resend_count` column already present).
- Invoice/report delivery: push + WhatsApp dispatch of the `pending` notification (Step 5).
