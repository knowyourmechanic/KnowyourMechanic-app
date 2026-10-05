// Opening-hours helpers shared by the customer and garage screens.
// Service hours are stored as "9:00 AM - 8:00 PM" (see TimeRangePicker);
// working days as short names, e.g. ['Mon', 'Tue', ...].

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMinutes(hour: string, min: string, period: string): number {
    let h = parseInt(hour, 10) % 12;
    if (period.toUpperCase() === 'PM') h += 12;
    return h * 60 + parseInt(min, 10);
}

export function parseServiceHours(serviceHours?: string | null): { open: number; close: number; closeLabel: string; openLabel: string } | null {
    const m = (serviceHours || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    const [, oh, om, op, ch, cm, cp] = m;
    return {
        open: toMinutes(oh, om, op),
        close: toMinutes(ch, cm, cp),
        openLabel: `${oh}:${om} ${op.toUpperCase()}`,
        closeLabel: `${ch}:${cm} ${cp.toUpperCase()}`,
    };
}

export function normalizeWorkingDays(days?: string[] | string | null): string[] {
    if (!days) return [];
    const list = Array.isArray(days) ? days : days.split(',');
    return list.map((d) => d.trim()).filter(Boolean);
}

export interface OpenStatus {
    known: boolean;     // false when hours couldn't be parsed
    isOpen: boolean;
    label: string;      // "Open · closes 8:00 PM", "Closed · opens 9:00 AM", …
}

// Whether the garage is open right now. Overnight ranges ("10:00 PM - 2:00 AM")
// wrap past midnight. When working days are given, a day off is always closed.
export function getOpenStatus(serviceHours?: string | null, workingDays?: string[] | string | null, now = new Date()): OpenStatus {
    const hours = parseServiceHours(serviceHours);
    if (!hours) return { known: false, isOpen: false, label: 'Hours not listed' };

    const days = normalizeWorkingDays(workingDays);
    const today = DAY_NAMES[now.getDay()];
    if (days.length > 0 && !days.includes(today)) {
        return { known: true, isOpen: false, label: 'Closed today' };
    }

    const cur = now.getHours() * 60 + now.getMinutes();
    const isOpen = hours.close <= hours.open
        ? cur >= hours.open || cur < hours.close
        : cur >= hours.open && cur < hours.close;

    return {
        known: true,
        isOpen,
        label: isOpen ? `Open · closes ${hours.closeLabel}` : `Closed · opens ${hours.openLabel}`,
    };
}
