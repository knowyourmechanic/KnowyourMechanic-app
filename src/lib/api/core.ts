import { supabase } from '../supabase';

// Calls an Edge Function and returns its JSON. supabase-js turns every non-2xx
// into an opaque "Edge Function returned a non-2xx status code" error whose
// `context` is the raw Response — read it so callers see the server's own
// message (e.g. "Please settle your pending platform fees…"). A 4xx body that
// carries `ok: false` is a business outcome, not an exception, so it is
// returned as data.
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
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

