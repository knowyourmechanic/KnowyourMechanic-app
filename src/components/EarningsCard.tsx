import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
    title?: string;
    // Completed services only.
    services: { amount: number; createdAt: string }[];
}

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Earnings at a glance: today / 7 days / 30 days, plus a 7-day bar chart.
// One series, one hue (no legend; the title names it). Tap/hover a bar for its
// value; the same numbers are exposed as text for screen readers.
export default function EarningsCard({ services, title }: Props) {
    const { t, locale } = useI18n();
    const [active, setActive] = useState<number | null>(null);

    const { days, today, week, month, jobsToday } = useMemo(() => {
        const todayStart = startOfDay(new Date());
        const buckets = Array.from({ length: 7 }, (_, i) => ({ start: todayStart - (6 - i) * DAY, total: 0, jobs: 0 }));
        let week = 0, month = 0, today = 0, jobsToday = 0;
        for (const s of services) {
            const ts = new Date(s.createdAt).getTime();
            if (ts >= todayStart - 29 * DAY) month += s.amount;
            if (ts >= todayStart - 6 * DAY) week += s.amount;
            if (ts >= todayStart) { today += s.amount; jobsToday += 1; }
            const b = buckets.find((x) => ts >= x.start && ts < x.start + DAY);
            if (b) { b.total += s.amount; b.jobs += 1; }
        }
        return { days: buckets, today, week, month, jobsToday };
    }, [services]);

    const max = Math.max(...days.map((d) => d.total), 1);
    const money = (n: number) => `₹${Math.round(n).toLocaleString(locale)}`;
    const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(locale, { weekday: 'narrow' });
    const shown = active ?? days.length - 1;

    return (
        <section className="bg-white dark:bg-[var(--app-surface)] rounded-3xl border border-slate-100 dark:border-[var(--app-border)] p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-900 dark:text-[var(--app-text)] flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" /> {title ?? t('earnings.title')}
                </h3>
                <span className="text-xs text-slate-400 dark:text-[var(--app-muted)]">{t('earnings.jobsToday', { count: jobsToday })}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                    { label: t('earnings.today'), value: today },
                    { label: t('earnings.week'), value: week },
                    { label: t('earnings.month'), value: month },
                ].map((x) => (
                    <div key={x.label} className="rounded-2xl bg-slate-50 dark:bg-[var(--app-bg)] p-3">
                        <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-[var(--app-muted)]">{x.label}</p>
                        <p className="text-lg font-black text-slate-900 dark:text-[var(--app-text)] tabular-nums">{money(x.value)}</p>
                    </div>
                ))}
            </div>

            {/* Selected bar readout (text tokens, not the series colour) */}
            <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] mb-2 h-4" aria-live="polite">
                {new Date(days[shown].start).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}
                {' · '}<span className="font-bold text-slate-900 dark:text-[var(--app-text)]">{money(days[shown].total)}</span>
                {' · '}{t('earnings.jobs', { count: days[shown].jobs })}
            </p>

            <div className="flex items-end gap-[2px] h-28 border-b border-slate-200 dark:border-[var(--app-border)]" role="img"
                aria-label={t('earnings.chartLabel') + ': ' + days.map((d) => `${new Date(d.start).toLocaleDateString(locale, { weekday: 'short' })} ${money(d.total)}`).join(', ')}>
                {days.map((d, i) => (
                    <button
                        key={d.start}
                        type="button"
                        onClick={() => setActive(i)}
                        onMouseEnter={() => setActive(i)}
                        onMouseLeave={() => setActive(null)}
                        aria-hidden="true"
                        tabIndex={-1}
                        className="flex-1 h-full flex items-end px-1"
                    >
                        <span
                            className={`w-full rounded-t-[4px] transition-all ${i === shown ? 'bg-blue-600 dark:bg-blue-500' : 'bg-blue-600/70 dark:bg-blue-500/60'}`}
                            style={{ height: `${d.total > 0 ? Math.max((d.total / max) * 100, 4) : 0}%` }}
                        />
                    </button>
                ))}
            </div>
            <div className="flex gap-[2px] mt-1">
                {days.map((d, i) => (
                    <span key={d.start} className={`flex-1 text-center text-[10px] ${i === shown ? 'font-bold text-slate-700 dark:text-[var(--app-text)]' : 'text-slate-400 dark:text-[var(--app-muted)]'}`}>
                        {dayLabel(d.start)}
                    </span>
                ))}
            </div>
        </section>
    );
}
