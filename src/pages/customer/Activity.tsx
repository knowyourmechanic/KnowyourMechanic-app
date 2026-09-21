import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Wrench, Loader2, Calendar, AlertCircle, ArrowLeft, Star, X, Check, Edit2, Flag, Download, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getCustomerServiceHistory, getMyReview, submitReview, submitReport } from '../../lib/data';

interface ServiceRecord {
    _id: string;
    garageId: {
        _id: string;
        name: string;
        photoUrl?: string;
        location?: {
            address: string;
        };
    };
    description: string;
    amount: number;
    paymentMethod: string;
    isReliable: boolean;
    createdAt: string;
}

interface Review {
    _id?: string;
    rating: number;
    comment?: string | null;
}

interface GarageReviews {
    [garageId: string]: Review | null;
}

export default function CustomerActivity() {
    const [services, setServices] = useState<ServiceRecord[]>([]);
    const [garageReviews, setGarageReviews] = useState<GarageReviews>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reviewingGarageId, setReviewingGarageId] = useState<string | null>(null);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    // Report state
    const [reportGarageId, setReportGarageId] = useState<string | null>(null);
    const [reportGarageName, setReportGarageName] = useState('');
    const [reportReason, setReportReason] = useState('');
    const [reportDescription, setReportDescription] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);
    const [reportSuccess, setReportSuccess] = useState(false);

    const navigate = useNavigate();
    const { userData } = useAuth();

    useEffect(() => {
        if (userData?.phoneNumber) fetchServiceHistory();
    }, [userData?.phoneNumber]);

    const fetchServiceHistory = async () => {
        try {
            const phone = userData?.phoneNumber;
            if (!phone) { setLoading(false); return; }

            const rows = await getCustomerServiceHistory(phone);
            const mapped: ServiceRecord[] = rows.map((r) => ({
                _id: r.id,
                garageId: { _id: r.garage_id, name: r.garage_name },
                description: r.description,
                amount: Number(r.amount),
                paymentMethod: r.payment_method || 'cash',
                isReliable: r.is_reliable,
                createdAt: r.created_at,
            }));
            setServices(mapped);

            // Load the customer's own reviews for the garages in their history.
            const uniqueGarageIds = [...new Set(mapped.map((s) => s.garageId?._id).filter(Boolean))] as string[];
            if (userData?._id) {
                const entries = await Promise.all(
                    uniqueGarageIds.map(async (gid) => [gid, await getMyReview(userData._id, gid)] as const),
                );
                setGarageReviews(Object.fromEntries(entries));
            }
        } catch (err) {
            console.error('Error fetching service history:', err);
            setError('Failed to load service history');
        } finally {
            setLoading(false);
        }
    };

    const startReview = (garageId: string) => {
        const existingReview = garageReviews[garageId];
        if (existingReview) {
            setReviewRating(existingReview.rating);
            setReviewComment(existingReview.comment || '');
        } else {
            setReviewRating(0);
            setReviewComment('');
        }
        setReviewingGarageId(garageId);
    };

    const handleSubmitReview = async () => {
        if (reviewRating === 0 || !reviewingGarageId || !userData?._id) return;

        setSubmittingReview(true);
        try {
            const review = await submitReview(userData._id, reviewingGarageId, reviewRating, reviewComment);
            setGarageReviews(prev => ({ ...prev, [reviewingGarageId]: review }));
            setReviewingGarageId(null);
        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Failed to submit review');
        } finally {
            setSubmittingReview(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    if (loading) {
        return (
            <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    const handleSubmitReport = async () => {
        if (!reportReason || !reportDescription.trim() || !reportGarageId || !userData?._id) return;
        setSubmittingReport(true);
        try {
            await submitReport({
                reporterProfileId: userData._id,
                garageId: reportGarageId,
                reason: reportReason,
                description: reportDescription,
            });
            setReportSuccess(true);
            setTimeout(() => setReportGarageId(null), 2000);
        } catch (err) {
            console.error('Error submitting report:', err);
            alert('Failed to submit report. Please try again.');
        } finally {
            setSubmittingReport(false);
        }
    };

    // Client-side invoice: builds a printable HTML file from the record we already have.
    // (A richer PDF invoice can replace this later.)
    const downloadInvoice = (service: ServiceRecord) => {
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${service._id}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:600px;margin:40px auto;padding:0 24px}
h1{font-size:22px;margin:0 0 4px}.muted{color:#64748b;font-size:13px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0}
.total{font-weight:700;font-size:18px;border-bottom:none;padding-top:16px}
.badge{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#16a34a}</style></head>
<body><h1>KnowYourMechanic</h1><p class="muted">Service Invoice</p><div style="margin:24px 0">
<div class="row"><span class="muted">Garage</span><span>${service.garageId?.name || 'Garage'}</span></div>
<div class="row"><span class="muted">Service</span><span>${service.description || '-'}</span></div>
<div class="row"><span class="muted">Date</span><span>${formatDate(service.createdAt)}</span></div>
<div class="row"><span class="muted">Invoice ID</span><span>${service._id}</span></div>
<div class="row total"><span>Total</span><span>&#8377;${service.amount}</span></div>
</div><p class="muted">Thank you for using KnowYourMechanic.</p></body></html>`;
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice-${service._id}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const mainContent = (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pt-safe pb-6">
            {/* Header */}
            <header className="bg-blue-600 text-white px-6 py-8 rounded-b-[2.5rem] mb-4">
                <button
                    onClick={() => navigate('/customer')}
                    className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back</span>
                </button>
                <h1 className="text-2xl font-black">Activity</h1>
                <p className="text-blue-200 text-sm">Your service history</p>
            </header>

            <div className="px-6">
                {error && (
                    <div className="bg-red-50 dark:bg-red-950/40 text-red-600 p-4 rounded-2xl mb-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    {services.map((service, i) => {
                        const garageId = service.garageId?._id;
                        const myReview = garageId ? garageReviews[garageId] : null;
                        const isReviewing = reviewingGarageId === garageId;

                        return (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                key={service._id}
                                className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-5 shadow-sm"
                            >
                                {/* Service Info */}
                                <div
                                    className="flex items-start gap-4 mb-3 cursor-pointer"
                                    onClick={() => garageId && navigate(`/customer/garage/${garageId}`)}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center overflow-hidden">
                                        {service.garageId?.photoUrl ? (
                                            <img
                                                src={service.garageId.photoUrl}
                                                alt={service.garageId.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Wrench className="w-7 h-7 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)]">{service.garageId?.name || 'Unknown Garage'}</h3>
                                        </div>
                                        <p className="text-slate-600 dark:text-[var(--app-muted)] text-sm line-clamp-2">{service.description}</p>
                                    </div>
                                </div>

                                {/* Date, Amount */}
                                <div className="flex items-center justify-between py-3 border-t border-slate-100 dark:border-[var(--app-border)]">
                                    <div className="flex items-center gap-1 text-slate-500 dark:text-[var(--app-muted)] text-sm">
                                        <Calendar className="w-4 h-4" />
                                        {formatDate(service.createdAt)}
                                    </div>
                                    <span className="font-bold text-lg text-slate-900 dark:text-[var(--app-text)]">₹{service.amount}</span>
                                </div>

                                {/* Review Section */}
                                <div className="pt-3 border-t border-slate-100 dark:border-[var(--app-border)] flex items-start justify-between">
                                    <div className="flex-1">
                                        {isReviewing ? (
                                            // Inline Review Form
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-slate-700 dark:text-[var(--app-text)]">Your Rating</span>
                                                    <button onClick={() => setReviewingGarageId(null)}>
                                                        <X className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                                                    </button>
                                                </div>
                                                <div className="flex gap-1">
                                                    {[1, 2, 3, 4, 5].map(star => (
                                                        <button
                                                            key={star}
                                                            onClick={() => setReviewRating(star)}
                                                            className="transition-transform hover:scale-110"
                                                        >
                                                            <Star
                                                                className={`w-8 h-8 ${star <= reviewRating
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'text-slate-300 dark:text-slate-600'
                                                                    }`}
                                                            />
                                                        </button>
                                                    ))}
                                                </div>
                                                <textarea
                                                    value={reviewComment}
                                                    onChange={(e) => setReviewComment(e.target.value)}
                                                    placeholder="Add a comment (optional)"
                                                    rows={2}
                                                    maxLength={500}
                                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[var(--app-border)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <button
                                                    onClick={handleSubmitReview}
                                                    disabled={submittingReview || reviewRating === 0}
                                                    className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {submittingReview ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Check className="w-4 h-4" />
                                                            {myReview ? 'Update Review' : 'Submit Review'}
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        ) : myReview ? (
                                            // Show Existing Review
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-1">
                                                        {[1, 2, 3, 4, 5].map(star => (
                                                            <Star
                                                                key={star}
                                                                className={`w-4 h-4 ${star <= myReview.rating
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'text-slate-300 dark:text-slate-600'
                                                                    }`}
                                                            />
                                                        ))}
                                                        <span className="text-sm text-slate-500 dark:text-[var(--app-muted)] ml-2">Your Review</span>
                                                    </div>
                                                    <button
                                                        onClick={() => garageId && startReview(garageId)}
                                                        className="flex items-center gap-1 text-blue-600 text-sm font-semibold"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
                                                        Edit
                                                    </button>
                                                </div>
                                                {myReview.comment && (
                                                    <p className="text-sm text-slate-600 dark:text-[var(--app-muted)]">{myReview.comment}</p>
                                                )}
                                            </div>
                                        ) : (
                                            // Rate Prompt
                                            <button
                                                onClick={() => garageId && startReview(garageId)}
                                                className="flex items-center gap-2 text-blue-600 text-sm font-semibold"
                                            >
                                                <Star className="w-4 h-4" />
                                                Rate this service
                                            </button>
                                        )}
                                    </div>
                                    {/* Report Link */}
                                    {garageId && (
                                        <div className="flex flex-col ml-3 mt-1 gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    downloadInvoice(service);
                                                }}
                                                className="p-2 text-slate-300 dark:text-slate-600 hover:text-blue-500 transition-colors"
                                                title="Download Invoice"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const garageId = typeof service.garageId === 'object' ? service.garageId._id : service.garageId;
                                                    const garageName = typeof service.garageId === 'object' ? service.garageId.name : 'this garage';
                                                    setReportGarageId(garageId);
                                                    setReportGarageName(garageName);
                                                    setReportReason('');
                                                    setReportDescription('');
                                                    setReportSuccess(false);
                                                }}
                                                className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                                                title="Report an issue"
                                            >
                                                <Flag className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}

                    {services.length === 0 && !error && (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-20 h-20 bg-slate-100 dark:bg-[var(--app-surface-2)] rounded-3xl flex items-center justify-center text-slate-300 dark:text-slate-600 mb-6">
                                <Clock className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-400 dark:text-[var(--app-muted)]">No services yet</h3>
                            <p className="text-slate-300 dark:text-slate-600 font-medium mt-2">
                                Your service history will appear here
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {mainContent}

            {/* Report Modal */}
            <AnimatePresence>
                {reportGarageId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                        onClick={() => setReportGarageId(null)}
                    >
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="bg-white dark:bg-[var(--app-surface)] rounded-3xl w-full max-w-md p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            {reportSuccess ? (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Check className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-[var(--app-text)]">Report Submitted</h3>
                                    <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm mt-2">We'll review your report and take action.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 rounded-xl flex items-center justify-center">
                                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-black text-lg text-slate-900 dark:text-[var(--app-text)]">Report Issue</h3>
                                                <p className="text-xs text-slate-400 dark:text-[var(--app-muted)]">{reportGarageName}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setReportGarageId(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-[var(--app-surface-2)] rounded-xl"><X className="w-5 h-5" /></button>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        {[
                                            { value: 'overcharging', label: 'Overcharging' },
                                            { value: 'poor_service', label: 'Poor Service' },
                                            { value: 'fraud', label: 'Fraud / Scam' },
                                            { value: 'harassment', label: 'Harassment' },
                                            { value: 'other', label: 'Other' },
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setReportReason(opt.value)}
                                                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${reportReason === opt.value
                                                    ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                                                    : 'border-slate-200 dark:border-[var(--app-border)] text-slate-600 dark:text-[var(--app-muted)] hover:border-slate-300 dark:hover:border-[var(--app-border)]'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>

                                    <textarea
                                        value={reportDescription}
                                        onChange={e => setReportDescription(e.target.value)}
                                        placeholder="Describe the issue in detail..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[var(--app-border)] text-sm resize-none focus:ring-2 focus:ring-red-500 focus:outline-none mb-4"
                                    />

                                    <button
                                        onClick={handleSubmitReport}
                                        disabled={!reportReason || !reportDescription.trim() || submittingReport}
                                        className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {submittingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                                        Submit Report
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
