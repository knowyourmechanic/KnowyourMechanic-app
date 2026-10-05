import { useCallback, useEffect, useState } from 'react';

// Seconds remaining until a deadline. Computed from the clock (not by counting
// ticks), so it stays correct when the app is backgrounded and timers pause —
// e.g. while the user switches to their SMS app to read a code.
export function useCountdown(): [number, (seconds: number) => void] {
    const [deadline, setDeadline] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (deadline <= Date.now()) return;
        const id = setInterval(() => setNow(Date.now()), 250);
        const onVisible = () => setNow(Date.now());
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [deadline]);

    const start = useCallback((seconds: number) => {
        const t = Date.now();
        setNow(t);
        setDeadline(seconds > 0 ? t + seconds * 1000 : 0);
    }, []);

    return [Math.max(0, Math.ceil((deadline - now) / 1000)), start];
}
