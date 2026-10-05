import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Car, Share2, Link2Off, Loader2, CalendarClock, MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { buildPassports, createVehicleShare, getCustomerServiceHistory, reminderFor, revokeVehicleShare, type VehiclePassport } from '../../lib/data';
import { publicWebUrl, shareLink, whatsappShareUrl } from '../../lib/share';
import { useToast } from '../../components/Toast';
import ServiceTimeline from '../../components/ServiceTimeline';
import { useI18n } from '../../i18n';
import { errorMessage } from '../../lib/errors';

// Vehicle Service Passport: every OTP-confirmed service per vehicle, a service
// reminder, and a revocable read-only link to share (e.g. with a buyer).
export default function CustomerVehicles() {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const toast = useToast();
    const { t, locale } = useI18n();
    const [passports, setPassports] = useState<VehiclePassport[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!userData?.phoneNumber) return;
        getCustomerServiceHistory(userData.phoneNumber)
            .then((h) => setPassports(buildPassports(h)))
            .catch(() => setPassports([]));
    }, [userData?.phoneNumber]);

    const share = async (p: VehiclePassport) => {
        setBusy(p.vehicleNumber);
        try {
            const token = await createVehicleShare(p.vehicleNumber);
            const url = publicWebUrl(`/v/${token}`);
            if (!url) { toast.error(t('passport.noShareUrl')); return; }
            const text = t('passport.shareText', { vehicle: p.vehicleNumber, count: p.entries.length });
            const how = await shareLink({ title: t('passport.title'), text, url });
            if (how === 'copied') toast.success(t('passport.linkCopied'));
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const shareWhatsapp = async (p: VehiclePassport) => {
        setBusy(p.vehicleNumber);
        try {
            const token = await createVehicleShare(p.vehicleNumber);
            const url = publicWebUrl(`/v/${token}`);
            if (!url) { toast.error(t('passport.noShareUrl')); return; }
            window.open(whatsappShareUrl(`${t('passport.shareText', { vehicle: p.vehicleNumber, count: p.entries.length })} ${url}`), '_blank', 'noopener');
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const revoke = async (p: VehiclePassport) => {
        if (!(await toast.confirm(t('passport.revokeConfirm'), { confirmLabel: t('passport.revoke'), cancelLabel: t('common.cancel'), danger: true }))) return;
        try {
            await revokeVehicleShare(p.vehicleNumber);
            toast.success(t('passport.revoked'));
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pb-10">
            <header className="bg-blue-600 text-white px-6 pt-safe pb-8 rounded-b-[2.5rem] mb-6">
                <button onClick={() => navigate('/customer')} className="flex items-center gap-2 text-white/80 mt-4 mb-4">
                    <ArrowLeft className="w-5 h-5" /> <span className="font-medium">{t('common.back')}</span>
                </button>
                <h1 className="text-2xl font-black">{t('passport.title')}</h1>
                <p className="text-blue-100 text-sm">{t('passport.subtitle')}</p>
            </header>

            <div className="px-5 space-y-6">
                {passports === null ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : passports.length === 0 ? (
                    <div className="text-center py-16 px-6">
                        <Car className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="font-bold text-slate-800 dark:text-[var(--app-text)] mb-1">{t('passport.emptyTitle')}</p>
                        <p className="text-sm text-slate-500 dark:text-[var(--app-muted)]">{t('passport.emptyBody')}</p>
                    </div>
                ) : passports.map((p) => {
                    const r = reminderFor(p.lastServiceAt);
                    return (
                        <section key={p.vehicleNumber} className="bg-white dark:bg-[var(--app-surface)] rounded-3xl border border-slate-100 dark:border-[var(--app-border)] shadow-sm overflow-hidden">
                            <div className="p-5 bg-gradient-to-br from-slate-900 to-blue-900 text-white">
                                <div className="inline-block bg-white text-slate-900 font-mono font-black tracking-widest px-3 py-1 rounded-md border-2 border-slate-900 mb-3">
                                    {p.vehicleNumber}
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div><p className="text-xl font-black">{p.entries.length}</p><p className="text-[10px] uppercase text-blue-200">{t('passport.services')}</p></div>
                                    <div><p className="text-xl font-black">{p.garagesUsed}</p><p className="text-[10px] uppercase text-blue-200">{t('passport.garages')}</p></div>
                                    <div><p className="text-xl font-black">₹{Math.round(p.totalSpent).toLocaleString(locale)}</p><p className="text-[10px] uppercase text-blue-200">{t('passport.spent')}</p></div>
                                </div>
                            </div>

                            <div className={`mx-5 mt-5 rounded-2xl px-4 py-3 text-sm flex items-center gap-3 ${r.state === 'due'
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                                : r.state === 'soon' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'}`}>
                                <CalendarClock className="w-5 h-5 shrink-0" />
                                <span className="font-semibold">
                                    {r.state === 'due' ? t('reminder.due') : r.state === 'soon' ? t('reminder.soon', { days: r.days }) : t('reminder.ok', { days: r.days })}
                                </span>
                            </div>

                            <div className="p-5">
                                <ServiceTimeline items={p.entries.map((e) => ({ key: e.id, date: e.date, garageName: e.garageName, work: e.work, odometerKm: e.odometerKm, invoiceNumber: e.invoiceNumber, amount: e.amount }))} />
                            </div>

                            <div className="px-5 pb-5 grid grid-cols-2 gap-2">
                                <button onClick={() => share(p)} disabled={busy === p.vehicleNumber}
                                    className="h-12 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                                    {busy === p.vehicleNumber ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} {t('passport.share')}
                                </button>
                                <button onClick={() => shareWhatsapp(p)} disabled={busy === p.vehicleNumber}
                                    className="h-12 rounded-2xl bg-green-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                                    <MessageCircle className="w-4 h-4" /> WhatsApp
                                </button>
                                <button onClick={() => revoke(p)} className="col-span-2 h-10 text-sm font-semibold text-slate-500 dark:text-[var(--app-muted)] flex items-center justify-center gap-2">
                                    <Link2Off className="w-4 h-4" /> {t('passport.revokeLinks')}
                                </button>
                            </div>
                        </section>
                    );
                })}
                <p className="text-xs text-center text-slate-400 dark:text-[var(--app-muted)] px-6">{t('passport.privacy')}</p>
            </div>
        </div>
    );
}
