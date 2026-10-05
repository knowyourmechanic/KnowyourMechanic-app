import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, IndianRupee, Send, Loader2, Check, AlertTriangle, RotateCw } from 'lucide-react';
import {
    createServiceRecordWithOtp,
    verifyServiceOtp,
    resendServiceOtp,
    completeServicePayment,
    notifyInvoice,
    getMyGarageQr,
    type PaymentSummary,
} from '../lib/data';

interface AddServiceModalProps {
    isOpen: boolean;
    garageId: string;
    // Continue an in-flight record (awaiting OTP or payment) instead of creating one.
    resume?: { id: string; amount: number; status: string } | null;
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'form' | 'otp' | 'payment' | 'success';

// The flat platform fee per service (shown as part of the amount to pay; the
// server is the source of truth). It applies to every completed service — we
// can't see how the customer actually paid, so there is no separate cash mode.
const PLATFORM_FEE = 3.9;
const MAX_AMOUNT = 1_000_000;
const RESEND_COOLDOWN_S = 30;
const VEHICLE_RE = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$|^\d{2}\s?BH\s?\d{4}\s?[A-Z]{1,2}$/;

function otpErrorMessage(reason?: string, remaining?: number): string {
    if (reason === 'invalid') return `Incorrect OTP${remaining != null ? ` — ${remaining} attempt${remaining === 1 ? '' : 's'} left` : ''}.`;
    if (reason === 'expired') return 'This OTP has expired. Tap "Resend OTP".';
    if (reason === 'locked') return 'Too many wrong attempts. Tap "Resend OTP" for a new code.';
    return 'OTP verification failed.';
}

export default function AddServiceModal({ isOpen, garageId, resume, onClose, onSuccess }: AddServiceModalProps) {
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
    const [cooldown, setCooldown] = useState(0);
    const [summary, setSummary] = useState<PaymentSummary | null>(null);
    const [garageQrUrl, setGarageQrUrl] = useState<string | null>(null);

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
        }
    }, [isOpen, resume, garageId]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

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
        if (err) return 'The OTP could not be delivered automatically. Ask the customer to check WhatsApp/SMS, or resend.';
        if (channel === 'push') return 'OTP sent to the customer\'s KnowYourMechanic app.';
        if (channel === 'whatsapp') return 'OTP sent to the customer on WhatsApp.';
        return '';
    };

    const handleCreate = async () => {
        setError('');
        if (!garageId) { setError('Garage not loaded yet.'); return; }
        setLoading(true);
        try {
            // Minimal capture: raw vehicle number + free-text description now;
            // structured make/model/service data is enriched later (VAHAN lookup +
            // AI cleaning of the description). vehicleType 'other' = unspecified.
            const res = await createServiceRecordWithOtp({
                garageId,
                customerPhone,
                vehicleType: 'other',
                vehicleMakeCode: null,
                vehicleModelCode: null,
                // Placeholder to satisfy the make/model-required constraints; the
                // real make/model gets filled in later from the vehicle-number lookup.
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
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the service record.');
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
            setNotice(`New OTP sent. ${describeDelivery(res.otpDelivery, res.otpDeliveryError)}`.trim());
            setCooldown(RESEND_COOLDOWN_S);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not resend the OTP.');
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
                // Load the garage's static QR so the customer can pay directly.
                getMyGarageQr(garageId).then(setGarageQrUrl).catch(() => setGarageQrUrl(null));
                setNotice('');
                setStep('payment');
            } else {
                setError(otpErrorMessage(res.reason, res.remainingAttempts));
                if (res.reason !== 'invalid') setCooldown(0);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'OTP verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        setError('');
        setLoading(true);
        try {
            // Always 'qr' — the fee applies to every service; there is no cash mode.
            const s = await completeServicePayment(recordId, 'qr');
            setSummary(s);
            setStep('success');
            // Fire the invoice notification (push/WhatsApp). Best-effort: payment
            // is already done, so never let a send hiccup break the success flow.
            notifyInvoice(recordId).catch(() => {});
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[1000] bg-black/40 flex items-end sm:items-center justify-center"
                    onClick={() => { if (!inFlight) onClose(); }}
                >
                    <motion.div
                        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="bg-white dark:bg-[var(--app-surface)] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-white dark:bg-[var(--app-surface)] flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-[var(--app-border)]">
                            <h2 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)]">
                                {step === 'form' ? 'Add Service' : step === 'otp' ? 'Verify OTP' : step === 'payment' ? 'Complete Payment' : 'Done'}
                            </h2>
                            <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-[var(--app-muted)] active:scale-90 transition-transform">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* ---- FORM ---- */}
                        {step === 'form' && (
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">Customer phone</label>
                                    <div className="relative mt-2">
                                        <span className="absolute left-12 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400">+91</span>
                                        <Phone className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                                        <input type="tel" value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            placeholder="10-digit number" inputMode="numeric" autoComplete="off"
                                            className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl pl-[5.5rem] pr-4 text-lg font-medium" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">Vehicle number</label>
                                    <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase().slice(0, 13))} placeholder="MH12AB1234"
                                        autoCapitalize="characters"
                                        className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl px-4 mt-2 text-lg font-medium tracking-wide uppercase" />
                                    {vehicleClean.length >= 4 && !vehicleLooksValid && (
                                        <p className="text-xs text-amber-600 mt-1 ml-1">That doesn't look like a standard number plate — double-check it.</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">What was done?</label>
                                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                        placeholder="e.g. oil change + front brake pads. Type it however you like."
                                        className="w-full bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl px-4 py-3 mt-2 font-medium" />
                                </div>

                                <div>
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">Total amount</label>
                                    <div className="relative mt-2">
                                        <IndianRupee className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                                        <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="0" className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl pl-12 pr-4 text-lg font-semibold" />
                                    </div>
                                </div>

                                {amount !== '' && !amountValid && (
                                    <p className="text-xs text-red-500 -mt-3 ml-1">Enter an amount between ₹1 and ₹10,00,000.</p>
                                )}
                                {amountValid && (
                                    <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] -mt-3 ml-1">Customer pays ₹{feeTotal.toFixed(2)} (incl. ₹{PLATFORM_FEE.toFixed(2)} platform fee).</p>
                                )}

                                {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}

                                <button onClick={handleCreate} disabled={!canSubmit || loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (<><Send className="w-5 h-5" /> Create record &amp; send OTP</>)}
                                </button>
                            </div>
                        )}

                        {/* ---- OTP ---- */}
                        {step === 'otp' && (
                            <div className="p-6 space-y-5">
                                <p className="text-slate-500 dark:text-[var(--app-muted)]">The customer checks the service details on their phone and shares the 6-digit OTP with you.</p>
                                {notice && <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 rounded-xl px-4 py-3">{notice}</p>}
                                {devOtp && (
                                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-3 text-amber-800 dark:text-amber-200 font-bold text-center">
                                        Dev OTP: {devOtp}
                                    </div>
                                )}
                                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000" maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter' && otp.length === 6 && !loading) handleVerify(); }}
                                    className="w-full h-20 bg-slate-50 dark:bg-[var(--app-bg)] rounded-3xl text-center text-4xl font-bold tracking-[1rem]" />
                                {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}
                                <button onClick={handleVerify} disabled={otp.length < 6 || loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Verify OTP'}
                                </button>
                                <button onClick={handleResend} disabled={loading || cooldown > 0}
                                    className="w-full py-2 text-sm font-bold text-blue-600 disabled:text-slate-400 flex items-center justify-center gap-2">
                                    <RotateCw className="w-4 h-4" />
                                    {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                                </button>
                            </div>
                        )}

                        {/* ---- PAYMENT (show QR, collect, mark received) ---- */}
                        {step === 'payment' && (
                            <div className="p-6 space-y-4">
                                {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}

                                <p className="text-slate-500 dark:text-[var(--app-muted)] text-center">Ask the customer to scan and pay this amount.</p>

                                <div className="bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl p-4 flex flex-col items-center">
                                    {garageQrUrl ? (
                                        <img src={garageQrUrl} alt="Garage payment QR" className="w-52 h-52 object-contain rounded-xl bg-white p-2" />
                                    ) : (
                                        <div className="w-52 h-52 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 flex flex-col items-center justify-center text-center px-4">
                                            <AlertTriangle className="w-7 h-7 text-amber-600 mb-2" />
                                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">No payment QR set yet</p>
                                            <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">Add one in Settings → Payment QR so customers can scan and pay.</p>
                                        </div>
                                    )}
                                    <div className="w-full mt-4 space-y-1.5">
                                        <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-[var(--app-muted)]">Service amount</span><span className="font-semibold">₹{Number(amount || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-[var(--app-muted)]">Platform fee</span><span className="font-semibold">₹{PLATFORM_FEE.toFixed(2)}</span></div>
                                        <div className="flex justify-between text-base pt-1.5 border-t border-slate-200 dark:border-[var(--app-border)]"><span className="font-bold text-slate-900 dark:text-[var(--app-text)]">Amount to pay</span><span className="font-black text-slate-900 dark:text-[var(--app-text)]">₹{feeTotal.toFixed(2)}</span></div>
                                    </div>
                                </div>

                                <button onClick={handleComplete} disabled={loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Received — complete service
                                </button>
                            </div>
                        )}

                        {/* ---- SUCCESS ---- */}
                        {step === 'success' && summary && (
                            <div className="p-8 flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-4">
                                    <Check className="w-8 h-8 text-green-600" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)] mb-1">Payment complete</h3>
                                <p className="text-slate-500 dark:text-[var(--app-muted)] mb-4">Invoice <span className="font-mono font-semibold text-slate-700 dark:text-[var(--app-text)]">{summary.invoice_number}</span></p>
                                <div className="w-full bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl p-4 space-y-2 text-left">
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-[var(--app-muted)]">Customer paid</span><span className="font-bold">₹{Number(summary.customer_pays ?? 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-[var(--app-muted)]">Platform fee (you owe KYM)</span><span className="font-bold">₹{Number(summary.platform_fee ?? 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-[var(--app-muted)]">You keep</span><span className="font-bold">₹{Number(summary.garage_receives ?? 0).toFixed(2)}</span></div>
                                </div>
                                <button onClick={onSuccess} className="mt-6 w-full h-14 btn-premium rounded-2xl font-bold text-white">Done</button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
