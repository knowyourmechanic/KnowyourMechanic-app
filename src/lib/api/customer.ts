import { supabase } from '../supabase';
import type { ServiceRecordRow } from './services';

export interface CustomerProfileFields {
    name: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    vehicleNumber: string;
}

export async function getCustomerProfile(profileId: string): Promise<CustomerProfileFields> {
    const { data } = await supabase
        .from('profiles')
        .select('name,vehicle_make,vehicle_model,vehicle_year,vehicle_number')
        .eq('id', profileId)
        .maybeSingle();
    return {
        name: data?.name ?? '',
        vehicleMake: data?.vehicle_make ?? '',
        vehicleModel: data?.vehicle_model ?? '',
        vehicleYear: data?.vehicle_year ?? '',
        vehicleNumber: data?.vehicle_number ?? '',
    };
}

export async function saveCustomerProfile(profileId: string, p: CustomerProfileFields): Promise<void> {
    const { error } = await supabase
        .from('profiles')
        .update({
            name: p.name,
            vehicle_make: p.vehicleMake,
            vehicle_model: p.vehicleModel,
            vehicle_year: p.vehicleYear,
            vehicle_number: p.vehicleNumber,
        })
        .eq('id', profileId);
    if (error) throw new Error(error.message);
}

// A customer's completed service history (matched by phone), newest first.
export async function getCustomerServiceHistory(phone: string): Promise<ServiceRecordRow[]> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const { data, error } = await supabase
        .from('service_records')
        .select('*')
        .eq('customer_phone', digits)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('getCustomerServiceHistory error', error);
        return [];
    }
    return (data ?? []) as ServiceRecordRow[];
}

// ---- Reviews (customer) ----
export interface MyReview {
    rating: number;
    comment: string | null;
}

// The current customer's review for a garage, or null if they haven't reviewed it.
export async function getMyReview(customerProfileId: string, garageId: string): Promise<MyReview | null> {
    const { data, error } = await supabase
        .from('reviews')
        .select('rating,comment')
        .eq('customer_profile_id', customerProfileId)
        .eq('garage_id', garageId)
        .maybeSingle();
    if (error) {
        console.error('getMyReview error', error);
        return null;
    }
    return data ? { rating: data.rating, comment: data.comment } : null;
}

// Create or update the customer's review for a garage (one per customer+garage).
export async function submitReview(
    customerProfileId: string,
    garageId: string,
    rating: number,
    comment: string,
): Promise<MyReview> {
    const { data, error } = await supabase
        .from('reviews')
        .upsert(
            {
                customer_profile_id: customerProfileId,
                garage_id: garageId,
                rating,
                comment: comment.trim() || null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'customer_profile_id,garage_id' },
        )
        .select('rating,comment')
        .single();
    if (error) throw new Error(error.message);
    return { rating: data.rating, comment: data.comment };
}

// ---- Reports (customer) ----
export async function submitReport(p: {
    reporterProfileId: string;
    garageId: string;
    reason: string;
    description: string;
    serviceRecordId?: string;
}): Promise<void> {
    const { error } = await supabase.from('reports').insert({
        reporter_profile_id: p.reporterProfileId,
        garage_id: p.garageId,
        reason: p.reason,
        description: p.description.trim() || null,
        service_record_id: p.serviceRecordId ?? null,
    });
    if (error) throw new Error(error.message);
}

// Delete the current customer's review for a garage.
export async function deleteMyReview(customerProfileId: string, garageId: string): Promise<void> {
    const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('customer_profile_id', customerProfileId)
        .eq('garage_id', garageId);
    if (error) throw new Error(error.message);
}

// All public reviews for a garage (newest first). Reviewer identity is not exposed.
export interface GarageReview {
    _id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
}
export async function getGarageReviews(garageId: string): Promise<GarageReview[]> {
    const { data, error } = await supabase
        .from('reviews')
        .select('id,rating,comment,created_at')
        .eq('garage_id', garageId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('getGarageReviews error', error);
        return [];
    }
    return (data ?? []).map((r) => ({ _id: r.id, rating: r.rating, comment: r.comment, createdAt: r.created_at }));
}

// True if the customer has at least one completed service with this garage (gates reviewing).
export async function canCustomerReviewGarage(phone: string, garageId: string): Promise<boolean> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const { count, error } = await supabase
        .from('service_records')
        .select('id', { count: 'exact', head: true })
        .eq('customer_phone', digits)
        .eq('garage_id', garageId)
        .eq('status', 'completed');
    if (error) {
        console.error('canCustomerReviewGarage error', error);
        return false;
    }
    return (count ?? 0) > 0;
}

