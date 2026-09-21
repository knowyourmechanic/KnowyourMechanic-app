import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, IndianRupee, Send, Loader2, Check, QrCode, Banknote, ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react';
import {
    createServiceRecordWithOtp,
    verifyServiceOtp,
    completeServicePayment,
    notifyInvoice,
    getMyGarageQr,
    type PaymentSummary,
} from '../lib/data';

interface AddServiceModalProps {
    isOpen: boolean;
    garageId: string;
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'form' | 'otp' | 'payment' | 'success';
type PayView = 'choose' | 'qr' | 'cashConfirm';

// The platform fee the garage owes KYM per digital service (shown to the
// customer as part of the amount to pay; the server is the source of truth).
const PLATFORM_FEE = 3.9;

export default function AddServiceModal({ isOpen, garageId, onClose, onSuccess }: AddServiceModalProps) {
    const [step, setStep] = useState<Step>('form');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [customerPhone, setCustomerPhone] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [amount, setAmount] = useState('');

    const [recordId, setRecordId] = useState('');
    const [devOtp, setDevOtp] = useState('');
    const [otp, setOtp] = useState('');
    const [summary, setSummary] = useState<PaymentSummary | null>(null);
    const [payView, setPayView] = useState<PayView>('choose');
    const [garageQrUrl, setGarageQrUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setStep('form'); setError(''); setCustomerPhone(''); setVehicleNumber('');
            setNotes(''); setAmount('');
            setRecordId(''); setDevOtp(''); setOtp(''); setSummary(null);
            setPayView('choose'); setGarageQrUrl(null);
        }
    }, [isOpen]);

    const feeTotal = Number(amount || 0) + PLATFORM_FEE;

    const canSubmit =
        customerPhone.replace(/\D/g, '').length === 10 &&
        vehicleNumber.trim().length > 0 &&
        notes.trim().length > 0 &&
        Number(amount) > 0;

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
                vehicleNumber: vehicleNumber.trim().toUpperCase() || null,
                modelYear: null,
                odometerKm: null,
                serviceCodes: [],
                failureCodes: [],
                serviceNotes: notes.trim(),
                amount: Number(amount),
                customerHasApp: true,
            });
            setRecordId(res.serviceRecordId);
            setDevOtp(res.devOtp || '');
            setStep('otp');
        } catch (err: any) {
            setError(err.message || 'Could not create the service record.');
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
                setPayView('choose');
                setStep('payment');
            } else {
                setError(
                    res.reason === 'invalid'
                        ? `Incorrect OTP${res.remainingAttempts != null ? ` (${res.remainingAttempts} left)` : ''}.`
                        : res.reason === 'expired'
                            ? 'OTP expired.'
                            : 'Too many attempts.'
                );
            }
        } catch (err: any) {
            setError(err.message || 'OTP verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async (method: 'qr' | 'cash') => {
        setError('');
        setLoading(true);
        try {
            const s = await completeServicePayment(recordId, method);
            setSummary(s);
            setStep('success');
            // Fire the invoice notification (push/WhatsApp). Best-effort: payment
            // is already done, so never let a send hiccup break the success flow.
            notifyInvoice(recordId).catch(() => {});
        } catch (err: any) {
            setError(err.message || 'Payment failed.');
        } finally {
            setLoading(false);
        }
    };


    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
                    onClick={onClose}
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
                            <button onClick={onClose} className="text-slate-400 dark:text-[var(--app-muted)] active:scale-90 transition-transform">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* ---- FORM ---- */}
                        {step === 'form' && (
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">Customer phone</label>
                                    <div className="relative mt-2">
                                        <Phone className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                                        <input type="tel" value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            placeholder="10-digit number"
                                            className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl pl-12 pr-4 text-lg font-medium" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)]">Vehicle number</label>
                                    <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="MH12AB1234"
                                        className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl px-4 mt-2 text-lg font-medium tracking-wide uppercase" />
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
                                        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" className="w-full h-14 bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl pl-12 pr-4 text-lg font-semibold" />
                                    </div>
                                </div>

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
                                <p className="text-slate-500 dark:text-[var(--app-muted)]">The customer shares the 6-digit OTP with you. The garage cannot skip this step.</p>
                                {devOtp && (
                                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-3 text-amber-800 dark:text-amber-200 font-bold text-center">
                                        Dev OTP: {devOtp}
                                    </div>
                                )}
                                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000" maxLength={6}
                                    className="w-full h-20 bg-slate-50 dark:bg-[var(--app-bg)] rounded-3xl text-center text-4xl font-bold tracking-[1rem]" />
                                {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}
                                <button onClick={handleVerify} disabled={otp.length < 6 || loading}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Verify OTP'}
                                </button>
                            </div>
                        )}

                        {/* ---- PAYMENT ---- */}
                        {step === 'payment' && (
                            <div className="p-6 space-y-4">
                                {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}

                                {/* Choose payment method */}
                                {payView === 'choose' && (
                                    <>
                                        <p className="text-slate-500 dark:text-[var(--app-muted)]">Paying by UPI is a <b className="text-slate-700 dark:text-[var(--app-text)]">verified, trusted</b> transaction. Cash is unverified — the service will be marked <b className="text-amber-700 dark:text-amber-300">Not Trusted</b> on the customer's record.</p>
                                        <button onClick={() => setPayView('qr')} disabled={loading}
                                            className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                            <QrCode className="w-5 h-5" /> Pay by UPI (verified)
                                        </button>
                                        <button onClick={() => setPayView('cashConfirm')} disabled={loading}
                                            className="w-full h-16 bg-slate-900 dark:bg-slate-800 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                            <Banknote className="w-5 h-5" /> Cash (fee-free, not trusted)
                                        </button>
                                    </>
                                )}

                                {/* Show the garage's static QR + amount, then Receive */}
                                {payView === 'qr' && (
                                    <>
                                        <p className="text-slate-500 dark:text-[var(--app-muted)] text-center">Ask the customer to scan and pay this amount.</p>

                                        <div className="bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl p-4 flex flex-col items-center">
                                            {garageQrUrl ? (
                                                <img src={garageQrUrl} alt="Garage payment QR" className="w-52 h-52 object-contain rounded-xl bg-white p-2" />
                                            ) : (
                                                <div className="w-52 h-52 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 flex flex-col items-center justify-center text-center px-4">
                                                    <AlertTriangle className="w-7 h-7 text-amber-600 mb-2" />
                                                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">No payment QR set yet</p>
                                                    <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">Add one in Settings → Payment QR, or collect by cash.</p>
                                                </div>
                                            )}
                                            <div className="w-full mt-4 space-y-1.5">
                                                <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-[var(--app-muted)]">Service amount</span><span className="font-semibold">₹{Number(amount || 0).toFixed(2)}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-slate-500 dark:text-[var(--app-muted)]">Platform fee</span><span className="font-semibold">₹{PLATFORM_FEE.toFixed(2)}</span></div>
                                                <div className="flex justify-between text-base pt-1.5 border-t border-slate-200 dark:border-[var(--app-border)]"><span className="font-bold text-slate-900 dark:text-[var(--app-text)]">Amount to pay</span><span className="font-black text-slate-900 dark:text-[var(--app-text)]">₹{feeTotal.toFixed(2)}</span></div>
                                            </div>
                                        </div>

                                        <button onClick={() => handlePayment('qr')} disabled={loading}
                                            className="w-full h-16 btn-premium rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Received — complete service
                                        </button>
                                        <button onClick={() => { setPayView('choose'); setError(''); }} disabled={loading}
                                            className="w-full h-12 rounded-2xl font-semibold text-slate-600 dark:text-[var(--app-muted)] flex items-center justify-center gap-1">
                                            <ArrowLeft className="w-4 h-4" /> Cancel
                                        </button>
                                    </>
                                )}

                                {/* Cash confirmation */}
                                {payView === 'cashConfirm' && (
                                    <>
                                        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 flex gap-3">
                                            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-amber-900 dark:text-amber-200">Mark this service “Not Trusted”?</p>
                                                <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-1">Cash skips verification. This service will show as <b>Not Trusted</b> on the customer's record and won't carry the verified badge. This can't be changed later.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => handlePayment('cash')} disabled={loading}
                                            className="w-full h-16 bg-slate-900 dark:bg-slate-800 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40">
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />} Yes, complete with cash
                                        </button>
                                        <button onClick={() => { setPayView('choose'); setError(''); }} disabled={loading}
                                            className="w-full h-12 rounded-2xl font-semibold text-slate-600 dark:text-[var(--app-muted)]">
                                            Go back
                                        </button>
                                    </>
                                )}
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
                                    {summary.verified && <div className="flex items-center gap-1 text-green-600 font-semibold pt-1"><ShieldCheck className="w-4 h-4" /> Verified transaction</div>}
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
