import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, IndianRupee, Send, Loader2, Check, AlertTriangle, RotateCw, Zap } from 'lucide-react';
import {
    createServiceRecordWithOtp,
    verifyServiceOtp,
    resendServiceOtp,
    completeServicePayment,
    notifyInvoice,
    getMyGarageQr,
    getMyGarageServices,
    type PaymentSummary,
} from '../lib/data';
import { useI18n, type TFunction } from '../i18n';
import { errorMessage } from '../lib/errors';
import { haptic } from '../lib/haptics';
import { useCountdown } from '../hooks/useCountdown';

// Past records the dashboard already has — used for quick picks and to
// suggest a returning customer's vehicle.
export interface RecentRecord {
    customerPhone: string;
    vehicleNumber: string | null;
    description: string;
    amount: number;
}

interface AddServiceModalProps {
    isOpen: boolean;
    garageId: string;
    // Continue an in-flight record (awaiting OTP or payment) instead of creating one.
    resume?: { id: string; amount: number; status: string } | null;
    recent?: RecentRecord[];
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'form' | 'otp' | 'payment' | 'success';

// The flat platform fee per service (shown as part of the amount to pay; the
// server is the source of truth). It applies to every completed service.
const PLATFORM_FEE = 3.9;
const MAX_AMOUNT = 1_000_000;
const RESEND_COOLDOWN_S = 30;
const VEHICLE_RE = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$|^\d{2}\s?BH\s?\d{4}\s?[A-Z]{1,2}$/;

interface QuickPick { label: string; amount: number | null }

function otpErrorMessage(t: TFunction, reason?: string, remaining?: number): string {
    if (reason === 'invalid') return remaining != null ? t('add.otpIncorrectLeft', { count: remaining }) : t('add.otpIncorrect');
    if (reason === 'expired') return t('add.otpExpired');
    if (reason === 'locked') return t('add.otpLocked');
    return t('add.otpFailed');
}

export default function AddServiceModal({ isOpen, garageId, resume, recent = [], onClose, onSuccess }: AddServiceModalProps) {
    const { t, locale } = useI18n();
    const [step, setStep] = useState<Step>('form');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [customerPhone, setCustomerPhone] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [amount, setAmount] = useState('');

    const [recordId, setRecordId] = useState('');
    const [devOtp, setDevOtp] = useState('');
    const [otp, setOtp] = useState('');
    const [cooldown, setCooldown] = useCountdown();
    const [summary, setSummary] = useState<PaymentSummary | null>(null);
    const [garageQrUrl, setGarageQrUrl] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<QuickPick[]>([]);

    // Reset on close; jump straight to the right step when resuming a record.
    useEffect(() => {
        if (!isOpen) {
            setStep('form'); setError(''); setNotice(''); setCustomerPhone(''); setVehicleNumber('');
            setNotes(''); setAmount('');
            setRecordId(''); setDevOtp(''); setOtp(''); setSummary(null); setCooldown(0);
            setGarageQrUrl(null);
            return;
        }
        if (resume) {
            setRecordId(resume.id);
            setAmount(String(resume.amount));
            if (resume.status === 'pending_otp') {
                setStep('otp');
            } else {
                setStep('payment');
                getMyGarageQr(garageId).then(setGarageQrUrl).catch(() => setGarageQrUrl(null));
            }
        } else if (garageId) {
            getMyGarageServices(garageId)
                .then((rows) => setCatalog(rows.filter((r) => r.isActive).map((r) => ({ label: r.name, amount: r.price || null }))))
                .catch(() => setCatalog([]));
        }
    }, [isOpen, resume, garageId, setCooldown]);

    // Quick picks: the garage's price list first, then its most frequent past jobs.
    const quickPicks = useMemo<QuickPick[]>(() => {
        const freq = new Map<string, { n: number; amount: number }>();
        for (const r of recent) {
            const key = r.description.trim();
            if (!key || key.length > 40) continue;
            const cur = freq.get(key) ?? { n: 0, amount: r.amount };
            freq.set(key, { n: cur.n + 1, amount: cur.amount });
        }
        const frequent = [...freq.entries()]
            .filter(([label]) => !catalog.some((c) => c.label.toLowerCase() === label.toLowerCase()))
            .sort((a, b) => b[1].n - a[1].n)
            .slice(0, 6)
            .map(([label, v]) => ({ label, amount: v.amount }));
        return [...catalog, ...frequent].slice(0, 10);
    }, [catalog, recent]);

    // Returning customer: their last vehicle at this garage.
    const knownVehicle = useMemo(() => {
        if (customerPhone.length !== 10) return null;
        return recent.find((r) => r.customerPhone === customerPhone && r.vehicleNumber)?.vehicleNumber ?? null;
    }, [customerPhone, recent]);

    const amountNum = Number(amount);
    const amountValid = /^\d+(\.\d{1,2})?$/.test(amount) && amountNum > 0 && amountNum <= MAX_AMOUNT;
    const vehicleClean = vehicleNumber.replace(/[\s-]/g, '');
    const vehicleLooksValid = VEHICLE_RE.test(vehicleClean);
    const feeTotal = (amountValid ? amountNum : 0) + PLATFORM_FEE;

    const canSubmit =
        customerPhone.length === 10 && /^[6-9]/.test(customerPhone) &&
        vehicleClean.length >= 4 &&
        notes.trim().length > 0 &&
        amountValid;

    // Once a record exists, closing loses nothing (it can be resumed from the
    // list) — but a stray backdrop tap mid-flow is still annoying, so only the
    // explicit X closes it then.
    const inFlight = step === 'otp' || step === 'payment';

    const describeDelivery = (channel?: string, err?: string | null) => {
        if (err) return t('add.otpNotDelivered');
        if (channel === 'push') return t('add.otpSentApp');
        if (channel === 'whatsapp') return t('add.otpSentWhatsapp');
        return '';
    };

    const applyPick = (p: QuickPick) => {
        haptic('tap');
        setNotes((prev) => {
            const cur = prev.trim();
            if (!cur) return p.label;
            return cur.toLowerCase().includes(p.label.toLowerCase()) ? cur : `${cur} + ${p.label}`;
        });
        if (p.amount != null) {
            setAmount((prev) => {
                const base = Number(prev) > 0 && notes.trim() ? Number(prev) : 0;
                return String(Math.round((base + p.amount!) * 100) / 100);
            });
        }
    };

    const handleCreate = async () => {
        setError('');
        if (!garageId) return;
        setLoading(true);
        try {
            // Minimal capture: raw vehicle number + free-text description now;
            // structured make/model/service data is enriched later. vehicleType
            // 'other' = unspecified; make/model placeholders satisfy constraints.
            const res = await createServiceRecordWithOtp({
                garageId,
                customerPhone,
                vehicleType: 'other',
                vehicleMakeCode: null,
                vehicleModelCode: null,
                vehicleMakeOther: 'Unspecified',
                vehicleModelOther: 'Unspecified',
                vehicleNumber: vehicleClean.toUpperCase() || null,
                modelYear: null,
                odometerKm: null,
                serviceCodes: [],
                failureCodes: [],
                serviceNotes: notes.trim(),
                amount: amountNum,
                customerHasApp: true,
            });
            setRecordId(res.serviceRecordId);
            setDevOtp(res.devOtp || '');
            setNotice(describeDelivery(res.otpDelivery, res.otpDeliveryError));
            setCooldown(RESEND_COOLDOWN_S);
            setStep('otp');
            haptic('tap');
        } catch (err) {
            setError(errorMessage(err, t('add.createFailed')));
            haptic('error');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await resendServiceOtp(recordId);
            setOtp('');
            setDevOtp(res.devOtp || '');
            setNotice(`${t('add.otpResent')} ${describeDelivery(res.otpDelivery, res.otpDeliveryError)}`.trim());
            setCooldown(RESEND_COOLDOWN_S);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await verifyServiceOtp(recordId, otp.trim());
            if (res.ok) {
                haptic('success');
                // Load the garage's static QR so the customer can pay directly.
                getMyGarageQr(garageId).then(setGarageQrUrl).catch(() => setGarageQrUrl(null));
                setNotice('');
                setStep('payment');
            } else {
                haptic('error');
                setError(otpErrorMessage(t, res.reason, res.remainingAttempts));
                if (res.reason !== 'invalid') setCooldown(0);
            }
        } catch (err) {
            setError(errorMessage(err, t('add.otpFailed')));
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        setError('');
        setLoading(true);
        try {
            const s = await completeServicePayment(recordId, 'qr');
            setSummary(s);
            setStep('success');
            haptic('success');
            // Invoice notification (push/WhatsApp) is best-effort: payment is done.
            notifyInvoice(recordId).catch(() => {});
        } catch (err) {
            setError(errorMessage(err, t('add.paymentFailed')));
        } finally {
            setLoading(false);
        }
    };

    const money = (n: number) => `₹${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const errorBox = error && <p role="alert" className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 px-3 rounded-lg">{error}</p>;
    const title = step === 'form' ? t('add.title') : step === 'otp' ? t('add.verifyTitle') : step === 'payment' ? t('add.paymentTitle') : t('add.doneTitle');

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[1000] bg-black/40 flex items-end sm:items-center justify-center"
                    onClick={() => { if (!inFlight) onClose(); }}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="bg-white dark:bg-[var(--app-surface)] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto pb-safe"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 z-10 bg-white dark:bg-[var(--app-surface)] flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-[var(--app-border)]">
                            <h2 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)]">{title}</h2>
                            <button onClick={onClose} aria-label={t('common.close')} className="text-slate-400 dark:text-[var(--app-muted)] active:scale-90 transition-transform">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Progress: form → OTP → payment → done */}
                        <div className="flex gap-1.5 px-6 pt-4" aria-hidden="true">
                            {(['form', 'otp', 'payment', 'success'] as Step[]).map((s, i, all) => (
                                <span key={s} className={`h-1.5 flex-1 rounded-full ${all.indexOf(step) >= i ? 'bg-blue-600' : 'bg-slate-200 dark:bg-[var(--app-surface-2)]'}`} />
                            ))}
                        </div>

                        {step === 'form' && (
                            <div className="p-6 space-y-5">
                                <div>
                                    <label htmlFor="add-phone" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('add.customerPhone')}</label>
                                    <div className="relative mt-2">
                                        <Phone className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                                        <span className="absolute left-11 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400 pointer-events-none">+91</span>
                                        <input id="add-phone" type="tel" value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            placeholder={t('add.phonePlaceholder')} inputMode="numeric" autoComplete="off"
                                            className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl pl-[5.75rem] pr-4 text-lg font-medium" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="add-vehicle" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('add.vehicleNumber')}</label>
                                    <input id="add-vehicle" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase().slice(0, 13))} placeholder="MH12AB1234"
                                        autoCapitalize="characters"
                                        className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl px-4 mt-2 text-lg font-medium tracking-wide uppercase" />
                                    {knownVehicle && vehicleClean !== knownVehicle.replace(/[\s-]/g, '') && (
                                        <button type="button" onClick={() => setVehicleNumber(knownVehicle)}
                                            className="mt-2 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 rounded-full px-3 py-1.5">
                                            {t('add.recentVehicle', { vehicle: knownVehicle })}
                                        </button>
                                    )}
                                    {vehicleClean.length >= 4 && !vehicleLooksValid && (
                                        <p className="text-xs text-amber-600 mt-1 ml-1">{t('add.plateWarning')}</p>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="add-notes" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('add.whatDone')}</label>
                                    {quickPicks.length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-[var(--app-muted)] flex items-center gap-1 mb-2">
                                                <Zap className="w-3 h-3" /> {t('add.quickPicks')}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {quickPicks.map((p) => (
                                                    <button key={p.label} type="button" onClick={() => applyPick(p)}
                                                        className="px-3 py-2 rounded-full bg-slate-100 dark:bg-[var(--app-surface-2)] text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] active:scale-95 transition-transform">
                                                        {p.label}{p.amount != null && <span className="text-slate-400 dark:text-[var(--app-muted)] font-medium"> · ₹{p.amount.toLocaleString(locale)}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <textarea id="add-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                        placeholder={t('add.notesPlaceholder')}
                                        className="w-full bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl px-4 py-3 mt-2 font-medium" />
                                </div>

                                <div>
                                    <label htmlFor="add-amount" className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">{t('add.amount')}</label>
                                    <div className="relative mt-2">
                                        <IndianRupee className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                                        <input id="add-amount" value={amount} inputMode="decimal"
                                            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                                            placeholder="0" className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl pl-12 pr-4 text-lg font-semibold" />
                                    </div>
                                    {amount !== '' && !amountValid && <p className="text-xs text-red-500 mt-1 ml-1">{t('add.amountInvalid')}</p>}
                                    {amountValid && (
                                        <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] mt-1 ml-1">
                                            {t('add.customerPays', { total: feeTotal.toFixed(2), fee: PLATFORM_FEE.toFixed(2) })}
                                        </p>
                                    )}
                                </div>

                                {errorBox}

                                <button onClick={handleCreate} disabled={!canSubmit || loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (<><Send className="w-5 h-5" /> {t('add.createCta')}</>)}
                                </button>
                            </div>
                        )}

                        {step === 'otp' && (
                            <div className="p-6 space-y-5">
                                <p className="text-slate-500 dark:text-[var(--app-muted)]">{t('add.otpHelp')}</p>
                                {notice && <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 rounded-xl px-4 py-3">{notice}</p>}
                                {devOtp && (
                                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-3 text-amber-800 dark:text-amber-200 font-bold text-center">
                                        {t('add.devOtp', { otp: devOtp })}
                                    </div>
                                )}
                                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    aria-label={t('add.verifyTitle')}
                                    placeholder="000000" maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter' && otp.length === 6 && !loading) handleVerify(); }}
                                    className="w-full h-20 bg-slate-50 dark:bg-[var(--app-bg)] rounded-3xl text-center text-4xl font-bold tracking-[1rem]" />
                                {errorBox}
                                <button onClick={handleVerify} disabled={otp.length < 6 || loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : t('add.verifyCta')}
                                </button>
                                <button onClick={handleResend} disabled={loading || cooldown > 0}
                                    className="w-full py-2 text-sm font-bold text-blue-600 disabled:text-slate-400 flex items-center justify-center gap-2">
                                    <RotateCw className="w-4 h-4" />
                                    {cooldown > 0 ? t('add.resendIn', { s: cooldown }) : t('add.resend')}
                                </button>
                            </div>
                        )}

                        {step === 'payment' && (
                            <div className="p-6 space-y-4">
                                {errorBox}
                                <p className="text-slate-500 dark:text-[var(--app-muted)] text-center">{t('add.scanPay')}</p>
                                <div className="bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl p-4 flex flex-col items-center">
                                    {garageQrUrl ? (
                                        <img src={garageQrUrl} alt="UPI QR" className="w-52 h-52 object-contain rounded-xl bg-white p-2" />
                                    ) : (
                                        <div className="w-52 h-52 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 flex flex-col items-center justify-center text-center px-4">
                                            <AlertTriangle className="w-7 h-7 text-amber-600 mb-2" />
                                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t('add.noQrTitle')}</p>
                                            <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">{t('add.noQrBody')}</p>
                                        </div>
                                    )}
                                    <div className="w-full mt-4 space-y-1.5">
                                        <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-[var(--app-muted)]">{t('add.serviceAmount')}</span><span className="font-semibold">{money(Number(amount || 0))}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-[var(--app-muted)]">{t('add.platformFee')}</span><span className="font-semibold">{money(PLATFORM_FEE)}</span></div>
                                        <div className="flex justify-between text-base pt-1.5 border-t border-slate-200 dark:border-[var(--app-border)]"><span className="font-bold text-slate-900 dark:text-[var(--app-text)]">{t('add.amountToPay')}</span><span className="font-black text-slate-900 dark:text-[var(--app-text)]">{money(Number(amount || 0) + PLATFORM_FEE)}</span></div>
                                    </div>
                                </div>
                                <button onClick={handleComplete} disabled={loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} {t('add.receivedCta')}
                                </button>
                            </div>
                        )}

                        {step === 'success' && summary && (
                            <div className="p-8 flex flex-col items-center text-center">
                                <motion.div
                                    initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', damping: 12, stiffness: 260 }}
                                    className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-4"
                                >
                                    <Check className="w-8 h-8 text-green-600" />
                                </motion.div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)] mb-1">{t('add.paymentComplete')}</h3>
                                <p className="text-slate-500 dark:text-[var(--app-muted)] mb-4">
                                    {t('add.invoice', { number: '' })}<span className="font-mono font-semibold text-slate-700 dark:text-[var(--app-text)]">{summary.invoice_number}</span>
                                </p>
                                <div className="w-full bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl p-4 space-y-2 text-left">
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-[var(--app-muted)]">{t('add.customerPaid')}</span><span className="font-bold">{money(Number(summary.customer_pays ?? 0))}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-[var(--app-muted)]">{t('add.feeOwed')}</span><span className="font-bold">{money(Number(summary.platform_fee ?? 0))}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-[var(--app-muted)]">{t('add.youKeep')}</span><span className="font-bold">{money(Number(summary.garage_receives ?? 0))}</span></div>
                                </div>
                                <button onClick={onSuccess} className="mt-6 w-full h-14 btn-premium rounded-2xl font-bold text-white">{t('common.done')}</button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
