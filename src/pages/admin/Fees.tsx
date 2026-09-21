import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Wallet, TrendingUp, CheckCircle2, RefreshCw, Building2 } from 'lucide-react';
import { getAdminFeeOverview, type AdminFeeOverview } from '../../lib/data';

export default function AdminFees() {
    const [data, setData] = useState<AdminFeeOverview | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            setData(await getAdminFeeOverview());
        } catch (err) {
            console.error('Fetch fee overview error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const inr = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const when = (iso: string | null) =>
        iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    if (!data) return null;

    const cards = [
        { label: 'Outstanding (owed to KYM)', value: inr(data.totalOutstanding), icon: Wallet, accent: 'text-amber-500' },
        { label: 'Lifetime fees accrued', value: inr(data.totalAccrued), icon: TrendingUp, accent: 'text-blue-400' },
        { label: 'Lifetime settled', value: inr(data.totalSettled), icon: CheckCircle2, accent: 'text-emerald-500' },
    ];

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-light text-white tracking-tight">Platform Fees</h1>
                    <p className="text-zinc-500 text-sm mt-1">What each garage owes and has settled to KnowYourMechanic.</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((c, i) => (
                    <motion.div
                        key={c.label}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                        className="bg-black border border-zinc-800 rounded-2xl p-6"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-zinc-500 text-[11px] font-medium tracking-widest uppercase">{c.label}</p>
                            <c.icon className={`w-4 h-4 ${c.accent}`} />
                        </div>
                        <p className="text-3xl font-light text-white">{c.value}</p>
                    </motion.div>
                ))}
            </div>

            <p className="text-xs text-zinc-500">
                <span className="text-zinc-300 font-medium">{data.garagesOwing}</span> garage{data.garagesOwing === 1 ? '' : 's'} currently owe a balance.
            </p>

            {/* Per-garage table */}
            <div className="bg-black border border-zinc-900 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-widest text-zinc-500 border-b border-zinc-900">
                                <th className="px-5 py-3 font-medium">Garage</th>
                                <th className="px-5 py-3 font-medium text-right">Accrued</th>
                                <th className="px-5 py-3 font-medium text-right">Settled</th>
                                <th className="px-5 py-3 font-medium text-right">Outstanding</th>
                                <th className="px-5 py-3 font-medium text-right">Last settled</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-600">
                                        <Building2 className="w-6 h-6 mx-auto mb-2 text-zinc-700" />
                                        No platform fees recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                data.rows.map((r) => (
                                    <tr key={r.garageId} className="border-b border-zinc-900/60 hover:bg-zinc-900/40 transition-colors">
                                        <td className="px-5 py-3.5 text-zinc-200 font-medium">{r.name}</td>
                                        <td className="px-5 py-3.5 text-right text-zinc-400 font-mono">{inr(r.accrued)}</td>
                                        <td className="px-5 py-3.5 text-right text-emerald-500/90 font-mono">{inr(r.settled)}</td>
                                        <td className={`px-5 py-3.5 text-right font-mono font-semibold ${r.outstanding > 0.001 ? 'text-amber-400' : 'text-zinc-500'}`}>
                                            {inr(Math.max(0, r.outstanding))}
                                        </td>
                                        <td className="px-5 py-3.5 text-right text-zinc-500 font-mono text-xs">{when(r.lastSettledAt)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-[10px] text-zinc-700 font-mono">
                Outstanding = fees accrued minus settlements. Settlement is confirmed server-side by the Razorpay webhook.
            </p>
        </div>
    );
}
