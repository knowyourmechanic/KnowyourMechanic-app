import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { normalizeIndianPhone } from "../_shared/smsProvider.ts";
import { json, readAuthedJson, requireEnv } from "../_shared/http.ts";
import { devOtpAllowed, issueServiceOtp } from "../_shared/serviceOtp.ts";

// Re-issues the customer OTP for a service record still awaiting it (the code
// expired, was locked after wrong attempts, or never arrived). Without this an
// expired OTP left the record stuck in pending_otp forever.
//
// Limits: at most MAX_RESENDS per record, and RESEND_COOLDOWN_S between sends,
// so a garage can't spam a customer's phone.

const MAX_RESENDS = 3;
const RESEND_COOLDOWN_S = 30;

Deno.serve(async (req) => {
  const pre = await readAuthedJson<{ serviceRecordId?: string }>(req);
  if (pre instanceof Response) return pre;
  const { body, authHeader } = pre;
  if (!body.serviceRecordId) return json(400, { error: "Missing service record id." });

  let supabaseUrl: string, anonKey: string, serviceRoleKey: string, pepper: string;
  try {
    supabaseUrl = requireEnv("SUPABASE_URL");
    anonKey = requireEnv("SUPABASE_ANON_KEY");
    serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    pepper = requireEnv("SERVICE_OTP_PEPPER");
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Server not configured." });
  }

  // Authorization: RLS must let the caller read the record, and
  // can_operate_service() must allow acting on it (customers can read their own
  // records but never operate them).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: owns } = await callerClient
    .from("service_records")
    .select("id, garage_id, customer_phone, status")
    .eq("id", body.serviceRecordId)
    .maybeSingle();
  if (!owns) return json(403, { error: "Not authorized for this service record." });
  // Owner: any record of the garage. Garage staff: only records they logged.
  const { data: canOperate } = await callerClient.rpc("can_operate_service", { p_service_record_id: owns.id });
  if (!canOperate) return json(403, { error: "Not authorized for this service record." });
  if (owns.status !== "pending_otp") {
    return json(400, { error: "This service is already verified." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: prior } = await admin
    .from("service_otps")
    .select("id, created_at, resend_count")
    .eq("service_record_id", body.serviceRecordId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resends = (prior?.resend_count ?? 0) + (prior ? 1 : 0);
  if (prior && resends > MAX_RESENDS) {
    return json(429, { error: "OTP resend limit reached. Create a new service entry." });
  }
  if (prior) {
    const wait = RESEND_COOLDOWN_S - Math.floor((Date.now() - new Date(prior.created_at).getTime()) / 1000);
    if (wait > 0) return json(429, { error: `Please wait ${wait}s before resending.`, retryAfter: wait });
  }

  // Retire every outstanding code so only the new one verifies.
  await admin
    .from("service_otps")
    .update({ consumed: true })
    .eq("service_record_id", body.serviceRecordId)
    .eq("consumed", false);

  let nationalPhone: string;
  try {
    nationalPhone = normalizeIndianPhone(owns.customer_phone);
  } catch {
    return json(400, { error: "Invalid customer phone on record." });
  }

  let issued;
  try {
    issued = await issueServiceOtp(admin, {
      serviceRecordId: body.serviceRecordId,
      nationalPhone,
      pepper,
      resendCount: resends,
    });
  } catch {
    return json(500, { error: "OTP could not be stored." });
  }

  return json(200, {
    ok: true,
    otpExpiresAt: issued.expiresAt,
    otpDelivery: issued.channel,
    otpDeliveryError: issued.deliveryError,
    resendsLeft: Math.max(0, MAX_RESENDS - resends),
    ...(devOtpAllowed(nationalPhone) ? { devOtp: issued.otp } : {}),
  });
});
