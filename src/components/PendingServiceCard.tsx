import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Loader2, ThumbsDown } from 'lucide-react';
import { declineService, type PendingService } from '../lib/data';
import { useToast } from './Toast';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/errors';
import { haptic } from '../lib/haptics';

// Shown to a customer when a garage has logged a service against their number
// and is waiting for the OTP. The details are what the OTP will approve, so the
// customer can check them first — or decline if they never got this service.
export default function PendingServiceCard({ service, onDeclined }: { service: PendingService; onDeclined: (id: string) => void }) {
    const { t, locale } = useI18n();
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    const decline = async () => {
        const ok = await toast.confirm(t('pending.declineConfirm', { garage: service.garageName }), {
            confirmLabel: t('pending.declineCta'),
            cancelLabel: t('common.cancel'),
            danger: true,
        });
        if (!ok) return;
        setBusy(true);
        try {
            await declineService(service.id);
            haptic('warning');
            toast.success(t('pending.declined'));
            onDeclined(service.id);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-5 mb-6 bg-white dark:bg-[var(--app-surface)] border-2 border-blue-500/70 shadow-lg shadow-blue-500/10"
        >
            <div className="flex items-start gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600">{t('pending.eyebrow')}</p>
                    <h3 className="font-black text-slate-900 dark:text-[var(--app-text)] leading-snug">{t('pending.title', { garage: service.garageName })}</h3>
                </div>
            </div>

            <dl className="rounded-2xl bg-slate-50 dark:bg-[var(--app-bg)] p-4 space-y-2 text-sm mb-4">
                <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-[var(--app-muted)]">{t('pending.work')}</dt>
                    <dd className="font-semibold text-right text-slate-900 dark:text-[var(--app-text)]">{service.work}</dd>
                </div>
                {service.vehicleNumber && (
                    <div className="flex justify-between gap-4">
                        <dt className="text-slate-500 dark:text-[var(--app-muted)]">{t('pending.vehicle')}</dt>
                        <dd className="font-mono font-semibold text-slate-900 dark:text-[var(--app-text)]">{service.vehicleNumber}</dd>
                    </div>
                )}
                <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-[var(--app-muted)]">{t('pending.amount')}</dt>
                    <dd className="font-black text-slate-900 dark:text-[var(--app-text)]">₹{service.amount.toLocaleString(locale)}</dd>
                </div>
            </dl>

            <p className="text-sm text-slate-600 dark:text-[var(--app-muted)] mb-4">{t('pending.howTo')}</p>

            <button
                onClick={decline}
                disabled={busy}
                className="w-full h-12 rounded-2xl border-2 border-red-200 dark:border-red-900/60 text-red-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                {t('pending.declineCta')}
            </button>
        </motion.div>
    );
}
