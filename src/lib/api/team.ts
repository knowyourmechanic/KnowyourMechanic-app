import { supabase } from '../supabase';
import type { Enums, Tables } from '../database.types';

// Garage owners + their employees ("garage staff"). Not KYM's own field
// employees (app_role 'employee'). See supabase/GARAGE_STAFF.md.

export type MemberRole = 'owner' | 'staff';
export type MemberStatus = 'pending' | 'active' | 'removed' | 'rejected';

export interface GarageMembership {
    garageId: string;
    garageName: string;
    memberRole: MemberRole;
    status: MemberStatus;
    ownerConfirmed: boolean;
    onboardingComplete: boolean;
    onboardedByMe: boolean;
}

// Where the signed-in person belongs (owner of / employee at / waiting to join).
export async function getMyGarageMembership(): Promise<GarageMembership | null> {
    const { data, error } = await supabase.rpc('my_garage_membership');
    if (error || !data || data.length === 0) return null;
    const m = data[0];
    return {
        garageId: m.garage_id,
        garageName: m.garage_name,
        memberRole: m.member_role as MemberRole,
        status: m.status as MemberStatus,
        ownerConfirmed: !!m.owner_confirmed,
        onboardingComplete: m.onboarding_status === 'completed',
        onboardedByMe: !!m.onboarded_by_me,
    };
}

export interface GarageContext {
    garage: Tables<'garages'>;
    role: MemberRole;
}

// The garage this person works in (as owner or active employee), with their role.
export async function getMyGarageContext(): Promise<GarageContext | null> {
    const m = await getMyGarageMembership();
    if (!m || m.status !== 'active') return null;
    const { data, error } = await supabase.from('garages').select('*').eq('id', m.garageId).maybeSingle();
    if (error || !data) return null;
    return { garage: data, role: m.memberRole };
}

export interface OwnerGarageMatch { garageId: string; garageName: string; address: string | null }

export async function findGaragesByOwnerPhone(phone: string): Promise<OwnerGarageMatch[]> {
    const { data, error } = await supabase.rpc('find_garages_by_owner_phone', { p_owner_phone: phone });
    if (error) throw new Error(error.message);
    return (data ?? []).map((g) => ({ garageId: g.garage_id, garageName: g.garage_name, address: g.address }));
}

export async function requestToJoinGarage(garageId: string, myName: string): Promise<void> {
    const { error } = await supabase.rpc('request_to_join_garage', { p_garage_id: garageId, p_display_name: myName });
    if (error) throw new Error(error.message);
}

export async function cancelJoinRequest(): Promise<void> {
    const { error } = await supabase.rpc('cancel_join_request');
    if (error) throw new Error(error.message);
}

export async function leaveGarage(): Promise<void> {
    const { error } = await supabase.rpc('leave_garage');
    if (error) throw new Error(error.message);
}

export interface StaffGarageSetup {
    ownerPhone: string;
    ownerName: string;
    staffName: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    coordinates: [number, number]; // [lng, lat]
    serviceHours: string;
    workingDays: string[];
    businessType: string;
    legalBusinessName: string;
}

// An employee sets up the garage for an owner who isn't on KYM yet. Returns the
// garage id. It works at once but stays out of search until the owner confirms.
export async function createGarageAsStaff(p: StaffGarageSetup): Promise<string> {
    const { data, error } = await supabase.rpc('create_garage_as_staff', {
        p_owner_phone: p.ownerPhone,
        p_owner_name: p.ownerName,
        p_staff_name: p.staffName,
        p_name: p.name.trim(),
        p_email: p.email.trim(),
        p_phone: p.phone,
        p_address: p.address,
        p_latitude: p.coordinates[1],
        p_longitude: p.coordinates[0],
        p_service_hours: p.serviceHours,
        p_working_days: p.workingDays,
        p_business_type: p.businessType as Enums<'business_type'>,
        p_legal_business_name: p.legalBusinessName,
    });
    if (error || !data) throw new Error(error?.message || 'Could not set up the garage.');
    return data;
}

// The owner answers "is this your garage?" for one an employee set up.
export async function respondToGarageClaim(garageId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_to_garage_claim', { p_garage_id: garageId, p_accept: accept });
    if (error) throw new Error(error.message);
}

// Who set the garage up (shown on the owner's confirm screen).
export async function getGarageSetupBy(garageId: string): Promise<string | null> {
    const { data } = await supabase
        .from('garage_members')
        .select('display_name, requested_by, member_role')
        .eq('garage_id', garageId)
        .eq('member_role', 'staff')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    return data?.display_name ?? null;
}

// ---- Owner: team ------------------------------------------------------------
export interface TeamMember {
    memberId: string;
    profileId: string;
    name: string;
    phone: string;
    status: MemberStatus;
    requestedBy: string;
    joinedAt: string | null;
    endedAt: string | null;
    jobsTotal: number;
    jobs30d: number;
    customerAvg: number | null;
    customerCount: number;
    ownerRating: number | null;
    ownerNote: string | null;
}

