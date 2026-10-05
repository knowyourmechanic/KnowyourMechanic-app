import { supabase } from './supabase';

// Supabase-backed data access.

// Calls an Edge Function and returns its JSON. supabase-js turns every non-2xx
// into an opaque "Edge Function returned a non-2xx status code" error whose
// `context` is the raw Response — read it so callers see the server's own
// message (e.g. "Please settle your pending platform fees…"). A 4xx body that
// carries `ok: false` is a business outcome, not an exception, so it is
// returned as data.
async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (!error) return data as T;
    const ctx = (error as { context?: unknown }).context as Response | { body?: unknown } | undefined;
    let payload: { ok?: boolean; error?: string } | null = null;
    if (ctx && typeof (ctx as Response).json === 'function') {
        try { payload = await (ctx as Response).json(); } catch { payload = null; }
    } else if (ctx && typeof (ctx as { body?: unknown }).body === 'object') {
        payload = (ctx as { body: { ok?: boolean; error?: string } }).body;
    }
    if (payload && payload.ok === false) return payload as T;
    throw new Error(payload?.error || error.message || 'Request failed.');
}

export interface GarageRow {
    id: string;
    owner_profile_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    service_hours: string | null;
    working_days: string[] | null;
    photo_url: string | null;
    rating: number;
    total_reviews: number;
    is_verified: boolean;
    onboarding_status: string;
}

export interface ServiceRecordRow {
    id: string;
    garage_id: string;
    garage_name: string;
    customer_phone: string;
    description: string;
    amount: number;
    platform_fee: number;
    garage_earnings: number;
    payment_method: string | null;
    status: string;
    is_reliable: boolean;
    invoice_number: string | null;
    created_at: string;
    vehicle_number: string | null;
    service_notes: string | null;
    vehicle_type: string | null;
    vehicle_make_code: string | null;
    vehicle_model_code: string | null;
    vehicle_make_other: string | null;
    vehicle_model_other: string | null;
    model_year: number | null;
    odometer_km: number | null;
}

// The garage owned by the given profile (or null if not onboarded yet).
export async function getMyGarage(ownerProfileId: string): Promise<GarageRow | null> {
    const { data, error } = await supabase
        .from('garages')
        .select('*')
        .eq('owner_profile_id', ownerProfileId)
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

export interface AdminStats {
    totalGarages: number;
    totalCustomers: number;
    totalEmployees: number;
    totalServices: number;
    totalRevenue: number;
    totalGMV: number;
    avgServicesPerDay: string;
    referredGarages: number;
    dailyBreakdown: { date: string; count: number; revenue: number }[];
}

export interface AdminGarageItem {
    _id: string;
    name: string;
    location: { address: string; coordinates: [number, number] };
    phone: string;
    rating: number;
    totalReviews: number;
    serviceCount: number;
    totalEarnings: number;
    onboardingStatus: string;
    isVerified: boolean;
}

// Platform-wide stats for the admin dashboard, computed from Supabase.
export async function getAdminStats(): Promise<AdminStats> {
    const [garagesC, customersC, employeesC, records, referredC] = await Promise.all([
        supabase.from('garages').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
        supabase.from('service_records').select('amount,platform_fee,created_at').eq('status', 'completed'),
        supabase.from('garages').select('id', { count: 'exact', head: true }).not('assigned_employee_id', 'is', null),
    ]);
    const recs = (records.data ?? []) as { amount: number; platform_fee: number; created_at: string }[];
    const totalRevenue = recs.reduce((s, r) => s + Number(r.platform_fee || 0), 0);
    const totalGMV = recs.reduce((s, r) => s + Number(r.amount || 0), 0);

    // Group completed records by day for the volume chart (last 30 days).
    const byDay = new Map<string, { count: number; revenue: number }>();
    for (const r of recs) {
        const day = (r.created_at || '').slice(0, 10);
        const cur = byDay.get(day) ?? { count: 0, revenue: 0 };
        cur.count += 1;
        cur.revenue += Number(r.platform_fee || 0);
        byDay.set(day, cur);
    }
    const dailyBreakdown = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([date, v]) => ({ date, count: v.count, revenue: v.revenue }));

    const days = Math.max(dailyBreakdown.length, 1);
    return {
        totalGarages: garagesC.count ?? 0,
        totalCustomers: customersC.count ?? 0,
        totalEmployees: employeesC.count ?? 0,
        totalServices: recs.length,
        totalRevenue,
        totalGMV,
        avgServicesPerDay: (recs.length / days).toFixed(1),
        referredGarages: referredC.count ?? 0,
        dailyBreakdown,
    };
}

