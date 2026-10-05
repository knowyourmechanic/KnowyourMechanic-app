import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, readAuthedJson, requireEnv } from "../_shared/http.ts";

import { normalizeIndianPhone } from "../_shared/smsProvider.ts";
import { routeDelivery } from "../_shared/deliver.ts";

// Sends the invoice to the customer after payment completes: push if they have
// the app, else WhatsApp (or the re-engagement copy if they lapsed). Called by
// the garage app right after complete_service_payment succeeds. Idempotent — a
// record whose invoice_notification_status is no longer 'pending' is left alone.

type NotifyBody = { serviceRecordId?: string };

Deno.serve(async (req) => {
  const pre = await readAuthedJson<NotifyBody>(req);
  if (pre instanceof Response) return pre;
  const { body, authHeader } = pre;
  if (!body.serviceRecordId) {
    return json(400, { error: "Missing service record id." });
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Authorize via RLS: only the owning garage (or an admin) can read the record.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });

  const { data: rec, error: readError } = await callerClient
    .from("service_records")
    .select(
      "customer_profile_id, customer_phone, garage_name, invoice_number, amount, " +
        "vehicle_number, service_notes, description, status, invoice_notification_status"
    )
    .eq("id", body.serviceRecordId)
    .maybeSingle();

  if (readError) {
    return json(500, { error: "Could not read service record." });
  }
  if (!rec) {
    // RLS hid it (not owner/admin) or it doesn't exist.
    return json(403, { error: "Not authorized for this service record." });
  }

  const record = rec as unknown as {
    customer_profile_id: string | null;
    customer_phone: string;
    garage_name: string | null;
    invoice_number: string | null;
    amount: number;
    vehicle_number: string | null;
    service_notes: string | null;
    description: string | null;
    status: string;
    invoice_notification_status: string;
  };

  if (record.status !== "completed") {
    return json(400, { error: "Invoice is only sent after payment is completed." });
  }
  // Idempotent: already sent / failed / not required -> don't send again.
  if (record.invoice_notification_status !== "pending") {
    return json(200, { ok: true, alreadyHandled: true, status: record.invoice_notification_status });
  }

  let nationalPhone: string;
  try {
    nationalPhone = normalizeIndianPhone(record.customer_phone);
  } catch {
    return json(400, { error: "Invalid customer phone on record." });
  }

  const vehicle = record.vehicle_number ? record.vehicle_number.toUpperCase() : "your vehicle";
  const service = (record.service_notes && record.service_notes.trim()) || record.description || "your service";
  const amountStr = String(record.amount);
  const invoiceNo = record.invoice_number ?? "";
  const garageName = record.garage_name ?? "The garage";

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Claim the send atomically (pending -> sent) so two concurrent calls can't
  // both deliver; on failure the status is rewritten to 'failed' below.
  const { data: claimed } = await admin
    .from("service_records")
    .update({ invoice_notification_status: "sent", updated_at: new Date().toISOString() })
    .eq("id", body.serviceRecordId)
    .eq("invoice_notification_status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) {
    return json(200, { ok: true, alreadyHandled: true });
  }

  let channel = "none";
  let deliveryId: string | null = null;
  let sendError: string | null = null;
  try {
    const routed = await routeDelivery(admin, {
      serviceRecordId: body.serviceRecordId,
      recipientProfileId: record.customer_profile_id,
      recipientPhone: nationalPhone,
      kind: "invoice",
      title: "Your invoice is ready",
      body: `${garageName}: invoice ${invoiceNo} for ${service} on ${vehicle}, Rs ${amountStr}. View it in the app.`,
      data: { invoice: invoiceNo, vehicle, service, amount: amountStr }
    });
    channel = routed.channel;
    deliveryId = routed.deliveryId;
    sendError = routed.error ?? null;
  } catch (error) {
    sendError = error instanceof Error ? error.message : "Invoice delivery failed.";
  }

  const newStatus = sendError ? "failed" : "sent";
  await admin
    .from("service_records")
    .update({
      invoice_notification_status: newStatus,
      invoice_delivery_channel: channel === "none" ? "none" : channel,
      updated_at: new Date().toISOString()
    })
    .eq("id", body.serviceRecordId);

  return json(200, {
    ok: !sendError,
    channel,
    deliveryId,
    status: newStatus,
    error: sendError
  });
});