export async function getGarageTeam(garageId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase.rpc('garage_team', { p_garage_id: garageId });
    if (error) throw new Error(error.message);
    return (data ?? []).map((m) => ({
        memberId: m.member_id,
        profileId: m.profile_id,
        name: m.name || '',
        phone: m.phone,
        status: m.status as MemberStatus,
        requestedBy: m.requested_by,
        joinedAt: m.joined_at,
        endedAt: m.ended_at,
        jobsTotal: Number(m.jobs_total),
        jobs30d: Number(m.jobs_30d),
        customerAvg: m.customer_avg == null ? null : Number(m.customer_avg),
        customerCount: Number(m.customer_count),
        ownerRating: m.owner_rating,
        ownerNote: m.owner_note,
    }));
}

export async function respondJoinRequest(memberId: string, approve: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_join_request', { p_member_id: memberId, p_approve: approve });
    if (error) throw new Error(error.message);
}

export async function addStaffByPhone(garageId: string, phone: string, name: string): Promise<void> {
    const { error } = await supabase.rpc('add_staff_by_phone', { p_garage_id: garageId, p_phone: phone, p_name: name });
    if (error) throw new Error(error.message);
}

export async function removeStaff(memberId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_staff', { p_member_id: memberId });
    if (error) throw new Error(error.message);
}

export async function rateStaff(memberId: string, rating: number, note: string): Promise<void> {
    const { error } = await supabase.rpc('rate_staff', { p_member_id: memberId, p_rating: rating, p_note: note });
    if (error) throw new Error(error.message);
}

// ---- Work history (portable across garages) ---------------------------------------
export interface WorkStint {
    memberId: string;
    garageName: string;
    status: MemberStatus;
    joinedAt: string | null;
    endedAt: string | null;
    jobsCompleted: number;
    customerAvg: number | null;
    customerCount: number;
    ownerRating: number | null;
    ownerNote: string | null;
}
export interface WorkHistory {
    stints: WorkStint[];
    jobsCompleted: number;
    customerAvg: number | null;   // weighted by number of ratings
    customerCount: number;
    ownerAvg: number | null;
    ownerCount: number;
}

// Own history, or (for an owner) the history of someone joining/working at their garage.
export async function getWorkHistory(profileId?: string): Promise<WorkHistory> {
    const { data, error } = await supabase.rpc('staff_work_history', profileId ? { p_profile_id: profileId } : {});
    if (error) throw new Error(error.message);
    const stints: WorkStint[] = (data ?? []).map((s) => ({
        memberId: s.member_id,
        garageName: s.garage_name,
        status: s.status as MemberStatus,
        joinedAt: s.joined_at,
        endedAt: s.ended_at,
        jobsCompleted: Number(s.jobs_completed),
        customerAvg: s.customer_avg == null ? null : Number(s.customer_avg),
        customerCount: Number(s.customer_count),
        ownerRating: s.owner_rating,
        ownerNote: s.owner_note,
    }));
    const customerCount = stints.reduce((n, s) => n + s.customerCount, 0);
    const weighted = stints.reduce((n, s) => n + (s.customerAvg ?? 0) * s.customerCount, 0);
    const rated = stints.filter((s) => s.ownerRating != null);
    return {
        stints,
        jobsCompleted: stints.reduce((n, s) => n + s.jobsCompleted, 0),
        customerAvg: customerCount ? Math.round((weighted / customerCount) * 10) / 10 : null,
        customerCount,
        ownerAvg: rated.length ? Math.round((rated.reduce((n, s) => n + (s.ownerRating ?? 0), 0) / rated.length) * 10) / 10 : null,
        ownerCount: rated.length,
    };
}

// ---- Customer: rate a service ------------------------------------------------------
export async function rateService(serviceRecordId: string, rating: number, comment?: string): Promise<void> {
    const { error } = await supabase.rpc('rate_service', {
        p_service_record_id: serviceRecordId,
        p_rating: rating,
        p_comment: comment ?? undefined,
    });
    if (error) throw new Error(error.message);
}

export async function getMyServiceRatings(serviceRecordIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (serviceRecordIds.length === 0) return out;
    const { data } = await supabase
        .from('service_ratings')
        .select('service_record_id, rating')
        .in('service_record_id', serviceRecordIds);
    for (const r of data ?? []) out.set(r.service_record_id, r.rating);
    return out;
}

export async function getPendingJoinCount(garageId: string): Promise<number> {
    const { count } = await supabase
        .from('garage_members')
        .select('id', { count: 'exact', head: true })
        .eq('garage_id', garageId)
        .eq('status', 'pending');
    return count ?? 0;
}
