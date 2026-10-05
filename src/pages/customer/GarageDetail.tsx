import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Star, MapPin, Clock, Phone, Navigation,
    X, Check, Loader2, AlertTriangle, Flag, Timer, Calendar
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getGaragePublic, getGarageReviews, getGarageOfferedServices,
    getMyReview, submitReview, deleteMyReview, submitReport, canCustomerReviewGarage, getGarageServiceCounts,
} from '../../lib/data';
import { getOpenStatus, normalizeWorkingDays } from '../../lib/hours';
import { useToast } from '../../components/Toast';

interface Review {
    _id: string;
    rating: number;
    comment?: string;
    customerPhone: string;
    createdAt: string;
}

interface GarageDetail {
    _id: string;
    name: string;
    phone: string;
    location: {
        address: string;
        coordinates: [number, number];
    };
    serviceHours: string;
    workingDays: string;
    photoUrl?: string;
    rating: number;
    totalReviews: number;
}

interface OfferedService {
    _id: string;
    name: string;
    description?: string;
    price: number;
    duration: number;
}

export default function GarageDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { userData } = useAuth();
    const toast = useToast();

    const [garage, setGarage] = useState<GarageDetail | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [visibleReviews, setVisibleReviews] = useState(20);
    const [myReview, setMyReview] = useState<Review | null>(null);
    const [canReview, setCanReview] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [loading, setLoading] = useState(true);
    const [jobsDone, setJobsDone] = useState(0);

    // Service portfolio
    const [offeredServices, setOfferedServices] = useState<OfferedService[]>([]);

    // Report modal
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState<string>('');
    const [reportDescription, setReportDescription] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);
    const [reportSuccess, setReportSuccess] = useState(false);

    useEffect(() => {
        if (!id) return;
        fetchGarageDetails();
        fetchReviews();
        fetchOfferedServices();
        getGarageServiceCounts([id]).then((m) => setJobsDone(m.get(id) ?? 0)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, [id]);

    // Load the customer's own review + whether they may review (must have used the garage).
    useEffect(() => {
        if (!id || !userData?._id || !userData?.phoneNumber) return;
        (async () => {
            try {
                const [mine, allowed] = await Promise.all([
                    getMyReview(userData._id, id),
                    canCustomerReviewGarage(userData.phoneNumber, id),
                ]);
                setCanReview(allowed || !!mine);
                if (mine) {
                    setMyReview({ _id: `${userData._id}:${id}`, rating: mine.rating, comment: mine.comment || undefined, customerPhone: userData.phoneNumber, createdAt: '' });
                    setReviewRating(mine.rating);
                    setReviewComment(mine.comment || '');
                }
            } catch (err) {
                console.error('Error loading my review:', err);
            }
        })();
    }, [id, userData?._id, userData?.phoneNumber]);

    const fetchGarageDetails = async () => {
        try {
            if (!id) return;
            setGarage(await getGaragePublic(id));
        } catch (error) {
            console.error('Error fetching garage details:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchReviews = async () => {
        try {
            if (!id) return;
            const rows = await getGarageReviews(id);
            setReviews(rows.map((r) => ({ _id: r._id, rating: r.rating, comment: r.comment || undefined, customerPhone: '', createdAt: r.createdAt })));
        } catch (error) {
            console.error('Error fetching reviews:', error);
        }
    };

    const handleSubmitReview = async () => {
        if (reviewRating === 0) {
            toast.info('Tap a star to rate first.');
            return;
        }
        if (!id || !userData?._id) return;

        setSubmittingReview(true);
        try {
            await submitReview(userData._id, id, reviewRating, reviewComment);
            setShowReviewModal(false);
            setMyReview({ _id: `${userData._id}:${id}`, rating: reviewRating, comment: reviewComment || undefined, customerPhone: userData.phoneNumber, createdAt: '' });
            fetchReviews();
            fetchGarageDetails();
        } catch (error) {
            console.error('Error submitting review:', error);
            toast.error("Couldn't save your review. Please try again.");
        } finally {
            setSubmittingReview(false);
        }
    };

    const handleDeleteReview = async () => {
        if (!myReview || !id || !userData?._id) return;
        if (!(await toast.confirm('Delete your review?', { confirmLabel: 'Delete', danger: true }))) return;

        try {
            await deleteMyReview(userData._id, id);
            setMyReview(null);
            setReviewRating(0);
            setReviewComment('');
            fetchReviews();
            fetchGarageDetails();
        } catch (error) {
            console.error('Error deleting review:', error);
        }
    };

    const handleCall = () => {
        if (garage?.phone) window.location.href = `tel:+91${garage.phone}`;
    };

    const handleDirections = () => {
        if (garage?.location.coordinates) {
            const [lng, lat] = garage.location.coordinates;
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
        }
    };

    const fetchOfferedServices = async () => {
        try {
            if (!id) return;
            const rows = await getGarageOfferedServices(id);
            setOfferedServices(rows.map((s) => ({ _id: s._id, name: s.name, description: s.description || undefined, price: s.price, duration: s.duration })));
        } catch (err) {
            console.error('Failed to fetch offered services', err);
        }
    };

    const handleSubmitReport = async () => {
        if (!reportReason || !reportDescription.trim() || !id || !userData?._id) return;
        setSubmittingReport(true);
        try {
            await submitReport({ reporterProfileId: userData._id, garageId: id, reason: reportReason, description: reportDescription });
            setReportSuccess(true);
            setTimeout(() => {
                setShowReportModal(false);
                setReportReason('');
                setReportDescription('');
                setReportSuccess(false);
            }, 2000);
        } catch (err) {
            console.error('Error submitting report:', err);
            toast.error("Couldn't send the report. Please try again.");
        } finally {
            setSubmittingReport(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!garage) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col items-center justify-center px-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)] mb-2">Garage not found</h2>
                <button
                    onClick={() => navigate(-1)}
                    className="text-blue-600 font-semibold"
                >
                    Go back
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)]">
            {/* Header Image */}
            <div className="relative h-64 bg-gradient-to-br from-blue-600 to-indigo-700">
                {garage.photoUrl && (
                    <img
                        src={garage.photoUrl}
                        alt={garage.name}
                        className="w-full h-full object-cover"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                {/* Back button */}
                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-12 left-4 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>

                {/* Report button */}
                <button
                    onClick={() => setShowReportModal(true)}
                    className="absolute top-12 right-4 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center"
                    title="Report an issue"
                >
                    <Flag className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* Content */}
            <div className="px-6 -mt-16 relative z-10 pb-32">
                {/* Main Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-[var(--app-surface)] rounded-3xl shadow-xl p-6 mb-6"
                >
                    <h1 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)] mb-2">{garage.name}</h1>

                    <div className="flex items-center gap-2 mb-4">
                        {garage.totalReviews > 0 ? (
                            <>
                                <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg">
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                    <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                                        {garage.rating.toFixed(1)}
                                    </span>
                                </div>
                                <span className="text-slate-400 dark:text-[var(--app-muted)] text-sm">({garage.totalReviews} reviews)</span>
                            </>
                        ) : (
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg">New</span>
                        )}
                        {jobsDone > 0 && (
                            <span className="text-slate-500 dark:text-[var(--app-muted)] text-sm">· {jobsDone} jobs on KYM</span>
                        )}
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] mt-0.5" />
                            <span className="text-slate-600 dark:text-[var(--app-muted)] text-sm">{garage.location.address}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                            <span className="text-slate-600 dark:text-[var(--app-muted)] text-sm">
                                {garage.serviceHours || 'Hours not listed'}
                                {(() => {
                                    const open = getOpenStatus(garage.serviceHours, garage.workingDays);
                                    return open.known ? (
                                        <span className={`ml-2 font-semibold ${open.isOpen ? 'text-green-600' : 'text-slate-400'}`}>· {open.isOpen ? 'Open now' : 'Closed'}</span>
                                    ) : null;
                                })()}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                            <span className="text-slate-600 dark:text-[var(--app-muted)] text-sm">
                                {normalizeWorkingDays(garage.workingDays).join(', ') || 'Not listed'}
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={handleCall}
                            disabled={!garage.phone}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-700 dark:text-[var(--app-text)] py-3 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-[var(--app-surface-2)] transition-colors"
                        >
                            <Phone className="w-5 h-5" />
                            Call
                        </button>
                        <button
                            onClick={handleDirections}
                            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                        >
                            <Navigation className="w-5 h-5" />
                            Directions
                        </button>
                    </div>
                </motion.div>

                {/* Services Offered (Portfolio) */}
                {offeredServices.length > 0 && (
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-[var(--app-text)] mb-4">Services Offered</h2>
                        <div className="space-y-3">
                            {offeredServices.map((svc, i) => (
                                <motion.div
                                    key={svc._id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-[var(--app-border)]"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="font-semibold text-slate-900 dark:text-[var(--app-text)]">{svc.name}</p>
                                            {svc.description && (
                                                <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] mt-1">{svc.description}</p>
                                            )}
                                        </div>
                                        <div className="text-right ml-3">
                                            <p className="font-bold text-blue-600">Rs.{svc.price}</p>
                                            <div className="flex items-center gap-1 mt-1 text-xs text-slate-400 dark:text-[var(--app-muted)]">
                                                <Timer className="w-3 h-3" />
                                                {svc.duration} min
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Reviews Section */}
                <div className="mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-[var(--app-text)] mb-4">Reviews ({garage?.totalReviews || 0})</h2>

                    {/* Your Review */}
                    {canReview && (
                        <div className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-4 mb-4 border border-slate-100 dark:border-[var(--app-border)]">
                            {myReview ? (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-slate-900 dark:text-[var(--app-text)]">Your Review</h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setShowReviewModal(true);
                                                }}
                                                className="text-sm text-blue-600 font-semibold"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={handleDeleteReview}
                                                className="text-sm text-red-600 font-semibold"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <Star
                                                key={star}
                                                className={`w-5 h-5 ${star <= myReview.rating
                                                    ? 'fill-amber-400 text-amber-400'
                                                    : 'text-slate-300 dark:text-slate-600'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                    {myReview.comment && (
                                        <p className="text-sm text-slate-600 dark:text-[var(--app-muted)]">{myReview.comment}</p>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowReviewModal(true)}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                                >
                                    Leave a Review
                                </button>
                            )}
                        </div>
                    )}

                    {/* All Reviews */}
                    {reviews.length === 0 ? (
                        <div className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-6 text-center">
                            <Star className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-400 dark:text-[var(--app-muted)]">No reviews yet</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {reviews.slice(0, visibleReviews).map((review, i) => (
                                    <motion.div
                                        key={review._id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-4 border border-slate-100 dark:border-[var(--app-border)]"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <Star
                                                        key={star}
                                                        className={`w-4 h-4 ${star <= review.rating
                                                            ? 'fill-amber-400 text-amber-400'
                                                            : 'text-slate-300 dark:text-slate-600'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-xs text-slate-400 dark:text-[var(--app-muted)]">
                                                {new Date(review.createdAt).toLocaleDateString('en-IN', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] mb-2">{review.customerPhone}</p>
                                        {review.comment && (
                                            <p className="text-sm text-slate-700 dark:text-[var(--app-text)]">{review.comment}</p>
                                        )}
                                    </motion.div>
                                ))}
                            </div>

                            {visibleReviews < reviews.length && (
                                <button
                                    onClick={() => setVisibleReviews(prev => prev + 20)}
                                    className="w-full mt-4 py-3 bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-700 dark:text-[var(--app-text)] rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-[var(--app-surface-2)] transition-colors"
                                >
                                    See More Reviews
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Review Modal */}
            <AnimatePresence>
                {showReviewModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center"
                        onClick={() => setShowReviewModal(false)}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-[var(--app-surface)] rounded-t-3xl w-full max-w-md p-6 pb-10"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)]">
                                    {myReview ? 'Edit Review' : 'Leave a Review'}
                                </h3>
                                <button onClick={() => setShowReviewModal(false)}>
                                    <X className="w-6 h-6 text-slate-400 dark:text-[var(--app-muted)]" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-3">
                                        Your Rating *
                                    </label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button
                                                key={star}
                                                onClick={() => setReviewRating(star)}
                                                className="transition-transform hover:scale-110"
                                            >
                                                <Star
                                                    className={`w-10 h-10 ${star <= reviewRating
                                                        ? 'fill-amber-400 text-amber-400'
                                                        : 'text-slate-300 dark:text-slate-600'
                                                        }`}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">
                                        Comment (Optional)
                                    </label>
                                    <textarea
                                        value={reviewComment}
                                        onChange={(e) => setReviewComment(e.target.value)}
                                        placeholder="Share your experience..."
                                        rows={4}
                                        maxLength={500}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[var(--app-border)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    />
                                    <p className="text-xs text-slate-400 dark:text-[var(--app-muted)] mt-1">
                                        {reviewComment.length}/500 characters
                                    </p>
                                </div>

                                <button
                                    onClick={handleSubmitReview}
                                    disabled={submittingReview || reviewRating === 0}
                                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submittingReview ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="w-5 h-5" />
                                            {myReview ? 'Update Review' : 'Submit Review'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Report Modal */}
            <AnimatePresence>
                {showReportModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center"
                        onClick={() => setShowReportModal(false)}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-[var(--app-surface)] rounded-t-3xl w-full max-w-md p-6 pb-10"
                        >
                            {reportSuccess ? (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Check className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)] mb-2">Report Submitted</h3>
                                    <p className="text-slate-500 dark:text-[var(--app-muted)]">We'll review this and take action shortly.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)]">Report Issue</h3>
                                        </div>
                                        <button onClick={() => setShowReportModal(false)}>
                                            <X className="w-6 h-6 text-slate-400 dark:text-[var(--app-muted)]" />
                                        </button>
                                    </div>

                                    <div className="space-y-4 mb-6">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Reason</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { value: 'fraud', label: 'Fraud / Scam' },
                                                    { value: 'overcharging', label: 'Overcharging' },
                                                    { value: 'poor_service', label: 'Poor Service' },
                                                    { value: 'harassment', label: 'Harassment' },
                                                    { value: 'other', label: 'Other' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => setReportReason(opt.value)}
                                                        className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${reportReason === opt.value
                                                                ? 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-700 dark:text-red-300'
                                                                : 'bg-slate-50 dark:bg-[var(--app-bg)] border-slate-200 dark:border-[var(--app-border)] text-slate-600 dark:text-[var(--app-muted)] hover:border-slate-300 dark:hover:border-[var(--app-border)]'
                                                            }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">
                                                Describe the issue
                                            </label>
                                            <textarea
                                                value={reportDescription}
                                                onChange={(e) => setReportDescription(e.target.value)}
                                                placeholder="Tell us what happened..."
                                                rows={4}
                                                maxLength={1000}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[var(--app-border)] focus:outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm"
                                            />
                                            <p className="text-xs text-slate-400 dark:text-[var(--app-muted)] mt-1 text-right">
                                                {reportDescription.length}/1000
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleSubmitReport}
                                        disabled={!reportReason || !reportDescription.trim() || submittingReport}
                                        className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {submittingReport ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <>
                                                <AlertTriangle className="w-5 h-5" />
                                                Submit Report
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
