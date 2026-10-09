import { supabase } from '../supabase';
import { invokeFunction } from './core';

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
    created_by_profile_id: string | null;
    performed_by_name: string | null;
    vehicle_type: string | null;
    vehicle_make_code: string | null;
    vehicle_model_code: string | null;
    vehicle_make_other: string | null;
    vehicle_model_other: string | null;
    model_year: number | null;
    odometer_km: number | null;
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

