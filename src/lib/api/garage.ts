import { supabase } from '../supabase';
import { invokeFunction } from './core';
import type { Enums, Tables, TablesInsert } from '../database.types';

export type GarageRow = Tables<'garages'>;

// The garage owned by the given profile (or null if not onboarded yet).
export async function getMyGarage(ownerProfileId: string): Promise<GarageRow | null> {
    const { data, error } = await supabase
        .from('garages')
        .select('*')
        .eq('owner_profile_id', ownerProfileId)
        .is('owner_declined_at', null)
        // Deterministic pick (the demo seed has one owner across many garages;
        // real owners have a single garage). The demo garage id sorts first.
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('getMyGarage error', error);
        return null;
    }
    return data as GarageRow | null;
}

export interface GarageBusinessInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    coordinates: [number, number]; // [lng, lat]
    serviceHours: string;
    workingDays: string[];
    businessType: string;
    legalBusinessName: string;
    referralCode?: string;
}

// Creates or updates the garage owned by ownerProfileId. Returns the garage id.
// Resolves a field-employee referral code to the employee's name (null if unknown).
export async function lookupReferralCode(code: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('lookup_referral_code', { p_code: code });
    if (error) return null;
    return (data as string | null) ?? null;
}

export async function saveGarageBusinessInfo(ownerProfileId: string, info: GarageBusinessInfo, garageId?: string): Promise<string> {
    const payload: TablesInsert<'garages'> = {
        owner_profile_id: ownerProfileId,
        name: info.name.trim(),
        email: info.email.trim() || null,
        phone: info.phone.replace(/\D/g, '').slice(-10),
        address: info.address,
        latitude: info.coordinates?.[1] ?? null,
        longitude: info.coordinates?.[0] ?? null,
        service_hours: info.serviceHours,
        working_days: info.workingDays,
        business_type: info.businessType as Enums<'business_type'>,
        legal_business_name: info.legalBusinessName || info.name,
    };
    const existing = garageId ? { id: garageId } : await getMyGarage(ownerProfileId);
    if (existing) {
        // owner_profile_id is server-managed on update (kept as is).
        const { error } = await supabase.from('garages').update(payload).eq('id', existing.id);
        if (error) throw new Error(error.message);
        garageId = existing.id;
    } else {
        const { data, error } = await supabase.from('garages').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        garageId = (data as { id: string }).id;
    }
    // Employee attribution is server-side (employees aren't readable by garages).
    if (info.referralCode) await applyGarageReferral(garageId, info.referralCode);
    return garageId;
}

// Credits the KYM field employee whose referral code brought this garage in.
export async function applyGarageReferral(garageId: string, code: string): Promise<void> {
    await supabase.rpc('apply_garage_referral', { p_garage_id: garageId, p_code: code });
}

