import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertTriangle, CheckCircle2, IndianRupee, RefreshCw } from 'lucide-react';
import { getMyGarageSettlement, createFeeSettlementOrder, isFeeSettlementEnabled, type GarageSettlement } from '../lib/data';
import { openRazorpayCheckout } from '../lib/razorpay';

interface Props {
    garageId: string;
    garageName?: string;
    reloadSignal?: number;   // bump to re-check after a new service accrues a fee
}

// Shows the platform fees a garage owes KYM and lets them settle in-app via
// Razorpay Standard Checkout. The webhook clears the ledger server-side, so
// after a successful payment we poll the status until it reflects the payment.
export default function FeeSettlementCard({ garageId, garageName, reloadSignal }: Props) {
    const [status, setStatus] = useState<GarageSettlement | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [confirming, setConfirming] = useState(false); // waiting for webhook to clear the ledger
    const [error, setError] = useState('');
    const [justPaid, setJustPaid] = useState(false);

    const load = useCallback(async () => {
        if (!garageId) return;
        setLoading(true);
        try {
            const on = await isFeeSettlementEnabled();
            setEnabled(on);
            if (on) setStatus(await getMyGarageSettlement(garageId));
        } finally {
            setLoading(false);
        }
    }, [garageId]);

    useEffect(() => { load(); }, [load, reloadSignal]);

    // Poll the status until the owed amount drops (webhook processed) or we give up.
    const waitForClearance = async (before: number) => {
        for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            const next = await getMyGarageSettlement(garageId);
            if (next.outstanding < before) { setStatus(next); return true; }
        }
        await load();
        return false;
    };

    const handlePay = async () => {
        setError('');
        setPaying(true);
        try {
            const order = await createFeeSettlementOrder(garageId);
            if (order.nothingDue || !order.orderId) { await load(); setPaying(false); return; }

            const before = status?.outstanding ?? 0;
            await openRazorpayCheckout({
                keyId: order.keyId!,
                orderId: order.orderId,
                amount: order.amount!,
                currency: order.currency || 'INR',
                name: garageName || 'KnowYourMechanic',
                description: 'Platform fee settlement',
            });

            // Payment succeeded in the sheet — the webhook now clears the ledger.
            setPaying(false);
            setConfirming(true);
            const cleared = await waitForClearance(before);
            setConfirming(false);
            if (cleared) { setJustPaid(true); setTimeout(() => setJustPaid(false), 4000); }
        } catch (err: any) {
            setPaying(false);
            setConfirming(false);
            // A user-cancelled sheet isn't an error worth shouting about.
            if (err?.message && err.message !== 'Payment cancelled.') setError(err.message);
        }
    };

    // Silent while first loading, and fully hidden until the flow is switched on.
    if (loading && !status) return null;
    if (!enabled) return null;

    const owed = status?.outstanding ?? 0;

    if (owed <= 0) {
        if (!justPaid) return null;
        return (
            <div className="mb-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-green-800 dark:text-green-200">Fees settled — thank you!</span>
            </div>
        );
    }

    const locked = !!status?.locked;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 rounded-2xl p-5 border ${locked
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50'}`}
        >
            <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${locked ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600'}`}>
                    {locked ? <AlertTriangle className="w-5 h-5" /> : <IndianRupee className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`font-bold ${locked ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'}`}>
                        {locked ? 'New services paused' : 'Platform fees due'}
                    </p>
                    <p className={`text-sm mt-0.5 ${locked ? 'text-red-800 dark:text-red-300/90' : 'text-amber-800 dark:text-amber-300/90'}`}>
                        {locked
                            ? 'Settle your pending platform fees to start adding services again.'
                            : 'Collected on your UPI services. Please settle to KnowYourMechanic.'}
                    </p>
                </div>
                <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-[var(--app-text)]" title="Refresh">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <span className={`text-sm ${locked ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>Amount due</span>
                <span className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)]">₹{owed.toFixed(2)}</span>
            </div>

            {error && (
                <p className="mt-3 text-sm text-red-600 bg-red-100/60 dark:bg-red-950/50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
                onClick={handlePay}
                disabled={paying || confirming}
                className="mt-4 w-full h-14 bg-blue-600 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
                {paying ? (<><Loader2 className="w-5 h-5 animate-spin" /> Opening payment…</>)
                    : confirming ? (<><Loader2 className="w-5 h-5 animate-spin" /> Confirming payment…</>)
                        : (<>Pay ₹{owed.toFixed(2)}</>)}
            </button>
        </motion.div>
    );
}
