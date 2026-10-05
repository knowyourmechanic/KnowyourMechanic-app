import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { saveDeviceToken, ackNotificationDelivery } from '../lib/data';

/**
 * Native push (FCM) for the logged-in user.
 * - Registers the device and stores its FCM token in `user_devices`, so the
 *   delivery router knows this user "has the app".
 * - Acks incoming OTP/invoice pushes (delivery id travels in the payload) so the
 *   WhatsApp fallback worker skips them.
 * No-op on web — FCM is native-only.
 */
export function useNotifications(profileId?: string, onPush?: () => void) {
    const registered = useRef(false);
    const onPushRef = useRef(onPush);
    onPushRef.current = onPush;

    useEffect(() => {
        if (!Capacitor.isNativePlatform() || !profileId || registered.current) return;
        registered.current = true;

        const handles: Array<{ remove: () => void }> = [];

        (async () => {
            try {
                const { PushNotifications } = await import('@capacitor/push-notifications');

                let perm = await PushNotifications.checkPermissions();
                if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
                    perm = await PushNotifications.requestPermissions();
                }
                if (perm.receive !== 'granted') { registered.current = false; return; }

                await PushNotifications.register();

                handles.push(await PushNotifications.addListener('registration', async (token) => {
                    try {
                        await saveDeviceToken(token.value, Capacitor.getPlatform());
                    } catch (e) {
                        console.error('saveDeviceToken failed', e);
                    }
                }));

                handles.push(await PushNotifications.addListener('registrationError', (err) => {
                    console.error('push registration error', err);
                }));

                const handleIncoming = (data: Record<string, string> | undefined) => {
                    const deliveryId = data?.delivery_id;
                    if (deliveryId) ackNotificationDelivery(deliveryId).catch(() => {});
                    onPushRef.current?.();
                };

                handles.push(await PushNotifications.addListener('pushNotificationReceived', (n) => handleIncoming(n.data)));
                handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (a) => handleIncoming(a.notification.data)));
            } catch (e) {
                console.error('push setup failed', e);
                registered.current = false;
            }
        })();

        return () => { handles.forEach((h) => h.remove()); };
    }, [profileId]);
}
