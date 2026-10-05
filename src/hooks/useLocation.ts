import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

interface LocationState {
    lat: number;
    lng: number;
}

// Default to Pune coordinates — used until a real fix arrives, or if location is
// unavailable/denied, so discovery always has a usable centre.
const DEFAULT_LOCATION: LocationState = {
    lat: 18.5204,
    lng: 73.8567,
};

export function useLocation() {
    const [location, setLocation] = useState<LocationState>(DEFAULT_LOCATION);
    const [loading, setLoading] = useState(true);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const requestLocation = useCallback(() => {
        let settled = false;
        setLoading(true);
        setPermissionDenied(false);

        const finish = (loc: LocationState | null, denied = false) => {
            if (settled) return;
            settled = true;
            if (loc) setLocation(loc);
            setPermissionDenied(denied);
            setLoading(false);
        };

        // Safety net: never leave the UI stuck on "Locating…" (which also blocks
        // garage discovery). If nothing resolves in time, fall back to the default.
        const timer = setTimeout(() => finish(null, false), 12000);

        (async () => {
            try {
                if (Capacitor.isNativePlatform()) {
                    // Native: the Capacitor Geolocation plugin handles the OS
                    // permission prompt and gives a reliable fix. (The web
                    // navigator.geolocation API is flaky inside the WKWebView/
                    // Android WebView and can hang indefinitely.)
                    try { await Geolocation.requestPermissions(); } catch { /* getCurrentPosition will throw if truly denied */ }
                    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
                    clearTimeout(timer);
                    finish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    return;
                }

                // Web fallback.
                if (!('geolocation' in navigator)) {
                    clearTimeout(timer);
                    finish(null, false);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        clearTimeout(timer);
                        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    },
                    (err) => {
                        clearTimeout(timer);
                        finish(null, err.code === err.PERMISSION_DENIED);
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
                );
            } catch {
                // Permission denied or location unavailable → keep the default centre.
                clearTimeout(timer);
                finish(null, true);
            }
        })();
    }, []);

    useEffect(() => { requestLocation(); }, [requestLocation]);

    return { location, loading, permissionDenied, requestLocation };
}