// Public garage detail (single). Mirrors the discoverGarages shape.
export interface GarageDetailPublic {
    _id: string;
    name: string;
    phone: string;
    location: { address: string; coordinates: [number, number] };
    serviceHours: string;
    workingDays: string;
    photoUrl?: string;
    rating: number;
    totalReviews: number;
}
export async function getGaragePublic(garageId: string): Promise<GarageDetailPublic | null> {
    const { data: g, error } = await supabase
        .from('garages')
        .select('id,name,phone,address,latitude,longitude,service_hours,working_days,photo_url,rating,total_reviews')
        .eq('id', garageId)
        .maybeSingle();
    if (error || !g) {
        if (error) console.error('getGaragePublic error', error);
        return null;
    }
    return {
        _id: g.id,
        name: g.name,
        phone: g.phone || '',
        location: { address: g.address || '', coordinates: [g.longitude || 0, g.latitude || 0] },
        serviceHours: g.service_hours || '',
        workingDays: Array.isArray(g.working_days) ? g.working_days.join(',') : '',
        photoUrl: g.photo_url || undefined,
        rating: Number(g.rating) || 0,
        totalReviews: g.total_reviews || 0,
    };
}

// First completed-service garage the customer hasn't reviewed yet (for the "rate this" nudge).
// Returns null if everything is reviewed or there's no history.
export interface UnratedGarage {
    garageId: string;
    garageName: string;
    serviceDescription: string;
    serviceDate: string;
}
export async function getUnratedGarage(customerProfileId: string, phone: string): Promise<UnratedGarage | null> {
    const [history, mine] = await Promise.all([
        getCustomerServiceHistory(phone),
        supabase.from('reviews').select('garage_id').eq('customer_profile_id', customerProfileId),
    ]);
    const reviewed = new Set((mine.data ?? []).map((r: { garage_id: string }) => r.garage_id));
    const svc = history.find((h) => h.garage_id && !reviewed.has(h.garage_id));
    return svc
        ? { garageId: svc.garage_id, garageName: svc.garage_name, serviceDescription: svc.description, serviceDate: svc.created_at }
        : null;
}

// ============================================================================
// Customer discovery
// ============================================================================
export interface NearbyGarage {
    id: string;
    name: string;
    phone: string;
    address: string;
    lat: number;
    lng: number;
    distanceKm: number;
    rating: number;
    reviews: number;
    photoUrl: string | null;
    serviceHours: string;
    workingDays: string[];
    joinedAt: string | null;
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Verified, active garages within `radiusKm` of the user, nearest first. A
// bounding box (which fully contains the search circle) is applied in the query
// so nearby garages are actually returned; the exact circle is applied here.
export async function discoverGarages(lat: number, lng: number, radiusKm = 5): Promise<NearbyGarage[]> {
    let query = supabase
        .from('garages')
        .select('id,name,phone,address,latitude,longitude,service_hours,working_days,photo_url,rating,total_reviews,created_at')
        .eq('is_verified', true)
        .eq('is_offboarded', false)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * (Math.cos((lat * Math.PI) / 180) || 1));
    query = query
        .gte('latitude', lat - latDelta).lte('latitude', lat + latDelta)
        .gte('longitude', lng - lngDelta).lte('longitude', lng + lngDelta);

    const { data, error } = await query.limit(200);
    if (error) throw new Error(error.message);

    return (data ?? [])
        .map((g) => {
            const gLat = Number(g.latitude);
            const gLng = Number(g.longitude);
            return {
                id: g.id as string,
                name: (g.name as string) || 'Unnamed garage',
                phone: (g.phone as string) || '',
                address: (g.address as string) || '',
                lat: gLat,
                lng: gLng,
                distanceKm: distanceKm(lat, lng, gLat, gLng),
                rating: Number(g.rating) || 0,
                reviews: Number(g.total_reviews) || 0,
                photoUrl: (g.photo_url as string) || null,
                serviceHours: (g.service_hours as string) || '',
                workingDays: Array.isArray(g.working_days) ? (g.working_days as string[]) : [],
                joinedAt: (g.created_at as string) || null,
            };
        })
        .filter((g) => g.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
}

// ============================================================================
// Pending confirmations (garage logged a service; customer hasn't shared OTP)
// ============================================================================
export interface PendingService {
    id: string;
    garageName: string;
    vehicleNumber: string | null;
    work: string;
    amount: number;
    createdAt: string;
}

// Services awaiting this customer's OTP, newest first. Older than the OTP
// lifetime + resend window they're stale, so only the last 24h are shown.
export async function getMyPendingServices(profileId: string, phone: string): Promise<PendingService[]> {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
        .from('service_records')
        .select('id,garage_name,vehicle_number,service_notes,description,amount,created_at')
        .eq('status', 'pending_otp')
        // As the customer only (a garage owner can also read records it created).
        .or(`customer_profile_id.eq.${profileId},customer_phone.eq.${digits}`)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []).map((r) => ({
        id: r.id,
        garageName: r.garage_name,
        vehicleNumber: r.vehicle_number,
        work: (r.service_notes && r.service_notes.trim()) || r.description,
        amount: Number(r.amount),
        createdAt: r.created_at,
    }));
}

