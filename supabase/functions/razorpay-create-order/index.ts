import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { corsHeaders, json, requireEnv } from "../_shared/http.ts";

// Creates a Razorpay Order for the platform fees a garage owes KYM, so the
// garage can settle them IN-APP via Standard Checkout. The amount is computed
// server-side from the ledger (never trusted from the client), and a
// fee_settlements row records the order for idempotent webhook reconciliation.

const ORDER_REUSE_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization header." });

  let body: { garageId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }
  if (!body.garageId) return json(400, { error: "Missing garageId." });

  let supabaseUrl: string, anonKey: string, serviceRoleKey: string, keyId: string, keySecret: string;
  try {
    supabaseUrl = requireEnv("SUPABASE_URL");
    anonKey = requireEnv("SUPABASE_ANON_KEY");
    serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    keyId = requireEnv("RAZORPAY_KEY_ID");
    keySecret = requireEnv("RAZORPAY_KEY_SECRET");
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Server not configured." });
  }

  // Caller-scoped client: garage_settlement_status enforces owns_garage() and
  // returns the amount owed — this both authorizes the caller and prices the order.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: status, error: statusErr } = await callerClient
    .rpc("garage_settlement_status", { p_garage_id: body.garageId })
    .single();

  if (statusErr) {
    const code = (statusErr as { code?: string }).code;
    return json(code === "42501" ? 403 : 400, { error: statusErr.message });
  }

  const outstanding = Number((status as { outstanding: number }).outstanding || 0);
  if (outstanding <= 0) return json(200, { nothingDue: true });

  const amountPaise = Math.round(outstanding * 100);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Reuse a still-open order for the same amount (double taps, a dismissed
  // sheet reopened) instead of minting a new one each time — parallel open
  // orders for the full balance could each be paid and over-credit the garage.
  const { data: open } = await admin
    .from("fee_settlements")
    .select("razorpay_order_id, amount")
    .eq("garage_id", body.garageId)
    .eq("status", "created")
    .gte("created_at", new Date(Date.now() - ORDER_REUSE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open?.razorpay_order_id && Math.round(Number(open.amount) * 100) === amountPaise) {
    return json(200, { orderId: open.razorpay_order_id, amount: amountPaise, currency: "INR", keyId });
  }

  // Create the Razorpay order (Orders API).
  const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `kym-fee-${body.garageId.slice(0, 8)}-${Date.now()}`,
      notes: { garage_id: body.garageId, kind: "fee_settlement" },
    }),
  });

  const order = await rzpRes.json().catch(() => null);
  if (!rzpRes.ok || !order?.id) {
    return json(502, { error: order?.error?.description || "Could not create Razorpay order." });
  }

  // Record the order for webhook reconciliation (service role bypasses RLS).
  const { error: insErr } = await admin.from("fee_settlements").insert({
    garage_id: body.garageId,
    amount: outstanding,
    razorpay_order_id: order.id,
    status: "created",
  });
  if (insErr) return json(500, { error: "Order created but could not be recorded." });

  return json(200, {
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId,
  });
});
