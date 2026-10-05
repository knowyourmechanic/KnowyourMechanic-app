import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Loader2, Flag, AlertTriangle, Shield, CheckCircle,
    XCircle, Clock, ChevronDown, Building2, User,
    type LucideIcon,
} from 'lucide-react';
import { getAdminReports, updateReportStatus, type ReportStatus } from '../../lib/data';

const REASON_LABELS: Record<string, string> = {
    fraud: 'Fraud / Scam',
    overcharging: 'Overcharging',
    poor_service: 'Poor Service',
    harassment: 'Harassment',
    service_not_received: 'Service not received',
    other: 'Other',
};

const STATUS_CONFIG: Record<string, { label: string; textClass: string; borderClass: string; icon: LucideIcon; dotClass: string }> = {
    pending: { label: 'Pending', textClass: 'text-amber-500', borderClass: 'border-amber-500/30 bg-amber-500/5', dotClass: 'bg-amber-500', icon: Clock },
    reviewing: { label: 'Reviewing', textClass: 'text-blue-400', borderClass: 'border-blue-500/30 bg-blue-500/5', dotClass: 'bg-blue-500', icon: Shield },
    resolved: { label: 'Resolved', textClass: 'text-emerald-500', borderClass: 'border-emerald-500/30 bg-emerald-500/5', dotClass: 'bg-emerald-500', icon: CheckCircle },
    dismissed: { label: 'Dismissed', textClass: 'text-zinc-400', borderClass: 'border-zinc-700 bg-zinc-900', dotClass: 'bg-zinc-500', icon: XCircle },
};

interface ReportItem {
    _id: string;
    reporterId: { name?: string; phoneNumber: string };
    garageId: { _id: string; name: string };
    reason: string;
    description: string;
    status: string;
    createdAt: string;
}

export default function AdminReports() {
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [updating, setUpdating] = useState('');

    useEffect(() => {
        fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, [filter]);

    const fetchReports = async () => {
        try {
            const all = await getAdminReports();
            setReports(filter === 'all' ? all : all.filter((r) => r.status === filter));
        } catch (err) {
            console.error('Fetch reports error:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (id: string, status: ReportStatus) => {
        setUpdating(id);
        try {
            await updateReportStatus(id, status);
            fetchReports();
        } catch (err) {
            console.error('Update status error:', err);
        } finally {
            setUpdating('');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    const pendingCount = filter === 'all' ? reports.filter(r => r.status === 'pending').length : 0;

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800">
            <main className="max-w-5xl mx-auto p-6 space-y-4 pt-10">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-light tracking-tight text-white">Reports Queue</h1>
                        {pendingCount > 0 && (
                            <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold">
                                {pendingCount} PENDING
                            </span>
                        )}
                    </div>

                    {/* Filter Dropdown */}
                    <div className="relative">
                        <select
                            value={filter}
                            onChange={e => { setFilter(e.target.value); setLoading(true); }}
                            className="bg-black border border-zinc-800 hover:border-zinc-700 transition-colors rounded px-3 py-1.5 text-xs font-mono text-zinc-300 appearance-none pr-8 focus:outline-none focus:border-zinc-600"
                        >
                            <option value="all">ALL_REPORTS</option>
                            <option value="pending">STATUS: PENDING</option>
                            <option value="reviewing">STATUS: REVIEWING</option>
                            <option value="resolved">STATUS: RESOLVED</option>
                            <option value="dismissed">STATUS: DISMISSED</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    </div>
                </div>

                {reports.length === 0 ? (
                    <div className="border border-dashed border-zinc-800 rounded-lg py-20 text-center text-zinc-600">
                        <Flag className="w-8 h-8 mx-auto mb-3 opacity-30 text-zinc-500" />
                        <p className="text-sm font-medium text-zinc-300 mb-1">Queue is empty</p>
                        <p className="text-xs">
                            {filter !== 'all' ? 'No reports matching this filter' : 'No active customer reports requiring attention'}
                        </p>
                    </div>
                ) : (
                    <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden">
                        <div className="divide-y divide-zinc-900">
                            {reports.map((report, i) => {
                                const statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;

                                return (
                                    <motion.div
                                        key={report._id}
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="p-5 hover:bg-zinc-900/30 transition-colors group"
                                    >
                                        <div className="flex items-start justify-between gap-6 mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-1.5">
                                                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono tracking-widest font-bold uppercase ${statusConf.borderClass} ${statusConf.textClass}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dotClass}`} />
                                                        {statusConf.label}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500 font-mono">
                                                        {new Date(report.createdAt).toISOString().split('T')[0]}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <AlertTriangle className="w-4 h-4 text-zinc-500" />
                                                    <h3 className="text-sm font-medium text-white">{REASON_LABELS[report.reason] || report.reason}</h3>
                                                </div>
                                                <p className="text-sm text-zinc-400 leading-relaxed border-l-2 border-zinc-800 pl-3 py-0.5 ml-2 mr-10">
                                                    "{report.description}"
                                                </p>
                                            </div>

                                            {/* Report Actions (Right Aligned) */}
                                            {report.status !== 'resolved' && report.status !== 'dismissed' && (
                                                <div className="flex flex-col gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {report.status === 'pending' && (
                                                        <button
                                                            onClick={() => updateStatus(report._id, 'reviewing')}
                                                            disabled={updating === report._id}
                                                            className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded hover:bg-zinc-200 transition-colors disabled:opacity-50"
                                                        >
                                                            Start Review
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => updateStatus(report._id, 'resolved')}
                                                        disabled={updating === report._id}
                                                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium rounded hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
                                                    >
                                                        Mark Resolved
                                                    </button>
                                                    <button
                                                        onClick={() => updateStatus(report._id, 'dismissed')}
                                                        disabled={updating === report._id}
                                                        className="px-3 py-1.5 bg-transparent border border-zinc-900 text-zinc-600 text-xs font-medium rounded hover:bg-zinc-900 hover:border-zinc-800 hover:text-zinc-400 transition-colors disabled:opacity-50"
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-6 mt-4 ml-6 pl-1 text-[11px] text-zinc-500">
                                            <div className="flex items-center gap-1.5">
                                                <User className="w-3.5 h-3.5 text-zinc-600" />
                                                <span className="font-mono">{report.reporterId?.name || report.reporterId?.phoneNumber || 'Unknown'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Building2 className="w-3.5 h-3.5 text-zinc-600" />
                                                <span>{report.garageId?.name || 'Unknown garage'}</span>
                                                <span className="font-mono text-zinc-700 bg-zinc-900 px-1 py-0.5 rounded cursor-copy hover:text-zinc-400 transition-colors" title="Copy Garage ID">
                                                    {report.garageId?._id?.slice(-6) || '---'}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
