import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Loader2, LogOut, Quote } from 'lucide-react';
import { getMyGarageMembership, getWorkHistory, leaveGarage, type GarageMembership, type WorkHistory } from '../../lib/data';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import Stars from '../../components/Stars';
import LanguagePicker from '../../components/LanguagePicker';
import RoleSwitcher from '../../components/RoleSwitcher';
import { errorMessage } from '../../lib/errors';

// An employee's record that travels with them: every garage they worked at,
// jobs completed there, what customers rated their work, and what each owner
// rated them. Owners they apply to see the numbers (never other owners' notes).
export default function WorkHistoryPage() {
    const navigate = useNavigate();
    const { t, locale } = useI18n();
    const toast = useToast();
    const [history, setHistory] = useState<WorkHistory | null>(null);
    const [membership, setMembership] = useState<GarageMembership | null>(null);

    useEffect(() => {
        getWorkHistory().then(setHistory).catch(() => setHistory({ stints: [], jobsCompleted: 0, customerAvg: null, customerCount: 0, ownerAvg: null, ownerCount: 0 }));
        getMyGarageMembership().then(setMembership).catch(() => {});
    }, []);

    const leave = async () => {
        if (!membership) return;
        if (!(await toast.confirm(t('work.leaveConfirm', { garage: membership.garageName }), { confirmLabel: t('work.leave'), cancelLabel: t('common.cancel'), danger: true }))) return;
        try {
            await leaveGarage();
            navigate('/garage/start', { replace: true });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    const month = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) : '');

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] pb-10 text-slate-900 dark:text-[var(--app-text)]">
            <header className="bg-gradient-to-br from-slate-900 to-blue-900 text-white px-6 pt-safe pb-8 rounded-b-[2.5rem] mb-6">
                <button onClick={() => navigate('/garage')} className="flex items-center gap-2 text-white/80 mt-4 mb-4">
                    <ArrowLeft className="w-5 h-5" /> <span className="font-medium">{t('common.back')}</span>
                </button>
                <h1 className="text-2xl font-black">{t('work.title')}</h1>
                <p className="text-blue-200 text-sm">{t('work.subtitle')}</p>
                {history && (
                    <div className="grid grid-cols-3 gap-2 mt-6 text-center">
                        <div><p className="text-2xl font-black">{history.jobsCompleted}</p><p className="text-[10px] uppercase text-blue-200">{t('work.jobs')}</p></div>
                        <div>
                            <p className="text-2xl font-black">{history.customerAvg != null ? `★ ${history.customerAvg.toFixed(1)}` : '—'}</p>
                            <p className="text-[10px] uppercase text-blue-200">{t('work.customerRating', { count: history.customerCount })}</p>
                        </div>
                        <div>
                            <p className="text-2xl font-black">{history.ownerAvg != null ? `★ ${history.ownerAvg.toFixed(1)}` : '—'}</p>
                            <p className="text-[10px] uppercase text-blue-200">{t('work.ownerRating', { count: history.ownerCount })}</p>
                        </div>
                    </div>
                )}
            </header>

            <div className="px-5 space-y-4">
                {history === null ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : history.stints.length === 0 ? (
                    <div className="text-center py-10 px-6">
                        <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="font-bold mb-1">{t('work.emptyTitle')}</p>
                        <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('work.emptyBody')}</p>
                    </div>
                ) : history.stints.map((s) => (
                    <section key={s.memberId} className="bg-white dark:bg-[var(--app-surface)] rounded-2xl border border-slate-100 dark:border-[var(--app-border)] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold truncate">{s.garageName}</p>
                                <p className="text-xs text-slate-500 dark:text-[var(--app-muted)]">
                                    {month(s.joinedAt)} – {s.status === 'active' ? t('work.present') : month(s.endedAt)}
                                </p>
                            </div>
                            {s.status === 'active' && <span className="text-[10px] font-bold uppercase bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">{t('work.current')}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
                            <span><b>{s.jobsCompleted}</b> {t('work.jobsLower')}</span>
                            <span>{s.customerAvg != null ? <>★ <b>{s.customerAvg.toFixed(1)}</b> {t('work.fromCustomers', { count: s.customerCount })}</> : t('work.noCustomerRatings')}</span>
                        </div>
                        <div className="mt-3 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-500 dark:text-[var(--app-muted)]">{t('work.ownerSays')}</span>
                                {s.ownerRating ? <Stars value={s.ownerRating} size="sm" /> : <span className="text-xs text-slate-400">{t('work.notRated')}</span>}
                            </div>
                            {s.ownerNote && <p className="text-sm mt-2 flex gap-2"><Quote className="w-4 h-4 text-slate-300 shrink-0" />{s.ownerNote}</p>}
                        </div>
                    </section>
                ))}

                <p className="text-xs text-slate-400 dark:text-[var(--app-muted)] text-center px-4">{t('work.privacy')}</p>

                <LanguagePicker tone="card" />
                <RoleSwitcher />

                {membership?.memberRole === 'staff' && membership.status === 'active' && (
                    <button onClick={leave} className="w-full h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 font-bold flex items-center justify-center gap-2">
                        <LogOut className="w-4 h-4" /> {t('work.leaveNamed', { garage: membership.garageName })}
                    </button>
                )}
            </div>
        </div>
    );
}