// Uploads the garage's cover photo to storage and saves its public URL on the
// garage. (Photos used to be base64 strings inside the row, which bloated every
// discovery query by megabytes.)
export async function saveGaragePhoto(garageId: string, file: Blob): Promise<string> {
    const path = `${garageId}/cover-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
        .from('garage-photos')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from('garage-photos').getPublicUrl(path);
    const { error } = await supabase.from('garages').update({ photo_url: data.publicUrl }).eq('id', garageId);
    if (error) throw new Error(error.message);
    return data.publicUrl;
}

// ---- Garage payment QR --------------------------------------------------
// The garage's own static UPI QR that the customer scans to pay them directly
// (service amount + ₹3.90 platform fee). KYM never touches this money; the fee
// is accrued as owed by the garage and settled later. The image lives in the
// public-read 'garage-qr' storage bucket under '<garage_id>/qr'; only the owning
// garage can write it (storage RLS). Its path is recorded on garage_payout_details.
const GARAGE_QR_BUCKET = 'garage-qr';

// Uploads (or replaces) the garage's payment-QR image and records its path.
// Returns a cache-busted public URL so the caller can show the new image at once.
export async function saveGarageQr(garageId: string, file: File): Promise<string> {
    const path = `${garageId}/qr`;
    const { error: upErr } = await supabase.storage
        .from(GARAGE_QR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
    if (upErr) throw new Error(upErr.message);

    const { error: dbErr } = await supabase
        .from('garage_payout_details')
        .upsert(
            { garage_id: garageId, qr_image_path: path, updated_at: new Date().toISOString() },
            { onConflict: 'garage_id' },
        );
    if (dbErr) throw new Error(dbErr.message);

    const { data } = supabase.storage.from(GARAGE_QR_BUCKET).getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
}

// The garage's saved payment-QR public URL, or null if none uploaded yet.
export async function getMyGarageQr(garageId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('garage_payout_details')
        .select('qr_image_path')
        .eq('garage_id', garageId)
        .maybeSingle();
    if (error || !data?.qr_image_path) return null;
    const { data: pub } = supabase.storage.from(GARAGE_QR_BUCKET).getPublicUrl(data.qr_image_path);
    return pub.publicUrl;
}

export async function completeGarageOnboarding(garageId: string): Promise<void> {
    const { error } = await supabase.from('garages').update({ onboarding_status: 'completed', is_verified: true }).eq('id', garageId);
    if (error) throw new Error(error.message);
}

// ---- Fee settlement (garage pays KYM the accrued platform fees) ----------
export interface GarageSettlement {
    outstanding: number;  // all-time owed (rupees)
    dueNow: number;       // owed from before today — clearing this lifts the lock
    locked: boolean;      // next-day lock active
}

// Whether the in-app fee-settlement flow is switched on (admin flag). The pay
// UI stays hidden until this is true, so garages never see a Pay button before
// the Edge Functions + Razorpay keys are live.
export async function isFeeSettlementEnabled(): Promise<boolean> {
    const { data, error } = await supabase.rpc('app_flag', { p_key: 'fee_settlement_enabled' });
    if (error) return false;
    return !!data;
}

// The garage's fee-settlement status (owed amount + whether the lock is on).
export async function getMyGarageSettlement(garageId: string): Promise<GarageSettlement> {
    const { data, error } = await supabase
        .rpc('garage_settlement_status', { p_garage_id: garageId })
        .single();
    if (error || !data) return { outstanding: 0, dueNow: 0, locked: false };
    const d = data as { outstanding: number; due_now: number; locked: boolean };
    return { outstanding: Number(d.outstanding || 0), dueNow: Number(d.due_now || 0), locked: !!d.locked };
}

export interface FeeSettlementOrder {
    orderId?: string;
    amount?: number;    // paise
    currency?: string;
    keyId?: string;     // Razorpay key id for Checkout
    nothingDue?: boolean;
}

// Asks the server to create a Razorpay order for the garage's owed fees. The
// server prices it from the ledger (the client never sets the amount). The
// returned order is opened with Razorpay Standard Checkout in-app; the webhook
// clears the ledger once payment is verified server-side.
export async function createFeeSettlementOrder(garageId: string): Promise<FeeSettlementOrder> {
    return invokeFunction('razorpay-create-order', { garageId });
}

// ---- Garage service catalog (garage_services) ----
export interface OfferedServiceRow {
    _id: string;
    name: string;
    description: string | null;
    price: number;
    duration: number;
    isActive: boolean;
}
function mapOfferedService(s: Pick<Tables<'garage_services'>, 'id' | 'name' | 'description' | 'price' | 'duration_minutes' | 'is_active'>): OfferedServiceRow {
    return {
        _id: s.id,
        name: s.name,
        description: s.description,
        price: Number(s.price),
        duration: s.duration_minutes || 0,
        isActive: s.is_active,
    };
}

// Active services a garage offers (public catalog on the garage detail page).
export async function getGarageOfferedServices(garageId: string): Promise<OfferedServiceRow[]> {
    const { data, error } = await supabase
        .from('garage_services')
        .select('id,name,description,price,duration_minutes,is_active')
        .eq('garage_id', garageId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
    if (error) {
        console.error('getGarageOfferedServices error', error);
        return [];
    }
    return (data ?? []).map(mapOfferedService);
}

// All services for the owner's own garage (includes inactive) — for the manage-catalog page.
export async function getMyGarageServices(garageId: string): Promise<OfferedServiceRow[]> {
    const { data, error } = await supabase
        .from('garage_services')
        .select('id,name,description,price,duration_minutes,is_active')
        .eq('garage_id', garageId)
        .order('created_at', { ascending: true });
    if (error) {
        console.error('getMyGarageServices error', error);
        return [];
    }
    return (data ?? []).map(mapOfferedService);
}

export interface GarageServiceInput {
    name: string;
    description: string;
    price: number;
    durationMinutes: number;
}
export async function createGarageService(garageId: string, p: GarageServiceInput): Promise<void> {
    const { error } = await supabase.from('garage_services').insert({
        garage_id: garageId,
        name: p.name,
        description: p.description.trim() || null,
        price: p.price,
        duration_minutes: p.durationMinutes || null,
    });
    if (error) throw new Error(error.message);
}
export async function updateGarageService(id: string, p: GarageServiceInput): Promise<void> {
    const { error } = await supabase
        .from('garage_services')
        .update({
            name: p.name,
            description: p.description.trim() || null,
            price: p.price,
            duration_minutes: p.durationMinutes || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    if (error) throw new Error(error.message);
}
export async function deleteGarageService(id: string): Promise<void> {
    const { error } = await supabase.from('garage_services').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

