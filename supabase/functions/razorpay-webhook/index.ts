import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Razorpay webhook: the SERVER-side proof that a garage's fee settlement was
// actually paid (the app is never trusted). Verifies the HMAC signature, then
// marks the fee_settlements row paid and posts a negative 'settlement' entry to
// the garage ledger — idempotently, so retries never double-credit.

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not configured.`);
  return v;
}

// Constant-time hex compare.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let supabaseUrl: string, serviceRoleKey: string, webhookSecret: string;
  try {
    supabaseUrl = requireEnv("SUPABASE_URL");
    serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    webhookSecret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "not configured", { status: 500 });
  }

  const signature = req.headers.get("x-razorpay-signature");
  const raw = await req.text();
  if (!signature) return new Response("missing signature", { status: 400 });

  const expected = await hmacHex(webhookSecret, raw);
  if (!timingSafeEqual(expected, signature)) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Resolve the order id + payment id across the relevant event shapes.
  const orderEntity = event?.payload?.order?.entity;
  const paymentEntity = event?.payload?.payment?.entity;
  const orderId: string | undefined = orderEntity?.id ?? paymentEntity?.order_id;
  const paymentId: string | undefined = paymentEntity?.id;
  const isPaid = event?.event === "order.paid" || event?.event === "payment.captured";

  // Acknowledge anything we don't act on (Razorpay retries on non-2xx).
  if (!isPaid || !orderId) return new Response("ignored", { status: 200 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // One transaction: lock the settlement row, check the captured amount covers
  // it, mark it paid and post the ledger credit — so concurrent/retried
  // webhooks can never double-credit, and a partial failure leaves nothing half
  // applied (Razorpay simply retries).
  const amountPaise = typeof paymentEntity?.amount === "number"
    ? paymentEntity.amount
    : typeof orderEntity?.amount_paid === "number" ? orderEntity.amount_paid : null;
  const { data: outcome, error: rpcErr } = await admin.rpc("apply_fee_settlement_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId ?? null,
    p_amount_paise: amountPaise,
  });
  if (rpcErr) return new Response("settlement failed", { status: 500 });
  if (outcome !== "ok") return new Response(String(outcome), { status: 200 });

  return new Response("ok", { status: 200 });
});
