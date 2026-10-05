import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimeRangePickerProps {
    value: string; // "9:00 AM - 8:00 PM"
    onChange: (value: string) => void;
}

const timeOptions = [
    '12:00 AM', '12:30 AM',
    '1:00 AM', '1:30 AM', '2:00 AM', '2:30 AM', '3:00 AM', '3:30 AM',
    '4:00 AM', '4:30 AM', '5:00 AM', '5:30 AM', '6:00 AM', '6:30 AM',
    '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM',
    '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
    '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM',
    '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM',
    '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM',
];

// Convert time string to minutes for comparison
const timeToMinutes = (timeStr: string): number => {
    const [time, period] = timeStr.trim().split(' ');
    const [h, minutes] = time.split(':').map(Number);
    let hours = h;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
};

export default function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
    const [openTime, setOpenTime] = useState('9:00 AM');
    const [closeTime, setCloseTime] = useState('8:00 PM');

    useEffect(() => {
        // Sync from the value like "9:00 AM - 8:00 PM" — including when it
        // arrives after mount (e.g. Settings loading the saved hours).
        if (value && value.includes(' - ')) {
            const [open, close] = value.split(' - ');
            if (open) setOpenTime(open.trim());
            if (close) setCloseTime(close.trim());
        }
    }, [value]);

    // Filter closing times to only show times after opening time
    const getCloseTimeOptions = () => {
        const openMinutes = timeToMinutes(openTime);
        return timeOptions.filter(time => timeToMinutes(time) > openMinutes);
    };

    const handleChange = (type: 'open' | 'close', time: string) => {
        if (type === 'open') {
            setOpenTime(time);
            // If current close time is before new open time, auto-adjust
            const openMinutes = timeToMinutes(time);
            const closeMinutes = timeToMinutes(closeTime);
            if (closeMinutes <= openMinutes) {
                // Find next available time slot (at least 30 min after open)
                const nextValidClose = timeOptions.find(t => timeToMinutes(t) > openMinutes) || '11:30 PM';
                setCloseTime(nextValidClose);
                onChange(`${time} - ${nextValidClose}`);
            } else {
                onChange(`${time} - ${closeTime}`);
            }
        } else {
            setCloseTime(time);
            onChange(`${openTime} - ${time}`);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-500 dark:text-[var(--app-muted)] text-xs font-medium mb-1">
                <Clock className="w-4 h-4" />
                <span>Service Hours</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <label className="block text-xs text-slate-400 dark:text-[var(--app-muted)] mb-1">Opens at</label>
                    <select
                        value={openTime}
                        onChange={(e) => handleChange('open', e.target.value)}
                        className="w-full px-3 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)] text-sm font-medium"
                    >
                        {timeOptions.map((time) => (
                            <option key={time} value={time}>{time}</option>
                        ))}
                    </select>
                </div>
                <div className="text-slate-300 dark:text-slate-600 font-bold pt-5">—</div>
                <div className="flex-1">
                    <label className="block text-xs text-slate-400 dark:text-[var(--app-muted)] mb-1">Closes at</label>
                    <select
                        value={closeTime}
                        onChange={(e) => handleChange('close', e.target.value)}
                        className="w-full px-3 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)] text-sm font-medium"
                    >
                        {getCloseTimeOptions().map((time) => (
                            <option key={time} value={time}>{time}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
