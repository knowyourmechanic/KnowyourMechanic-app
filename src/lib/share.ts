import { Capacitor } from '@capacitor/core';

// Public web origin for links that leave the app (vehicle passport). The native
// app runs on capacitor://localhost, so it needs the deployed site's URL.
export function publicWebUrl(path: string): string | null {
    const configured = import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined;
    const base = configured
        || (typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? window.location.origin : '');
    return base ? `${base.replace(/\/$/, '')}${path}` : null;
}

// Native share sheet on device (free @capacitor/share), Web Share API in
// browsers that have it, else copy to clipboard. Returns how it was shared.
export async function shareLink(opts: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled'> {
    try {
        if (Capacitor.isNativePlatform()) {
            const { Share } = await import('@capacitor/share');
            await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
            return 'shared';
        }
        if (navigator.share) {
            await navigator.share(opts);
            return 'shared';
        }
    } catch {
        return 'cancelled';
    }
    await navigator.clipboard.writeText(`${opts.text} ${opts.url}`);
    return 'copied';
}

// Opens the user's own WhatsApp with a prefilled message (no API, no cost).
export function whatsappShareUrl(text: string): string {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