// "I didn't get this service": cancels the record, burns the OTP and files a
// report for support to review.
export async function declineService(serviceRecordId: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('customer_decline_service', {
        p_service_record_id: serviceRecordId,
        p_reason: reason ?? undefined,
    });
    if (error) throw new Error(error.message);
}

// ============================================================================
// Vehicle Service Passport
// ============================================================================
export interface PassportEntry {
    id: string;
    date: string;
    garageId: string | null;
    garageName: string;
    work: string;
    odometerKm: number | null;
    amount: number;
    invoiceNumber: string | null;
}
export interface VehiclePassport {
    vehicleNumber: string;      // normalised, e.g. MH12AB1234
    entries: PassportEntry[];   // newest first
    lastServiceAt: string;
    totalSpent: number;
    garagesUsed: number;
}

export const normalizePlate = (v: string | null | undefined) => (v ?? '').replace(/[\s-]/g, '').toUpperCase();

// Groups the customer's completed services by vehicle number.
export function buildPassports(history: ServiceRecordRow[]): VehiclePassport[] {
    const byVehicle = new Map<string, PassportEntry[]>();
    for (const r of history) {
        const plate = normalizePlate(r.vehicle_number);
        if (!plate) continue;
        const list = byVehicle.get(plate) ?? [];
        list.push({
            id: r.id,
            date: r.created_at,
            garageId: r.garage_id,
            garageName: r.garage_name,
            work: (r.service_notes && r.service_notes.trim()) || r.description,
            odometerKm: r.odometer_km,
            amount: Number(r.amount) + Number(r.platform_fee || 0),
            invoiceNumber: r.invoice_number,
        });
        byVehicle.set(plate, list);
    }
    return [...byVehicle.entries()]
        .map(([vehicleNumber, entries]) => {
            entries.sort((a, b) => b.date.localeCompare(a.date));
            return {
                vehicleNumber,
                entries,
                lastServiceAt: entries[0].date,
                totalSpent: entries.reduce((s, e) => s + e.amount, 0),
                garagesUsed: new Set(entries.map((e) => e.garageName)).size,
            };
        })
        .sort((a, b) => b.lastServiceAt.localeCompare(a.lastServiceAt));
}

// Service reminder: a vehicle is "due" 6 months after its last service, and
// "due soon" in the 3 weeks before that. Computed on-device — no messages sent.
export const SERVICE_INTERVAL_DAYS = 182;
export function reminderFor(lastServiceAt: string, now = Date.now()): { state: 'ok' | 'soon' | 'due'; days: number } {
    const dueAt = new Date(lastServiceAt).getTime() + SERVICE_INTERVAL_DAYS * 86400000;
    const days = Math.round((dueAt - now) / 86400000);
    return { state: days <= 0 ? 'due' : days <= 21 ? 'soon' : 'ok', days };
}

export async function createVehicleShare(vehicleNumber: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_vehicle_share', { p_vehicle_number: vehicleNumber });
    if (error || !data) throw new Error(error?.message || 'Could not create a share link.');
    return data;
}

export async function revokeVehicleShare(vehicleNumber: string): Promise<void> {
    const { error } = await supabase.rpc('revoke_vehicle_share', { p_vehicle_number: vehicleNumber });
    if (error) throw new Error(error.message);
}

export interface SharedPassportEntry {
    date: string;
    garageName: string;
    work: string;
    odometerKm: number | null;
    invoiceNumber: string | null;
}
// Public (no login) read of a shared passport. Empty when revoked/unknown.
export async function getSharedVehicleHistory(token: string): Promise<{ vehicleNumber: string; entries: SharedPassportEntry[] } | null> {
    const { data, error } = await supabase.rpc('get_shared_vehicle_history', { p_token: token });
    if (error || !data || data.length === 0) return null;
    return {
        vehicleNumber: data[0].vehicle_number,
        entries: data.map((r) => ({
            date: r.service_date,
            garageName: r.garage_name,
            work: r.work_done,
            odometerKm: r.odometer_km,
            invoiceNumber: r.invoice_number,
        })),
    };
}

// Public count of OTP-confirmed services per garage (discovery cards).
export async function getGarageServiceCounts(garageIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (garageIds.length === 0) return out;
    const { data, error } = await supabase.rpc('public_garage_service_counts', { p_garage_ids: garageIds });
    if (error) return out;
    for (const r of data ?? []) out.set(r.garage_id, Number(r.completed));
    return out;
}
