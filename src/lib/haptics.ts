import { Capacitor } from '@capacitor/core';

// Tactile feedback for key moments (OTP verified, service completed, errors).
// Native Taptic/vibration via @capacitor/haptics; navigator.vibrate on the web.
// Always fire-and-forget: feedback must never break a flow.
type Kind = 'tap' | 'success' | 'warning' | 'error';

export function haptic(kind: Kind = 'tap'): void {
    if (Capacitor.isNativePlatform()) {
        import('@capacitor/haptics')
            .then(({ Haptics, ImpactStyle, NotificationType }) => {
                if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light });
                const type = kind === 'success' ? NotificationType.Success
                    : kind === 'warning' ? NotificationType.Warning : NotificationType.Error;
                return Haptics.notification({ type });
            })
            .catch(() => {});
        return;
    }
    try {
        navigator.vibrate?.(kind === 'tap' ? 10 : kind === 'success' ? [15, 40, 15] : [40, 30, 40]);
    } catch {
        /* unsupported */
    }
}
