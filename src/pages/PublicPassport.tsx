import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { getSharedVehicleHistory, type SharedPassportEntry } from '../lib/data';
import ServiceTimeline from '../components/ServiceTimeline';
import LanguagePicker from '../components/LanguagePicker';
import { useI18n } from '../i18n';

// Public, no-login view of a vehicle's shared service history (/v/:token).
// Shows work done, where and when — never the owner's identity or amounts.
export default function PublicPassport() {
    const { token } = useParams<{ token: string }>();
    const { t } = useI18n();
    const [state, setState] = useState<'loading' | 'missing' | { vehicleNumber: string; entries: SharedPassportEntry[] }>('loading');

    useEffect(() => {
        if (!token) { setState('missing'); return; }
        getSharedVehicleHistory(token).then((r) => setState(r ?? 'missing')).catch(() => setState('missing'));
    }, [token]);

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] px-5 pt-safe pb-10">
            <header className="flex items-center gap-3 py-6">
                <img src="/logo.jpg" alt="" className="w-10 h-10 rounded-xl object-cover" />
                <div>
                    <p className="font-black text-slate-900 dark:text-[var(--app-text)] leading-tight">KnowYourMechanic</p>
                    <p className="text-xs text-slate-500 dark:text-[var(--app-muted)]">{t('passport.title')}</p>
                </div>
            </header>

            {state === 'loading' ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : state === 'missing' ? (
                <div className="text-center py-20">
                    <p className="font-bold text-slate-800 dark:text-[var(--app-text)] mb-1">{t('publicPassport.missingTitle')}</p>
                    <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('publicPassport.missingBody')}</p>
                </div>
            ) : (
                <>
                    <div className="rounded-3xl p-5 bg-gradient-to-br from-slate-900 to-blue-900 text-white mb-6">
                        <div className="inline-block bg-white text-slate-900 font-mono font-black tracking-widest px-3 py-1 rounded-md border-2 border-slate-900 mb-3">
                            {state.vehicleNumber}
                        </div>
                        <p className="text-2xl font-black">{t('publicPassport.count', { count: state.entries.length })}</p>
                        <p className="text-blue-200 text-sm mt-1 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> {t('publicPassport.explain')}</p>
                    </div>
                    <ServiceTimeline items={state.entries.map((e, i) => ({ key: String(i), ...e }))} />
                    <p className="text-xs text-slate-400 dark:text-[var(--app-muted)] mt-8">{t('publicPassport.disclaimer')}</p>
                </>
            )}
            <div className="mt-10"><LanguagePicker /></div>
        </div>
    );
}
