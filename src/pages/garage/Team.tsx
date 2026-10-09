import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Loader2, Phone, Star, UserMinus, UserPlus, X } from 'lucide-react';
import {
    addStaffByPhone, getGarageTeam, getMyGarageContext, getWorkHistory, rateStaff, removeStaff, respondJoinRequest,
    type TeamMember, type WorkHistory,
} from '../../lib/data';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import Stars from '../../components/Stars';
import { errorMessage } from '../../lib/errors';

// Owner's team: approve join requests (seeing the applicant's track record),
// add employees by phone, rate them, remove them.
export default function GarageTeam() {
    const navigate = useNavigate();
    const { t, locale } = useI18n();
    const toast = useToast();
    const [garageId, setGarageId] = useState('');
    const [team, setTeam] = useState<TeamMember[] | null>(null);
    const [histories, setHistories] = useState<Record<string, WorkHistory>>({});
    const [showAdd, setShowAdd] = useState(false);
    const [addName, setAddName] = useState('');
    const [addPhone, setAddPhone] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [rating, setRating] = useState<{ member: TeamMember; value: number; note: string } | null>(null);
    const [showFormer, setShowFormer] = useState(false);

    const load = useCallback(async (gid: string) => {
        const list = await getGarageTeam(gid);
        setTeam(list);
        // Applicants' history across garages helps decide (ratings + numbers only).
        const pending = list.filter((m) => m.status === 'pending');
        const entries = await Promise.all(pending.map(async (m) => [m.profileId, await getWorkHistory(m.profileId).catch(() => null)] as const));
        setHistories(Object.fromEntries(entries.filter(([, h]) => h)) as Record<string, WorkHistory>);
    }, []);

    useEffect(() => {
        getMyGarageContext().then((ctx) => {
            if (!ctx || ctx.role !== 'owner') { navigate('/garage', { replace: true }); return; }
            setGarageId(ctx.garage.id);
            load(ctx.garage.id).catch((e) => toast.error(errorMessage(e)));
        });
    }, [navigate, load, toast]);

    const act = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key);
        try {
            await fn();
            if (ok) toast.success(ok);
            await load(garageId);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const remove = async (m: TeamMember) => {
        if (!(await toast.confirm(t('team.removeConfirm', { name: m.name || m.phone }), { confirmLabel: t('team.remove'), cancelLabel: t('common.cancel'), danger: true }))) return;
        await act(m.memberId, () => removeStaff(m.memberId), t('team.removed'));
        // Offer to rate their time here while it's fresh.
        if (m.ownerRating == null) setRating({ member: m, value: 0, note: '' });
    };

    const pending = (team ?? []).filter((m) => m.status === 'pending');
    const active = (team ?? []).filter((m) => m.status === 'active');
    const former = (team ?? []).filter((m) => m.status === 'removed');
    const since = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) : '');

    const memberCard = (m: TeamMember) => (
        <div key={m.memberId} className="bg-white dark:bg-[var(--app-surface)] rounded-2xl border border-slate-100 dark:border-[var(--app-border)] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-bold truncate">{m.name || t('team.unnamed')}</p>
                    <p className="text-xs text-slate-500 dark:text-[var(--app-muted)]">+91 {m.phone}{m.joinedAt ? ` · ${t('team.since', { date: since(m.joinedAt) })}` : ''}</p>
                </div>
                {m.status === 'active' && (
                    <button onClick={() => remove(m)} disabled={busy === m.memberId} aria-label={t('team.remove')} className="text-slate-400 p-1">
                        {busy === m.memberId ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserMinus className="w-5 h-5" />}
                    </button>
                )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] p-2"><p className="font-black">{m.jobsTotal}</p><p className="text-[10px] uppercase text-slate-400">{t('team.jobs')}</p></div>
                <div className="rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] p-2"><p className="font-black">{m.jobs30d}</p><p className="text-[10px] uppercase text-slate-400">{t('team.jobs30')}</p></div>
                <div className="rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] p-2">
                    <p className="font-black">{m.customerAvg != null ? `★ ${m.customerAvg.toFixed(1)}` : '—'}</p>
                    <p className="text-[10px] uppercase text-slate-400">{t('team.customers', { count: m.customerCount })}</p>
                </div>
            </div>
            <button onClick={() => setRating({ member: m, value: m.ownerRating ?? 0, note: m.ownerNote ?? '' })}
                className="mt-3 w-full flex items-center justify-between rounded-xl border border-slate-100 dark:border-[var(--app-border)] px-3 py-2">
                <span className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('team.yourRating')}</span>
                {m.ownerRating ? <Stars value={m.ownerRating} size="sm" /> : <span className="text-sm font-bold text-blue-600">{t('team.rate')}</span>}
            </button>
        </div>
    );

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] pb-10 text-slate-900 dark:text-[var(--app-text)]">
            <header className="bg-blue-600 text-white px-6 pt-safe pb-8 rounded-b-[2.5rem] mb-6">
                <button onClick={() => navigate('/garage')} className="flex items-center gap-2 text-white/80 mt-4 mb-4">
                    <ArrowLeft className="w-5 h-5" /> <span className="font-medium">{t('common.back')}</span>
                </button>
                <h1 className="text-2xl font-black">{t('team.title')}</h1>
                <p className="text-blue-100 text-sm">{t('team.subtitle')}</p>
            </header>

            <div className="px-5 space-y-6">
                {team === null ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : (
                    <>
                        {pending.length > 0 && (
                            <section>
                                <h2 className="text-sm font-black uppercase tracking-wider text-amber-600 mb-3">{t('team.requests', { count: pending.length })}</h2>
                                <div className="space-y-3">
                                    {pending.map((m) => {
                                        const h = histories[m.profileId];
                                        return (
                                            <div key={m.memberId} className="bg-white dark:bg-[var(--app-surface)] rounded-2xl border-2 border-amber-300 dark:border-amber-800/60 p-4">
                                                <p className="font-bold">{m.name || t('team.unnamed')}</p>
                                                <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] mb-3">+91 {m.phone} · {t('team.wantsToJoin')}</p>
                                                <p className="text-sm text-slate-600 dark:text-[var(--app-muted)] mb-3">
                                                    {h && h.stints.length > 0
                                                        ? t('team.history', {
                                                            jobs: h.jobsCompleted,
                                                            garages: h.stints.length,
                                                            customer: h.customerAvg != null ? `★ ${h.customerAvg.toFixed(1)}` : '—',
                                                            owner: h.ownerAvg != null ? `★ ${h.ownerAvg.toFixed(1)}` : '—',
                                                        })
                                                        : t('team.noHistory')}
                                                </p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button onClick={() => act(m.memberId, () => respondJoinRequest(m.memberId, false))} disabled={busy === m.memberId}
                                                        className="h-11 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] font-bold flex items-center justify-center gap-1"><X className="w-4 h-4" /> {t('team.reject')}</button>
                                                    <button onClick={() => act(m.memberId, () => respondJoinRequest(m.memberId, true), t('team.approved', { name: m.name }))} disabled={busy === m.memberId}
                                                        className="h-11 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center gap-1"><Check className="w-4 h-4" /> {t('team.approve')}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-black uppercase tracking-wider text-slate-400">{t('team.active', { count: active.length })}</h2>
                                <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-sm font-bold text-blue-600"><UserPlus className="w-4 h-4" /> {t('team.add')}</button>
                            </div>
                            {active.length === 0 ? (
                                <p className="text-sm text-slate-500 dark:text-[var(--app-muted)] bg-white dark:bg-[var(--app-surface)] rounded-2xl p-4">{t('team.empty')}</p>
                            ) : <div className="space-y-3">{active.map(memberCard)}</div>}
                        </section>

                        {former.length > 0 && (
                            <section>
                                <button onClick={() => setShowFormer(!showFormer)} className="text-sm font-black uppercase tracking-wider text-slate-400 mb-3">
                                    {t('team.former', { count: former.length })} {showFormer ? '▴' : '▾'}
                                </button>
                                {showFormer && <div className="space-y-3 opacity-80">{former.map(memberCard)}</div>}
                            </section>
                        )}
                    </>
                )}
            </div>

            {/* Add employee */}
            <AnimatePresence>
                {showAdd && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black/40 flex items-end justify-center" onClick={() => setShowAdd(false)}>
                        <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-white dark:bg-[var(--app-surface)] rounded-t-3xl p-6 pb-safe space-y-4">
                            <h3 className="text-xl font-black">{t('team.addTitle')}</h3>
                            <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('team.addHelp')}</p>
                            <input value={addName} onChange={(e) => setAddName(e.target.value.slice(0, 60))} placeholder={t('team.namePlaceholder')}
                                className="w-full h-12 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] px-4 font-medium" />
                            <div className="relative">
                                <Phone className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input type="tel" inputMode="numeric" value={addPhone} onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    placeholder={t('add.phonePlaceholder')} className="w-full h-12 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] pl-10 pr-4 font-medium" />
                            </div>
                            <button disabled={!addName.trim() || !/^[6-9]\d{9}$/.test(addPhone) || busy === 'add'}
                                onClick={() => act('add', async () => { await addStaffByPhone(garageId, addPhone, addName.trim()); setShowAdd(false); setAddName(''); setAddPhone(''); }, t('team.added'))}
                                className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                                {busy === 'add' && <Loader2 className="w-4 h-4 animate-spin" />} {t('team.addCta')}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rate employee */}
            <AnimatePresence>
                {rating && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black/40 flex items-end justify-center" onClick={() => setRating(null)}>
                        <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-white dark:bg-[var(--app-surface)] rounded-t-3xl p-6 pb-safe space-y-4">
                            <h3 className="text-xl font-black flex items-center gap-2"><Star className="w-5 h-5 text-amber-500" /> {t('team.rateTitle', { name: rating.member.name || t('team.unnamed') })}</h3>
                            <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('team.rateHelp')}</p>
                            <div className="flex justify-center"><Stars value={rating.value} size="lg" onChange={(v) => setRating({ ...rating, value: v })} /></div>
                            <textarea value={rating.note} onChange={(e) => setRating({ ...rating, note: e.target.value.slice(0, 500) })} rows={3}
                                placeholder={t('team.notePlaceholder')} className="w-full rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] px-4 py-3 text-sm" />
                            <button disabled={rating.value === 0 || busy === 'rate'}
                                onClick={() => act('rate', async () => { await rateStaff(rating.member.memberId, rating.value, rating.note); setRating(null); }, t('team.rated'))}
                                className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-40">{t('common.save')}</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
