import { supabase } from '../supabase';

// Admin / employee consoles. Aggregates are computed in Postgres
// (admin_overview_stats, garage_service_metrics, admin_fee_overview) so the
// browser never downloads every service record.

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

interface OverviewJson {
    totalGarages: number;
    totalCustomers: number;
    totalUsers: number;
    totalEmployees: number;
    referredGarages: number;
    totalServices: number;
    totalRevenue: number;
    totalGMV: number;
    totalVehicles: number;
    daily: { date: string; count: number; revenue: number }[];
}

async function getOverview(days = 30): Promise<OverviewJson> {
    const { data, error } = await supabase.rpc('admin_overview_stats', { p_days: days });
    if (error || !data) throw new Error(error?.message || 'Could not load stats.');
    return data as unknown as OverviewJson;
}

export async function getAdminStats(days = 30): Promise<AdminStats> {
    const o = await getOverview(days);
    const daily = (o.daily ?? []).map((d) => ({ date: d.date, count: Number(d.count), revenue: Number(d.revenue) }));
    const inRange = daily.reduce((s, d) => s + d.count, 0);
    return {
        totalGarages: o.totalGarages,
        totalCustomers: o.totalCustomers,
        totalEmployees: o.totalEmployees,
        totalServices: o.totalServices,
        totalRevenue: Number(o.totalRevenue),
        totalGMV: Number(o.totalGMV),
        avgServicesPerDay: (inRange / Math.max(days, 1)).toFixed(1),
        referredGarages: o.referredGarages,
        dailyBreakdown: daily,
    };
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
    const o = await getOverview(30);
    // MRR = platform fees over the last 30 days; ARR extrapolates it.
    const mrr = (o.daily ?? []).reduce((s, d) => s + Number(d.revenue), 0);
    return {
        totalUsers: o.totalUsers,
        totalVehicles: o.totalVehicles,
        totalGarages: o.totalGarages,
        mrr,
        arr: mrr * 12,
        allTimeGMV: Number(o.totalGMV),
    };
}

// Completed-service totals per garage (RLS-equivalent scoping server-side).
type Metrics = { services: number; gmv: number; fees: number; last30d: number };
export async function getGarageMetrics(garageIds?: string[]): Promise<Map<string, Metrics>> {
    const { data, error } = await supabase.rpc('garage_service_metrics', garageIds ? { p_garage_ids: garageIds } : {});
    const out = new Map<string, Metrics>();
    if (error) {
        console.error('garage_service_metrics error', error);
        return out;
    }
    for (const r of data ?? []) {
        out.set(r.garage_id, { services: Number(r.services), gmv: Number(r.gmv), fees: Number(r.fees), last30d: Number(r.last_30d) });
    }
    return out;
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
    isListed: boolean;          // finished onboarding -> shown in discovery (not a vetting badge)
    referredBy?: { name: string; referralCode: string };
}