export async function getAdminGarages(): Promise<AdminGarageItem[]> {
    const { data, error } = await supabase
        .from('garages')
        .select('id,name,address,latitude,longitude,phone,rating,total_reviews,onboarding_status,is_verified')
        .order('created_at', { ascending: false })
        .limit(300);
    if (error) {
        console.error('getAdminGarages error', error);
        return [];
    }
    return (data ?? []).map((g: any) => ({
        _id: g.id,
        name: g.name,
        location: { address: g.address || '', coordinates: [g.longitude || 0, g.latitude || 0] },
        phone: g.phone || '',
        rating: Number(g.rating) || 0,
        totalReviews: g.total_reviews || 0,
        serviceCount: 0,
        totalEarnings: 0,
        onboardingStatus: g.onboarding_status || 'pending',
        isVerified: g.is_verified,
    }));
}

export interface AdminEmployee {
    _id: string;
    name: string;
    email: string;
    phone: string;
    referralCode: string;
    role: string;
    isActive: boolean;
    garageCount: number;
    createdAt: string;
}

export async function getAdminEmployees(): Promise<AdminEmployee[]> {
    const [{ data: emps }, { data: gar }] = await Promise.all([
        supabase.from('employees').select('id,name,email,phone,referral_code,role,is_active,created_at').order('created_at'),
        supabase.from('garages').select('assigned_employee_id'),
    ]);
    const counts = new Map<string, number>();
    for (const g of gar ?? []) {
        const id = (g as any).assigned_employee_id;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return (emps ?? []).map((e: any) => ({
        _id: e.id,
        name: e.name,
        email: e.email || '',
        phone: e.phone,
        referralCode: e.referral_code,
        role: e.role,
        isActive: e.is_active,
        garageCount: counts.get(e.id) ?? 0,
        createdAt: e.created_at,
    }));
}

export async function createAdminEmployee(p: { name: string; email: string; phone: string }): Promise<void> {
    const referral = 'KYM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { error } = await supabase.from('employees').insert({
        name: p.name,
        email: p.email || null,
        phone: p.phone.replace(/\D/g, '').slice(-10),
        referral_code: referral,
        role: 'employee',
        is_active: true,
    });
    if (error) throw new Error(error.message);
}

export interface EmployeePerformanceRow {
    _id: string;
    name: string;
    referralCode: string;
    totalGarages: number;
    totalServices: number;
    totalRevenue: number;
    avgGaragesPerDay: string;
    avgTransactionsPerDay: string;
}

