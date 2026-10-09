import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, ChevronRight, Loader2, Phone, Search, UserRound, Wrench } from 'lucide-react';
import { findGaragesByOwnerPhone, requestToJoinGarage, getCustomerProfile, type OwnerGarageMatch } from '../../lib/data';
import { garageHome } from '../../lib/roles';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';

// First garage screen: "I own this garage" or "I work at a garage".
// Employees find their owner by phone: join an existing garage (owner approves)
// or, if the owner isn't on KYM yet, set the garage up for them.
type Step = 'who' | 'staff' | 'results';

export default function GarageStart() {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const { t } = useI18n();
    const toast = useToast();
    const [checking, setChecking] = useState(true);
    const [step, setStep] = useState<Step>('who');
    const [myName, setMyName] = useState('');
    const [ownerPhone, setOwnerPhone] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [matches, setMatches] = useState<OwnerGarageMatch[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Already linked to a garage (or waiting)? Go where they belong.
    useEffect(() => {
        garageHome().then((path) => {
            if (path !== '/garage/start') navigate(path, { replace: true });
            else setChecking(false);
        }).catch(() => setChecking(false));
        if (userData?._id) getCustomerProfile(userData._id).then((p) => setMyName(p.name)).catch(() => {});
    }, [navigate, userData?._id]);

    const validPhone = /^[6-9]\d{9}$/.test(ownerPhone);
    const ownPhone = ownerPhone === userData?.phoneNumber?.replace(/\D/g, '').slice(-10);

    const lookUp = async () => {
        setError('');
        if (!myName.trim()) { setError(t('start.nameRequired')); return; }
        if (!validPhone) { setError(t('auth.invalidPhone')); return; }
        if (ownPhone) { setError(t('start.ownNumber')); return; }
        setBusy(true);
        try {
            setMatches(await findGaragesByOwnerPhone(ownerPhone));
            setStep('results');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const join = async (g: OwnerGarageMatch) => {
        setBusy(true);
        try {
            await requestToJoinGarage(g.garageId, myName.trim());
            toast.success(t('start.requestSent', { garage: g.garageName }));
            navigate('/garage/pending', { replace: true });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const setUpForOwner = () => {
        navigate('/garage/onboarding', {
            state: { mode: 'staff', ownerPhone, ownerName: ownerName.trim(), staffName: myName.trim() },
        });
    };

    if (checking) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[var(--app-bg)]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    }

    const input = 'w-full h-14 bg-white dark:bg-[var(--app-surface)] border border-slate-200 dark:border-[var(--app-border)] rounded-2xl px-4 text-lg font-medium';

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] px-6 pt-safe pb-10 text-slate-900 dark:text-[var(--app-text)]">
            {step !== 'who' && (
                <button onClick={() => { setStep(step === 'results' ? 'staff' : 'who'); setError(''); }} aria-label={t('common.back')}
                    className="mt-6 w-10 h-10 rounded-full border border-slate-200 dark:border-[var(--app-border)] flex items-center justify-center text-slate-400">
                    <ArrowLeft className="w-5 h-5" />
                </button>
            )}

            {step === 'who' && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-16">
                    <h1 className="text-3xl font-extrabold mb-2">{t('start.title')}</h1>
                    <p className="text-slate-500 dark:text-[var(--app-muted)] mb-10">{t('start.subtitle')}</p>
                    <div className="space-y-4">
                        <button onClick={() => navigate('/garage/onboarding')}
                            className="w-full bg-white dark:bg-[var(--app-surface)] border-2 border-slate-100 dark:border-[var(--app-border)] rounded-3xl p-5 flex items-center gap-4 text-left active:scale-[0.99] transition-transform">
                            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center"><Building2 className="w-7 h-7" /></div>
                            <div className="flex-1">
                                <p className="font-bold text-lg">{t('start.owner')}</p>
                                <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('start.ownerSub')}</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-300" />
                        </button>
                        <button onClick={() => setStep('staff')}
                            className="w-full bg-white dark:bg-[var(--app-surface)] border-2 border-slate-100 dark:border-[var(--app-border)] rounded-3xl p-5 flex items-center gap-4 text-left active:scale-[0.99] transition-transform">
                            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center"><Wrench className="w-7 h-7" /></div>
                            <div className="flex-1">
                                <p className="font-bold text-lg">{t('start.staff')}</p>
                                <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('start.staffSub')}</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-300" />
                        </button>
                    </div>
                </motion.div>
            )}

            {step === 'staff' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="pt-6 space-y-5">
                    <div>
                        <h1 className="text-2xl font-extrabold mb-1">{t('start.findOwner')}</h1>
                        <p className="text-slate-500 dark:text-[var(--app-muted)]">{t('start.findOwnerSub')}</p>
                    </div>
                    <div>
                        <label htmlFor="my-name" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('start.yourName')}</label>
                        <div className="relative mt-2">
                            <UserRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input id="my-name" value={myName} onChange={(e) => setMyName(e.target.value.slice(0, 60))} className={`${input} pl-12`} placeholder={t('start.yourNamePlaceholder')} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="owner-phone" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('start.ownerPhone')}</label>
                        <div className="relative mt-2">
                            <Phone className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                            <span className="absolute left-11 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400 pointer-events-none">+91</span>
                            <input id="owner-phone" type="tel" inputMode="numeric" value={ownerPhone}
                                onChange={(e) => setOwnerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                className={`${input} pl-[5.75rem]`} placeholder={t('add.phonePlaceholder')} />
                        </div>
                    </div>
                    {error && <p role="alert" className="text-red-500 text-sm font-medium bg-red-50 dark:bg-red-950/40 py-2 px-3 rounded-lg">{error}</p>}
                    <button onClick={lookUp} disabled={busy}
                        className="w-full h-14 btn-premium rounded-2xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40">
                        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Search className="w-5 h-5" /> {t('start.findCta')}</>}
                    </button>
                </motion.div>
            )}

            {step === 'results' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="pt-6 space-y-5">
                    {matches.length > 0 ? (
                        <>
                            <div>
                                <h1 className="text-2xl font-extrabold mb-1">{t('start.selectGarage')}</h1>
                                <p className="text-slate-500 dark:text-[var(--app-muted)]">{t('start.selectGarageSub')}</p>
                            </div>
                            <div className="space-y-3">
                                {matches.map((g) => (
                                    <button key={g.garageId} onClick={() => join(g)} disabled={busy}
                                        className="w-full bg-white dark:bg-[var(--app-surface)] border border-slate-100 dark:border-[var(--app-border)] rounded-2xl p-4 flex items-center gap-3 text-left disabled:opacity-50">
                                        <div className="w-11 h-11 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center">{g.garageName.charAt(0).toUpperCase()}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold leading-snug">{g.garageName}</p>
                                            {g.address && <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] truncate">{g.address}</p>}
                                        </div>
                                        <span className="text-sm font-bold text-blue-600">{t('start.askToJoin')}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <h1 className="text-2xl font-extrabold mb-1">{t('start.ownerNotFound')}</h1>
                                <p className="text-slate-500 dark:text-[var(--app-muted)]">{t('start.ownerNotFoundSub', { phone: ownerPhone })}</p>
                            </div>
                            <div>
                                <label htmlFor="owner-name" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('start.ownerName')}</label>
                                <input id="owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value.slice(0, 60))} className={`${input} mt-2`} />
                            </div>
                            <p className="text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 rounded-2xl px-4 py-3">{t('start.setupNote')}</p>
                            <button onClick={setUpForOwner} disabled={!ownerName.trim()}
                                className="w-full h-14 btn-premium rounded-2xl font-bold text-white disabled:opacity-40">
                                {t('start.setupCta')}
                            </button>
                        </>
                    )}
                </motion.div>
            )}
        </div>
    );
}
