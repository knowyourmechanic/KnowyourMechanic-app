import { supabase } from '../supabase';

// ============================================================================
// Notification delivery (OTP / invoice) — Phase 2 tracking + ack
// ============================================================================

// Called by the app's push handler when it receives an OTP/invoice notification.
// The delivery id travels in the push payload. Marking it acked tells the
// server a live app got it, so the WhatsApp fallback worker skips it.
export async function ackNotificationDelivery(deliveryId: string): Promise<void> {
    const { error } = await supabase.rpc('ack_notification_delivery', { p_delivery_id: deliveryId });
    if (error) throw new Error(error.message);
}

// Store/refresh this device's push token for the signed-in profile. The RPC
// also retires the token from any other account that used this phone before,
// so their OTPs/invoices stop arriving here.
export async function saveDeviceToken(token: string, platform: string): Promise<void> {
    const { error } = await supabase.rpc('register_device', { p_push_token: token, p_platform: platform });
    if (error) throw new Error(error.message);
}
