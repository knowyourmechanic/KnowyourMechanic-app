// Issues a service OTP: generate, persist (hashed) and THEN deliver, so a code
// the customer receives is always one the server can verify. Used by
// service-record-create and service-otp-resend.

import { routeDelivery } from "./deliver.ts";
import { generateOtp, hashServiceOtp, randomOtpSalt } from "./otpHash.ts";

export const OTP_TTL_MINUTES = 10;

export type IssueOtpParams = {
  serviceRecordId: string;
  nationalPhone: string;
  pepper: string;
  resendCount?: number;
};

export type IssueOtpResult = {
  otp: string;
  expiresAt: string;
  channel: string;
  deliveryError: string | null;
};

// `admin` is a service-role client.
export async function issueServiceOtp(admin: any, p: IssueOtpParams): Promise<IssueOtpResult> {
  const otp = generateOtp();
  const salt = randomOtpSalt();
  const otpHash = await hashServiceOtp(otp, salt, p.pepper);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: otpRow, error: otpError } = await admin
    .from("service_otps")
    .insert({
      service_record_id: p.serviceRecordId,
      phone: p.nationalPhone,
      otp_hash: otpHash,
      otp_salt: salt,
      expires_at: expiresAt,
      resend_count: p.resendCount ?? 0,
    })
    .select("id")
    .single();
  if (otpError || !otpRow) throw new Error("OTP could not be stored.");

  const { data: rec } = await admin
    .from("service_records")
    .select("customer_profile_id, garage_name, vehicle_number, service_notes, description, amount")
    .eq("id", p.serviceRecordId)
    .single();
  const r = (rec ?? {}) as {
    customer_profile_id?: string | null;
    garage_name?: string | null;
    vehicle_number?: string | null;
    service_notes?: string | null;
    description?: string | null;
    amount?: number;
  };

  // Customer verifies the service details, THEN shares the code with the garage.
  const vehicle = r.vehicle_number ? r.vehicle_number.toUpperCase() : "your vehicle";
  const service = (r.service_notes && r.service_notes.trim()) || r.description || "service";
  const amountStr = String(r.amount ?? "");
  const garageName = r.garage_name ?? "The garage";

  let channel = "none";
  let deliveryId: string | null = null;
  let deliveryError: string | null = null;
  try {
    const routed = await routeDelivery(admin, {
      serviceRecordId: p.serviceRecordId,
      recipientProfileId: r.customer_profile_id ?? null,
      recipientPhone: p.nationalPhone,
      kind: "otp",
      title: "Confirm your service",
      body: `${garageName}: ${service} on ${vehicle} for Rs ${amountStr}. If correct, share OTP ${otp} with the garage. Don't share if you didn't get this service.`,
      data: { otp, vehicle, service, amount: amountStr, garage: garageName },
    });
    channel = routed.channel;
    deliveryId = routed.deliveryId;
    // routeDelivery reports provider failures in-object rather than throwing.
    deliveryError = routed.error ?? null;
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : "OTP delivery failed.";
  }

  await admin
    .from("service_otps")
    .update({ sent_provider: channel, provider_message_id: deliveryId })
    .eq("id", otpRow.id);

  return { otp, expiresAt, channel, deliveryError };
}

// The dev OTP is ONLY ever returned for explicitly allow-listed test numbers,
// and only when ALLOW_DEV_OTP is on — a real customer's OTP can never leak back
// to the garage even if the flag is left enabled.
export function devOtpAllowed(nationalPhone: string): boolean {
  const testPhones = (Deno.env.get("TEST_OTP_PHONES") ?? "")
    .split(",")
    .map((s) => s.replace(/\D/g, "").slice(-10))
    .filter((s) => s.length === 10);
  return Deno.env.get("ALLOW_DEV_OTP") === "true" && testPhones.includes(nationalPhone);
}
