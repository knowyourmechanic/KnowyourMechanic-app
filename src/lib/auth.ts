import { Capacitor } from '@capacitor/core';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const isNative = Capacitor.isNativePlatform();

// Phone for the OTP currently in flight (needed by verifyOtp).
let pendingPhone: string | null = null;

function toE164(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    const national = digits.length > 10 ? digits.slice(-10) : digits;
    return `+91${national}`;
}

// Sends an SMS OTP via Supabase Auth (which delivers through the MSG91 hook).
export async function sendOtp(phoneNumber: string): Promise<void> {
    const phone = toE164(phoneNumber);
    pendingPhone = phone;
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
        throw new Error(error.message || 'Could not send OTP.');
    }
}

// Verifies the OTP and returns the signed-in Supabase user.
export async function verifyOtp(code: string): Promise<User> {
    if (!pendingPhone) {
        throw new Error('No OTP in progress. Please request a code again.');
    }
    const { data, error } = await supabase.auth.verifyOtp({
        phone: pendingPhone,
        token: code.trim(),
        type: 'sms',
    });
    if (error || !data.user) {
        throw new Error(error?.message || 'Invalid OTP.');
    }
    pendingPhone = null;
    return data.user;
}

export async function signOut(): Promise<void> {
    await supabase.auth.signOut();
}
