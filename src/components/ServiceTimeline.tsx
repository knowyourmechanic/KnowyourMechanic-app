import { Wrench, Gauge } from 'lucide-react';
import { useI18n } from '../i18n';

export interface TimelineItem {
    key: string;
    date: string;
    garageName: string;
    work: string;
    odometerKm: number | null;
    invoiceNumber: string | null;
    amount?: number;
}

// Vertical timeline of confirmed services (used by the passport and its public view).
export default function ServiceTimeline({ items }: { items: TimelineItem[] }) {
    const { t, locale } = useI18n();
    return (
        <ol className="relative ml-3 border-l-2 border-slate-200 dark:border-[var(--app-border)] space-y-5">
            {items.map((e) => (
                <li key={e.key} className="ml-6">
                    <span className="absolute -left-[11px] w-5 h-5 rounded-full bg-blue-600 ring-4 ring-slate-50 dark:ring-[var(--app-bg)] flex items-center justify-center">
                        <Wrench className="w-2.5 h-2.5 text-white" />
                    </span>
                    <p className="text-xs font-bold text-slate-400 dark:text-[var(--app-muted)]">
                        {new Date(e.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="font-bold text-slate-900 dark:text-[var(--app-text)] leading-snug">{e.work}</p>
                    <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{e.garageName}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400 dark:text-[var(--app-muted)]">
                        {e.odometerKm != null && (
                            <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{e.odometerKm.toLocaleString(locale)} km</span>
                        )}
                        {e.amount != null && <span>₹{e.amount.toLocaleString(locale, { minimumFractionDigits: e.amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}</span>}
                        {e.invoiceNumber && <span className="font-mono">{e.invoiceNumber}</span>}
                        <span className="text-emerald-600 font-semibold">✓ {t('passport.customerConfirmed')}</span>
                    </div>
                </li>
            ))}
        </ol>
    );
}