export async function getAdminPerformance(): Promise<EmployeePerformanceRow[]> {
    const emps = await getAdminEmployees();
    const { data: gar } = await supabase.from('garages').select('id,assigned_employee_id');
    const garToEmp = new Map<string, string>();
    for (const g of gar ?? []) {
        const id = (g as any).assigned_employee_id;
        if (id) garToEmp.set((g as any).id, id);
    }
    const { data: recs } = await supabase.from('service_records').select('garage_id,platform_fee').eq('status', 'completed');
    const byEmp = new Map<string, { services: number; revenue: number }>();
    for (const r of recs ?? []) {
        const emp = garToEmp.get((r as any).garage_id);
        if (!emp) continue;
        const a = byEmp.get(emp) ?? { services: 0, revenue: 0 };
        a.services += 1;
        a.revenue += Number((r as any).platform_fee || 0);
        byEmp.set(emp, a);
    }
    return emps
        .map((e) => ({
            _id: e._id,
            name: e.name,
            referralCode: e.referralCode,
            totalGarages: e.garageCount,
            totalServices: byEmp.get(e._id)?.services ?? 0,
            totalRevenue: byEmp.get(e._id)?.revenue ?? 0,
            avgGaragesPerDay: '0',
            avgTransactionsPerDay: ((byEmp.get(e._id)?.services ?? 0) / 30).toFixed(1),
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export interface AdvancedStatsRow {
    totalUsers: number;
    totalVehicles: number;
    totalGarages: number;
    mrr: number;
    arr: number;
    allTimeGMV: number;
}

export async function getAdvancedStats(): Promise<AdvancedStatsRow> {
    const [users, garages, recsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('garages').select('id', { count: 'exact', head: true }),
        supabase.from('service_records').select('amount,platform_fee,vehicle_number').eq('status', 'completed'),
    ]);
    const recs = (recsRes.data ?? []) as { amount: number; platform_fee: number; vehicle_number: string | null }[];
    const allTimeGMV = recs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const mrr = recs.reduce((s, r) => s + Number(r.platform_fee || 0), 0);
    const vehicles = new Set(recs.map((r) => r.vehicle_number).filter(Boolean)).size;
    return {
        totalUsers: users.count ?? 0,
        totalVehicles: vehicles,
        totalGarages: garages.count ?? 0,
        mrr,
        arr: mrr * 12,
        allTimeGMV,
    };
}

export interface AdminReportRow {
    _id: string;
    reporterId: { name?: string; phoneNumber: string };
    garageId: { _id: string; name: string };
    reason: string;
    description: string;
    status: string;
    createdAt: string;
}

export async function getAdminReports(): Promise<AdminReportRow[]> {
    const { data, error } = await supabase
        .from('reports')
        .select('id,reason,description,status,created_at,garage_id, reporter:reporter_profile_id(name,phone_number), garage:garage_id(name)')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('getAdminReports error', error);
        return [];
    }
    return (data ?? []).map((r: any) => ({
        _id: r.id,
        reporterId: { name: r.reporter?.name, phoneNumber: r.reporter?.phone_number || '' },
        garageId: { _id: r.garage_id, name: r.garage?.name || '' },
        reason: r.reason,
        description: r.description || '',
        status: r.status,
        createdAt: r.created_at,
    }));
}

export async function updateReportStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
}

export interface EmployeeDashboard {
    profile: { name: string; referralCode: string } | null;
    stats: { totalGarages: number; totalServices: number; totalEarnings: number; avgServicesPerDay: string } | null;
    garages: Array<{
        _id: string;
        name: string;
        location: { address: string; coordinates: [number, number] };
        rating: number;
        totalReviews: number;
        totalServices: number;
        totalEarnings: number;
        avgServicesPerDay: string;
    }>;
    mapGarages: Array<{ id: string; name: string; lat: number; lng: number; rating?: number; reviews?: number; address?: string; isMine: boolean }>;
}

// The employee's own record + their assigned garages + rolled-up stats.
export async function getEmployeeDashboard(profileId: string): Promise<EmployeeDashboard> {
    const { data: emp } = await supabase
        .from('employees')
        .select('id,name,referral_code')
        .eq('profile_id', profileId)
        .maybeSingle();
    if (!emp) return { profile: null, stats: null, garages: [], mapGarages: [] };

    const { data: gRows } = await supabase
        .from('garages')
        .select('id,name,address,latitude,longitude,rating,total_reviews')
        .eq('assigned_employee_id', emp.id);
    const garageRows = gRows ?? [];
    const gids = garageRows.map((g: any) => g.id);

    let recs: { garage_id: string; amount: number }[] = [];
    if (gids.length) {
        const { data } = await supabase
            .from('service_records')
            .select('garage_id,amount')
            .in('garage_id', gids)
            .eq('status', 'completed');
        recs = (data ?? []) as any;
    }
    const perGarage = new Map<string, { count: number; earnings: number }>();
    for (const r of recs) {
        const cur = perGarage.get(r.garage_id) ?? { count: 0, earnings: 0 };
        cur.count += 1;
        cur.earnings += Number(r.amount || 0);
        perGarage.set(r.garage_id, cur);
    }

    const garages = garageRows.map((g: any) => ({
        _id: g.id,
        name: g.name,
        location: { address: g.address || '', coordinates: [g.longitude || 0, g.latitude || 0] as [number, number] },
        rating: Number(g.rating) || 0,
        totalReviews: g.total_reviews || 0,
        totalServices: perGarage.get(g.id)?.count || 0,
        totalEarnings: perGarage.get(g.id)?.earnings || 0,
        avgServicesPerDay: ((perGarage.get(g.id)?.count || 0) / 30).toFixed(1),
    }));

    return {
        profile: { name: emp.name, referralCode: emp.referral_code },
        stats: {
            totalGarages: garages.length,
            totalServices: recs.length,
            totalEarnings: recs.reduce((s, r) => s + Number(r.amount || 0), 0),
            avgServicesPerDay: (recs.length / 30).toFixed(1),
        },
        garages,
        mapGarages: garages.map((g) => ({
            id: g._id,
            name: g.name,
            lat: g.location.coordinates[1],
            lng: g.location.coordinates[0],
            rating: g.rating,
            reviews: g.totalReviews,
            address: g.location.address,
            isMine: true,
        })),
    };
}

// ---- Admin: single employee detail (perf + edit + delete) ----
export interface EmployeeDetailData {
    employee: { name: string; email: string; phone: string; isActive: boolean; createdAt: string; referralCode: string };
    garages: Array<{
        _id: string; name: string; location: { address: string };
        rating: number; totalReviews: number; totalServices: number; totalEarnings: number; avgServicesPerDay: string;
    }>;
    aggregates: { totalGarages: number; totalServices: number; totalEarnings: number; avgServicesPerGarage: string };
}

export async function getEmployeeDetail(employeeId: string): Promise<EmployeeDetailData | null> {
    const { data: emp, error } = await supabase
        .from('employees')
        .select('id,name,email,phone,is_active,created_at,referral_code')
        .eq('id', employeeId)
        .maybeSingle();
    if (error || !emp) {
        if (error) console.error('getEmployeeDetail error', error);
        return null;
    }

    const { data: gRows } = await supabase
        .from('garages')
        .select('id,name,address,rating,total_reviews')
        .eq('assigned_employee_id', emp.id);
    const garageRows = gRows ?? [];
    const gids = garageRows.map((g: any) => g.id);

    let recs: { garage_id: string; amount: number }[] = [];
    if (gids.length) {
        const { data } = await supabase
            .from('service_records')
            .select('garage_id,amount')
            .in('garage_id', gids)
            .eq('status', 'completed');
        recs = (data ?? []) as any;
    }
    const perGarage = new Map<string, { count: number; earnings: number }>();
    for (const r of recs) {
        const cur = perGarage.get(r.garage_id) ?? { count: 0, earnings: 0 };
        cur.count += 1;
        cur.earnings += Number(r.amount || 0);
        perGarage.set(r.garage_id, cur);
    }

    const garages = garageRows.map((g: any) => ({
        _id: g.id,
        name: g.name,
        location: { address: g.address || '' },
        rating: Number(g.rating) || 0,
        totalReviews: g.total_reviews || 0,
        totalServices: perGarage.get(g.id)?.count || 0,
        totalEarnings: perGarage.get(g.id)?.earnings || 0,
        avgServicesPerDay: ((perGarage.get(g.id)?.count || 0) / 30).toFixed(1),
    }));
    const totalServices = recs.length;
    const totalEarnings = recs.reduce((s, r) => s + Number(r.amount || 0), 0);

    return {
        employee: {
            name: emp.name,
            email: emp.email || '',
            phone: emp.phone,
            isActive: emp.is_active,
            createdAt: emp.created_at,
            referralCode: emp.referral_code,
        },
        garages,
        aggregates: {
            totalGarages: garages.length,
            totalServices,
            totalEarnings,
            avgServicesPerGarage: garages.length ? (totalServices / garages.length).toFixed(1) : '0',
        },
    };
}

export async function updateEmployee(employeeId: string, p: { name: string; email: string; phone: string }): Promise<void> {
    const { error } = await supabase
        .from('employees')
        .update({ name: p.name, email: p.email || null, phone: p.phone, updated_at: new Date().toISOString() })
        .eq('id', employeeId);
    if (error) throw new Error(error.message);
}

export async function deleteEmployee(employeeId: string): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', employeeId);
    if (error) throw new Error(error.message);
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

export async function saveGarageBusinessInfo(ownerProfileId: string, info: GarageBusinessInfo): Promise<string> {
    const payload: Record<string, unknown> = {
        owner_profile_id: ownerProfileId,
        name: info.name.trim(),
        email: info.email.trim() || null,
        phone: info.phone.replace(/\D/g, '').slice(-10),
        address: info.address,
        latitude: info.coordinates?.[1] ?? null,
        longitude: info.coordinates?.[0] ?? null,
        service_hours: info.serviceHours,
        working_days: info.workingDays,
        business_type: info.businessType,
        legal_business_name: info.legalBusinessName || info.name,
    };
    const existing = await getMyGarage(ownerProfileId);
    let garageId: string;
    if (existing) {
        const { error } = await supabase.from('garages').update(payload).eq('id', existing.id);
        if (error) throw new Error(error.message);
        garageId = existing.id;
    } else {
        const { data, error } = await supabase.from('garages').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        garageId = (data as { id: string }).id;
    }
    // Employee attribution is server-side (employees aren't readable by garages).
    if (info.referralCode) {
        await supabase.rpc('apply_garage_referral', { p_garage_id: garageId, p_code: info.referralCode });
    }
    return garageId;
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

export interface TaxonomyMake { code: string; display_name: string; vehicle_types: string[]; }
export interface TaxonomyModel { code: string; make_code: string; vehicle_type: string; display_name: string; }
export interface TaxonomyCategory { code: string; display_name: string; }

export interface Taxonomy {
    makes: TaxonomyMake[];
    models: TaxonomyModel[];
    services: TaxonomyCategory[];
    failures: TaxonomyCategory[];
}

// Loads the structured service taxonomy (public read) for the add-service form.
export async function getTaxonomy(): Promise<Taxonomy> {
    const [makes, models, services, failures] = await Promise.all([
        supabase.from('vehicle_makes').select('code,display_name,vehicle_types').eq('is_active', true).order('sort_order'),
        supabase.from('vehicle_models').select('code,make_code,vehicle_type,display_name').eq('is_active', true).order('sort_order'),
        supabase.from('service_categories').select('code,display_name').eq('is_active', true).order('sort_order'),
        supabase.from('failure_categories').select('code,display_name').eq('is_active', true).order('sort_order'),
    ]);
    return {
        makes: (makes.data ?? []) as TaxonomyMake[],
        models: (models.data ?? []) as TaxonomyModel[],
        services: (services.data ?? []) as TaxonomyCategory[],
        failures: (failures.data ?? []) as TaxonomyCategory[],
    };
}

export interface CreateServiceRecordParams {
    garageId: string;
    customerPhone: string;
    vehicleType: string;
    vehicleMakeCode: string | null;
    vehicleModelCode: string | null;
    vehicleMakeOther: string | null;
    vehicleModelOther: string | null;
    vehicleNumber: string | null;
    modelYear: number | null;
    odometerKm: number | null;
    serviceCodes: string[];
    failureCodes: string[];
    serviceNotes: string | null;
    amount: number;
    customerHasApp: boolean;
}

export interface OtpIssueResult {
    devOtp?: string;
    otpDelivery: string;
    otpDeliveryError?: string | null;
    otpExpiresAt?: string;
}

// Full-flow create via the Edge Function: creates the record + join rows AND
// generates/stores/sends the customer OTP (devOtp only for allow-listed test numbers).
export async function createServiceRecordWithOtp(p: CreateServiceRecordParams): Promise<OtpIssueResult & { serviceRecordId: string }> {
    return invokeFunction('service-record-create', {
        garageId: p.garageId,
        customerPhone: p.customerPhone,
        vehicleType: p.vehicleType,
        vehicleMakeCode: p.vehicleMakeCode,
        vehicleModelCode: p.vehicleModelCode,
        vehicleMakeOther: p.vehicleMakeOther,
        vehicleModelOther: p.vehicleModelOther,
        vehicleNumber: p.vehicleNumber,
        modelYear: p.modelYear,
        odometerKm: p.odometerKm,
        serviceCategoryCodes: p.serviceCodes,
        failureCategoryCodes: p.failureCodes,
        serviceNotes: p.serviceNotes,
        amount: p.amount,
        customerHasApp: p.customerHasApp,
    });
}

// Sends a fresh OTP for a record still awaiting verification (expired, locked
// or never received). Server enforces a cooldown and a resend cap.
export async function resendServiceOtp(serviceRecordId: string): Promise<OtpIssueResult & { resendsLeft?: number }> {
    return invokeFunction('service-otp-resend', { serviceRecordId });
}

// Verifies the customer OTP. A wrong/expired code is a normal outcome
// ({ ok:false, reason, remainingAttempts }), not an exception.
export async function verifyServiceOtp(serviceRecordId: string, otp: string): Promise<{ ok: boolean; reason?: string; remainingAttempts?: number }> {
    return invokeFunction('service-otp-verify', { serviceRecordId, otp });
}

export interface PaymentSummary {
    invoice_number: string;
    status: string;
    customer_pays: number;
    platform_fee: number;
    garage_receives: number;
    verified: boolean;
}

export type AppRole = 'customer' | 'garage' | 'admin' | 'employee' | 'support';

// All roles held by the signed-in user (drives the login "Continue as…" picker).
export async function getMyRoles(): Promise<AppRole[]> {
    const { data, error } = await supabase.rpc('my_roles');
    if (error || !data) return [];
    return (data as AppRole[]) ?? [];
}

// Adds a self-service role (customer <-> garage) to the signed-in number.
// Returns the updated role list.
export async function addMyRole(role: 'customer' | 'garage'): Promise<AppRole[]> {
    const { data, error } = await supabase.rpc('add_my_role', { p_role: role });
    if (error) throw new Error(error.message);
    return (data as AppRole[]) ?? [];
}

export async function completeServicePayment(serviceRecordId: string, method: 'qr' | 'cash'): Promise<PaymentSummary> {
    const { data, error } = await supabase
        .rpc('complete_service_payment', { p_service_record_id: serviceRecordId, p_payment_method: method })
        .single();
    if (error) throw new Error(error.message || 'Payment failed.');
    return data as PaymentSummary;
}

// Fires the invoice notification (push if the customer has the app, else
// WhatsApp) after payment. Best-effort: the payment is already done, so a send
// hiccup must never surface as a payment error — callers ignore rejections.
export async function notifyInvoice(serviceRecordId: string): Promise<void> {
    await invokeFunction('notify-invoice', { serviceRecordId });
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

// ---- Admin: platform-fee overview (what each garage owes / has settled) ----
export interface AdminFeeRow {
    garageId: string;
    name: string;
    outstanding: number;      // owed to KYM right now (ledger balance)
    accrued: number;          // lifetime fees accrued
    settled: number;          // lifetime settled via Razorpay
    lastSettledAt: string | null;
}
export interface AdminFeeOverview {
    totalOutstanding: number;
    totalAccrued: number;
    totalSettled: number;
    garagesOwing: number;
    rows: AdminFeeRow[];
}

// Per-garage fee ledger + settlement rollup for the admin console. Reads are
// permitted for admins by RLS; aggregation is done here (fine at current scale).
export async function getAdminFeeOverview(): Promise<AdminFeeOverview> {
    const [garagesRes, ledgerRes, settleRes] = await Promise.all([
        supabase.from('garages').select('id,name'),
        supabase.from('garage_ledger').select('garage_id,entry_type,amount'),
        supabase.from('fee_settlements').select('garage_id,amount,paid_at').eq('status', 'paid'),
    ]);
    const names = new Map<string, string>();
    for (const g of garagesRes.data ?? []) names.set((g as any).id, (g as any).name);

    const per = new Map<string, AdminFeeRow>();
    const ensure = (gid: string): AdminFeeRow => {
        let r = per.get(gid);
        if (!r) {
            r = { garageId: gid, name: names.get(gid) || '—', outstanding: 0, accrued: 0, settled: 0, lastSettledAt: null };
            per.set(gid, r);
        }
        return r;
    };

    for (const e of ledgerRes.data ?? []) {
        const r = ensure((e as any).garage_id);
        const amt = Number((e as any).amount || 0);
        r.outstanding += amt;
        if ((e as any).entry_type === 'fee_accrued') r.accrued += amt;
    }
    for (const s of settleRes.data ?? []) {
        const r = ensure((s as any).garage_id);
        r.settled += Number((s as any).amount || 0);
        const paid = (s as any).paid_at as string | null;
        if (paid && (!r.lastSettledAt || paid > r.lastSettledAt)) r.lastSettledAt = paid;
    }

    const rows = Array.from(per.values())
        .filter((r) => r.accrued > 0 || r.settled > 0 || Math.abs(r.outstanding) > 0.001)
        .sort((a, b) => b.outstanding - a.outstanding);

    return {
        totalOutstanding: rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0),
        totalAccrued: rows.reduce((s, r) => s + r.accrued, 0),
        totalSettled: rows.reduce((s, r) => s + r.settled, 0),
        garagesOwing: rows.filter((r) => r.outstanding > 0.001).length,
        rows,
    };
}

// Completed/in-flight service records for a garage, newest first.
export async function getGarageServiceRecords(garageId: string): Promise<ServiceRecordRow[]> {
    const { data, error } = await supabase
        .from('service_records')
        .select('*')
        .eq('garage_id', garageId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('getGarageServiceRecords error', error);
        return [];
    }
    return (data ?? []) as ServiceRecordRow[];
}

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
    return (data ?? []).map((r: any) => ({ _id: r.id, rating: r.rating, comment: r.comment, createdAt: r.created_at }));
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

// ---- Garage service catalog (garage_services) ----
export interface OfferedServiceRow {
    _id: string;
    name: string;
    description: string | null;
    price: number;
    duration: number;
    isActive: boolean;
}
function mapOfferedService(s: any): OfferedServiceRow {
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
// Live chat support
// ============================================================================
export type SupportTicketStatus = 'open' | 'claimed' | 'resolved';

export interface SupportTicket {
    id: string;
    opener_profile_id: string;
    opener_role: string;
    opener_name: string | null;
    opener_phone: string | null;
    subject: string | null;
    status: SupportTicketStatus;
    claimed_by: string | null;
    claimed_at: string | null;
    last_message_at: string;
    created_at: string;
}

export interface SupportMessage {
    id: string;
    ticket_id: string;
    sender_profile_id: string;
    sender_kind: 'user' | 'support';
    body: string;
    created_at: string;
}

// ---- user side (customer / garage) ----

// Get-or-create the caller's active support ticket; returns its id.
export async function openMyTicket(openerRole: 'customer' | 'garage'): Promise<string> {
    const { data, error } = await supabase.rpc('open_support_ticket', { p_opener_role: openerRole });
    if (error) throw new Error(error.message);
    return data as string;
}

export async function getTicket(ticketId: string): Promise<SupportTicket | null> {
    const { data, error } = await supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
    if (error) { console.error('getTicket error', error); return null; }
    return (data as SupportTicket) ?? null;
}

export async function getTicketMessages(ticketId: string): Promise<SupportMessage[]> {
    const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
    if (error) { console.error('getTicketMessages error', error); return []; }
    return (data ?? []) as SupportMessage[];
}

export async function sendSupportMessage(
    ticketId: string,
    senderProfileId: string,
    body: string,
    kind: 'user' | 'support',
): Promise<SupportMessage> {
    const { data, error } = await supabase
        .from('support_messages')
        .insert({
            ticket_id: ticketId,
            sender_profile_id: senderProfileId,
            sender_kind: kind,
            body: body.trim(),
        })
        .select('*')
        .single();
    if (error) throw new Error(error.message);
    return data as SupportMessage;
}

// ---- support side ----

// Unclaimed tickets awaiting an agent (oldest first).
export async function getOpenTickets(): Promise<SupportTicket[]> {
    const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('status', 'open')
        .order('last_message_at', { ascending: true });
    if (error) { console.error('getOpenTickets error', error); return []; }
    return (data ?? []) as SupportTicket[];
}

// Tickets this agent has claimed and not yet resolved (most recent activity first).
export async function getMyClaimedTickets(profileId: string): Promise<SupportTicket[]> {
    const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('claimed_by', profileId)
        .eq('status', 'claimed')
        .order('last_message_at', { ascending: false });
    if (error) { console.error('getMyClaimedTickets error', error); return []; }
    return (data ?? []) as SupportTicket[];
}

// Atomically claim an unclaimed ticket. Throws 'ticket already claimed' if another agent won.
export async function claimTicket(ticketId: string): Promise<SupportTicket> {
    const { data, error } = await supabase.rpc('claim_support_ticket', { p_ticket_id: ticketId });
    if (error) throw new Error(error.message);
    return data as SupportTicket;
}

export async function resolveTicket(ticketId: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_support_ticket', { p_ticket_id: ticketId });
    if (error) throw new Error(error.message);
}

// ---- realtime helpers (return an unsubscribe function) ----

export function subscribeToTicketMessages(ticketId: string, onInsert: (m: SupportMessage) => void): () => void {
    const channel = supabase
        .channel(`support_messages:${ticketId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` },
            (payload) => onInsert(payload.new as SupportMessage),
        )
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}

export function subscribeToTicket(ticketId: string, onUpdate: (t: SupportTicket) => void): () => void {
    const channel = supabase
        .channel(`support_ticket:${ticketId}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
            (payload) => onUpdate(payload.new as SupportTicket),
        )
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}

// Any change to the ticket queue (new ticket, claim, resolve) — refetch on fire.
export function subscribeToTicketQueue(onChange: () => void): () => void {
    const channel = supabase
        .channel('support_tickets_queue')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => onChange())
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}

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

// True if the profile has at least one active device — used by the router to
// choose push vs WhatsApp.
export async function hasActiveDevice(profileId: string): Promise<boolean> {
    const { count, error } = await supabase
        .from('user_devices')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('is_active', true);
    if (error) { console.error('hasActiveDevice error', error); return false; }
    return (count ?? 0) > 0;
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
