// Readable message from anything thrown (Error, Supabase error object, string).
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (e instanceof Error && e.message) return e.message;
    if (typeof e === 'object' && e !== null && 'message' in e) {
        const m = (e as { message: unknown }).message;
        if (typeof m === 'string' && m) return m;
    }
    if (typeof e === 'string' && e) return e;
    return fallback;
}
