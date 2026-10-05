import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, readAuthedJson, requireEnv } from "../_shared/http.ts";

import { hashServiceOtp } from "../_shared/otpHash.ts";

type VerifyBody = {
  serviceRecordId?: string;
  otp?: string;
};

const REASON_MESSAGE: Record<string, string> = {
  invalid: "Incorrect OTP.",
  expired: "OTP has expired. Ask the garage to resend.",
  locked: "Too many incorrect attempts. Ask the garage to resend."
};

Deno.serve(async (req) => {
  const pre = await readAuthedJson<VerifyBody>(req);
  if (pre instanceof Response) return pre;
  const { body, authHeader } = pre;

  const otp = (body.otp ?? "").trim();
  if (!body.serviceRecordId || !/^\d{4,8}$/.test(otp)) {
    return json(400, { error: "Missing service record id or OTP." });
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = requireEnv("SERVICE_OTP_PEPPER");

  // Read the per-row salt with the service role (the table has no client access).
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: otpRow, error: otpReadError } = await admin
    .from("service_otps")
    .select("otp_salt")
    .eq("service_record_id", body.serviceRecordId)
    .eq("consumed", false)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpReadError) {
    return json(500, { error: "Could not read OTP state." });
  }
  if (!otpRow) {
    return json(400, { error: "No pending OTP for this service record." });
  }

  const candidate = await hashServiceOtp(otp, (otpRow as { otp_salt: string }).otp_salt, pepper);

  // Ownership check, atomic compare, attempt counting, and the state transition
  // all happen inside the RPC (run with the caller's identity).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });

  const { data: result, error: rpcError } = await callerClient
    .rpc("verify_service_otp", {
      p_service_record_id: body.serviceRecordId,
      p_otp_hash_candidate: candidate
    })
    .single();

  if (rpcError || !result) {
    const status = rpcError?.code === "42501" ? 403 : 400;
    return json(status, { error: rpcError?.message ?? "OTP verification failed." });
  }

  const row = result as {
    ok: boolean;
    reason: string;
    remaining_attempts: number;
    status: string;
  };

  if (!row.ok) {
    return json(400, {
      ok: false,
      error: REASON_MESSAGE[row.reason] ?? "OTP verification failed.",
      reason: row.reason,
      remainingAttempts: row.remaining_attempts
    });
  }

  return json(200, { ok: true, status: row.status });
});