export async function getAdminGarages(): Promise<AdminGarageItem[]> {
    const [{ data, error }, metrics] = await Promise.all([
        supabase
            .from('garages')
            .select('id,name,address,latitude,longitude,phone,rating,total_reviews,onboarding_status,is_verified, referrer:assigned_employee_id(name,referral_code)')
            .order('created_at', { ascending: false })
            .limit(300),
        getGarageMetrics(),
    ]);
    if (error) {
        console.error('getAdminGarages error', error);
        return [];
    }
    return (data ?? []).map((g) => ({
        _id: g.id,
        name: g.name,
        location: { address: g.address || '', coordinates: [Number(g.longitude) || 0, Number(g.latitude) || 0] },
        phone: g.phone || '',
        rating: Number(g.rating) || 0,
        totalReviews: g.total_reviews || 0,
        serviceCount: metrics.get(g.id)?.services ?? 0,
        totalEarnings: metrics.get(g.id)?.gmv ?? 0,
        onboardingStatus: g.onboarding_status || 'pending',
        isListed: g.is_verified,
        referredBy: g.referrer ? { name: g.referrer.name, referralCode: g.referrer.referral_code } : undefined,
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
        supabase.from('garages').select('assigned_employee_id').not('assigned_employee_id', 'is', null),
    ]);
    const counts = new Map<string, number>();
    for (const g of gar ?? []) {
        if (g.assigned_employee_id) counts.set(g.assigned_employee_id, (counts.get(g.assigned_employee_id) ?? 0) + 1);
    }
    return (emps ?? []).map((e) => ({
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

// Referral codes are unguessable (not Math.random): they gate employee credit.
function newReferralCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'KYM-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') +
        alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
}

export async function createAdminEmployee(p: { name: string; email: string; phone: string }): Promise<void> {
    const { error } = await supabase.from('employees').insert({
        name: p.name,
        email: p.email || null,
        phone: p.phone.replace(/\D/g, '').slice(-10),
        referral_code: newReferralCode(),
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
    const [emps, { data: gar }, metrics] = await Promise.all([
        getAdminEmployees(),
        supabase.from('garages').select('id,assigned_employee_id').not('assigned_employee_id', 'is', null),
        getGarageMetrics(),
    ]);
    const byEmp = new Map<string, { services: number; revenue: number; last30d: number }>();
    for (const g of gar ?? []) {
        const m = metrics.get(g.id);
        if (!m || !g.assigned_employee_id) continue;
        const a = byEmp.get(g.assigned_employee_id) ?? { services: 0, revenue: 0, last30d: 0 };
        a.services += m.services;
        a.revenue += m.fees;
        a.last30d += m.last30d;
        byEmp.set(g.assigned_employee_id, a);
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
            avgTransactionsPerDay: ((byEmp.get(e._id)?.last30d ?? 0) / 30).toFixed(1),
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
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
    return (data ?? []).map((r) => ({
        _id: r.id,
        reporterId: { name: r.reporter?.name ?? undefined, phoneNumber: r.reporter?.phone_number || '' },
        garageId: { _id: r.garage_id, name: r.garage?.name || '' },
        reason: r.reason,
        description: r.description || '',
        status: r.status,
        createdAt: r.created_at,
    }));
}

export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';
export async function updateReportStatus(id: string, status: ReportStatus): Promise<void> {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
}

// ---- Employee views -------------------------------------------------------
interface EmployeeGarageCard {
    _id: string;
    name: string;
    location: { address: string; coordinates: [number, number] };
    rating: number;
    totalReviews: number;
    totalServices: number;
    totalEarnings: number;
    avgServicesPerDay: string;
}

async function employeeGarages(employeeId: string): Promise<EmployeeGarageCard[]> {
    const { data } = await supabase
        .from('garages')
        .select('id,name,address,latitude,longitude,rating,total_reviews')
        .eq('assigned_employee_id', employeeId);
    const rows = data ?? [];
    const metrics = rows.length ? await getGarageMetrics(rows.map((g) => g.id)) : new Map<string, Metrics>();
    return rows.map((g) => {
        const m = metrics.get(g.id);
        return {
            _id: g.id,
            name: g.name,
            location: { address: g.address || '', coordinates: [Number(g.longitude) || 0, Number(g.latitude) || 0] as [number, number] },
            rating: Number(g.rating) || 0,
            totalReviews: g.total_reviews || 0,
            totalServices: m?.services ?? 0,
            totalEarnings: m?.gmv ?? 0,
            avgServicesPerDay: ((m?.last30d ?? 0) / 30).toFixed(1),
        };
    });
}

export interface EmployeeDashboard {
    profile: { name: string; referralCode: string } | null;
    stats: { totalGarages: number; totalServices: number; totalEarnings: number; avgServicesPerDay: string } | null;
    garages: EmployeeGarageCard[];
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

    const garages = await employeeGarages(emp.id);
    const totalServices = garages.reduce((s, g) => s + g.totalServices, 0);
    const per30 = garages.reduce((s, g) => s + Number(g.avgServicesPerDay), 0);
    return {
        profile: { name: emp.name, referralCode: emp.referral_code },
        stats: {
            totalGarages: garages.length,
            totalServices,
            totalEarnings: garages.reduce((s, g) => s + g.totalEarnings, 0),
            avgServicesPerDay: per30.toFixed(1),
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

export interface EmployeeDetailData {
    employee: { name: string; email: string; phone: string; isActive: boolean; createdAt: string; referralCode: string };
    garages: EmployeeGarageCard[];
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
    const garages = await employeeGarages(emp.id);
    const totalServices = garages.reduce((s, g) => s + g.totalServices, 0);
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
            totalEarnings: garages.reduce((s, g) => s + g.totalEarnings, 0),
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

// ---- Platform fees ----------------------------------------------------------
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

export async function getAdminFeeOverview(): Promise<AdminFeeOverview> {
    const { data, error } = await supabase.rpc('admin_fee_overview');
    if (error) throw new Error(error.message);
    const rows: AdminFeeRow[] = (data ?? []).map((r) => ({
        garageId: r.garage_id,
        name: r.name || '—',
        outstanding: Number(r.outstanding),
        accrued: Number(r.accrued),
        settled: Number(r.settled),
        lastSettledAt: r.last_settled_at,
    }));
    return {
        totalOutstanding: rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0),
        totalAccrued: rows.reduce((s, r) => s + r.accrued, 0),
        totalSettled: rows.reduce((s, r) => s + r.settled, 0),
        garagesOwing: rows.filter((r) => r.outstanding > 0.001).length,
        rows,
    };
}
