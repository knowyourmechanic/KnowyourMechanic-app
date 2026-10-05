import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { normalizeIndianPhone } from "../_shared/smsProvider.ts";
import { json, readAuthedJson, requireEnv } from "../_shared/http.ts";
import { devOtpAllowed, issueServiceOtp } from "../_shared/serviceOtp.ts";

type CreateBody = {
  garageId?: string;
  customerPhone?: string;
  vehicleType?: string;
  vehicleMakeCode?: string | null;
  vehicleModelCode?: string | null;
  vehicleMakeOther?: string | null;
  vehicleModelOther?: string | null;
  vehicleNumber?: string | null;
  modelYear?: number | null;
  odometerKm?: number | null;
  serviceCategoryCodes?: string[];
  failureCategoryCodes?: string[];
  serviceNotes?: string | null;
  amount?: number;
  customerHasApp?: boolean;
};

Deno.serve(async (req) => {
  const pre = await readAuthedJson<CreateBody>(req);
  if (pre instanceof Response) return pre;
  const { body, authHeader } = pre;

  if (
    !body.garageId || !body.customerPhone || !body.vehicleType ||
    typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0
  ) {
    return json(400, { error: "Missing required fields." });
  }

  let nationalPhone: string;
  try {
    nationalPhone = normalizeIndianPhone(body.customerPhone);
  } catch {
    return json(400, { error: "Invalid customer phone." });
  }

  let supabaseUrl: string, anonKey: string, serviceRoleKey: string, pepper: string;
  try {
    supabaseUrl = requireEnv("SUPABASE_URL");
    anonKey = requireEnv("SUPABASE_ANON_KEY");
    serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    pepper = requireEnv("SERVICE_OTP_PEPPER");
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Server not configured." });
  }

  // Caller-scoped client: the RPC runs SECURITY DEFINER but still checks
  // owns_garage() against this caller's auth.uid().
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });

  const { data: created, error: rpcError } = await callerClient
    .rpc("create_service_record_with_taxonomy", {
      p_garage_id: body.garageId,
      p_customer_phone: body.customerPhone,
      p_vehicle_type: body.vehicleType,
      p_vehicle_make_code: body.vehicleMakeCode ?? null,
      p_vehicle_model_code: body.vehicleModelCode ?? null,
      p_vehicle_make_other: body.vehicleMakeOther ?? null,
      p_vehicle_model_other: body.vehicleModelOther ?? null,
      p_vehicle_number: body.vehicleNumber ?? null,
      p_model_year: body.modelYear ?? null,
      p_odometer_km: body.odometerKm ?? null,
      p_service_codes: body.serviceCategoryCodes ?? [],
      p_failure_codes: body.failureCategoryCodes ?? [],
      p_service_notes: body.serviceNotes ?? null,
      p_amount: body.amount,
      p_customer_has_app: body.customerHasApp ?? false
    })
    .single();

  if (rpcError || !created) {
    const message = rpcError?.message ?? "Failed to create service record.";
    // 42501 = insufficient privilege (ownership check failed).
    const status = rpcError?.code === "42501" ? 403 : 400;
    return json(status, { error: message });
  }

  const serviceRecordId = (created as { service_record_id: string }).service_record_id;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let issued;
  try {
    // Delivery failures never block record creation (the garage can resend).
    issued = await issueServiceOtp(admin, { serviceRecordId, nationalPhone, pepper });
  } catch {
    return json(500, { serviceRecordId, error: "Service record created but OTP could not be stored." });
  }

  return json(200, {
    serviceRecordId,
    status: "pending_otp",
    otpExpiresAt: issued.expiresAt,
    otpDelivery: issued.channel,
    otpDeliveryError: issued.deliveryError,
    ...(devOtpAllowed(nationalPhone) ? { devOtp: issued.otp } : {})
  });
});
