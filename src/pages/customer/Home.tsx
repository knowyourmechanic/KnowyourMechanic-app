import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Star, Phone, LogOut, X, Loader2, Filter, Navigation, ChevronRight, Settings, Clock, Headphones, User, RefreshCw, AlertTriangle, Car, CalendarClock, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../contexts/AuthContext';
import {
    buildPassports, discoverGarages, formatDistance, getCustomerProfile, getCustomerServiceHistory, getGarageServiceCounts,
    getMyPendingServices, getUnratedGarage, reminderFor, submitReview,
    type NearbyGarage, type PendingService, type UnratedGarage,
} from '../../lib/data';
import { getOpenStatus, openLabel } from '../../lib/hours';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { useToast } from '../../components/Toast';
import PendingServiceCard from '../../components/PendingServiceCard';
import { haptic } from '../../lib/haptics';
import GarageMap from '../../components/GarageMap';
import GaragePhoto from '../../components/GaragePhoto';
import { useNotifications } from '../../hooks/useNotifications';

const SEARCH_RADIUS_KM = 5;
const PAGE_SIZE = 5;

type SortKey = 'distance' | 'rating' | 'reviews' | 'jobs';

const SORT_OPTIONS: { value: SortKey; label: MessageKey }[] = [
    { value: 'distance', label: 'home.sortNearest' },
    { value: 'rating', label: 'home.sortTop' },
    { value: 'reviews', label: 'home.sortReviewed' },
    { value: 'jobs', label: 'home.sortJobs' },
];

interface DueVehicle { vehicleNumber: string; lastServiceAt: string }

function directionsUrl(g: NearbyGarage): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}`;
}

function RatingBadge({ garage }: { garage: NearbyGarage }) {
    const { t } = useI18n();
    if (garage.reviews === 0) {
        return (
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900/50">
                {t('home.new')}
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md border border-amber-100 dark:border-amber-900/50">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="font-bold text-amber-700 dark:text-amber-300">{garage.rating.toFixed(1)}</span>
            <span className="text-slate-400 dark:text-[var(--app-muted)]">({garage.reviews})</span>
        </span>
    );
}

export default function CustomerHome() {
    const navigate = useNavigate();
    const { logout, userData } = useAuth();
    const { location, loading: locating, permissionDenied, requestLocation } = useLocation();
    const { t, locale } = useI18n();
    const toast = useToast();

    const [garages, setGarages] = useState<NearbyGarage[]>([]);
    const [loadingGarages, setLoadingGarages] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [selectedGarage, setSelectedGarage] = useState<NearbyGarage | null>(null);
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [customerName, setCustomerName] = useState('');

    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [sortBy, setSortBy] = useState<SortKey>('distance');
    const [showOpenOnly, setShowOpenOnly] = useState(false);
    const [minRating, setMinRating] = useState(0);

    const [unrated, setUnrated] = useState<UnratedGarage | null>(null);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewError, setReviewError] = useState('');

    const [pending, setPending] = useState<PendingService[]>([]);
    const [dueVehicle, setDueVehicle] = useState<DueVehicle | null>(null);
    const [jobCounts, setJobCounts] = useState<Map<string, number>>(new Map());

    // Native push (FCM) registration + delivery acks. A push (OTP/invoice) may
    // mean a newly completed service, so re-check the rating nudge.
    const refreshMine = useCallback(() => {
        if (!userData?._id || !userData.phoneNumber) return;
        getUnratedGarage(userData._id, userData.phoneNumber).then(setUnrated).catch(() => setUnrated(null));
        getMyPendingServices(userData._id, userData.phoneNumber).then(setPending).catch(() => setPending([]));
        // On-device service reminder: the most overdue vehicle, if any.
        getCustomerServiceHistory(userData.phoneNumber).then((h) => {
            const due = buildPassports(h).find((p) => reminderFor(p.lastServiceAt).state !== 'ok');
            setDueVehicle(due ? { vehicleNumber: due.vehicleNumber, lastServiceAt: due.lastServiceAt } : null);
        }).catch(() => setDueVehicle(null));
    }, [userData?._id, userData?.phoneNumber]);
    useNotifications(userData?._id, refreshMine);

    useEffect(() => {
        if (!userData?._id) return;
        refreshMine();
        getCustomerProfile(userData._id).then((p) => setCustomerName(p.name)).catch(() => {});
        // Coming back to the app (e.g. from the SMS/WhatsApp with the OTP): re-check.
        const onVisible = () => { if (document.visibilityState === 'visible') refreshMine(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [userData?._id, refreshMine]);

    const loadGarages = useCallback(async () => {
        setLoadingGarages(true);
        setLoadError('');
        try {
            const list = await discoverGarages(location.lat, location.lng, SEARCH_RADIUS_KM);
            setGarages(list);
            getGarageServiceCounts(list.map((g) => g.id)).then(setJobCounts).catch(() => {});
        } catch {
            setGarages([]);
            setLoadError(t('home.loadError'));
        } finally {
            setLoadingGarages(false);
        }
    }, [location.lat, location.lng, t]);

    useEffect(() => {
        if (!locating) loadGarages();
    }, [locating, loadGarages]);

    const visibleGarages = useMemo(() => {
        const q = search.trim().toLowerCase();
        return garages
            .filter((g) => !q || g.name.toLowerCase().includes(q) || g.address.toLowerCase().includes(q))
            .filter((g) => !showOpenOnly || getOpenStatus(g.serviceHours, g.workingDays).isOpen)
            .filter((g) => minRating === 0 || (g.reviews > 0 && g.rating >= minRating))
            .sort((a, b) => {
                if (sortBy === 'rating') return b.rating - a.rating || a.distanceKm - b.distanceKm;
                if (sortBy === 'reviews') return b.reviews - a.reviews || a.distanceKm - b.distanceKm;
                if (sortBy === 'jobs') return (jobCounts.get(b.id) ?? 0) - (jobCounts.get(a.id) ?? 0) || a.distanceKm - b.distanceKm;
                return a.distanceKm - b.distanceKm;
            });
    }, [garages, search, showOpenOnly, minRating, sortBy, jobCounts]);

    const pageOfGarages = visibleGarages.slice(0, visibleCount);
    const activeFiltersCount = (sortBy !== 'distance' ? 1 : 0) + (showOpenOnly ? 1 : 0) + (minRating > 0 ? 1 : 0);
    const busy = locating || loadingGarages;

    const handleSubmitReview = async () => {
        if (reviewRating === 0 || !unrated || !userData?._id) return;
        setSubmittingReview(true);
        setReviewError('');
        try {
            await submitReview(userData._id, unrated.garageId, reviewRating, reviewComment);
            setUnrated(null);
            setReviewRating(0);
            setReviewComment('');
            toast.success(t('home.rateThanks'));
        } catch {
            setReviewError(t('home.rateFailed'));
        } finally {
            setSubmittingReview(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/auth');
    };

    const resetFilters = () => {
        setSortBy('distance');
        setShowOpenOnly(false);
        setMinRating(0);
    };

    const firstName = customerName.trim().split(/\s+/)[0];

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pt-safe pb-6 px-4">
            {/* Header */}
            <header className="flex items-center justify-between py-6 mb-2">
                <div>
                    <p className="text-slate-400 dark:text-[var(--app-muted)] text-sm font-semibold">
                        {firstName ? t('home.hi', { name: firstName }) : t('home.welcome')}
                    </p>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-[var(--app-text)] tracking-tight">{t('home.title')}</h1>
                    <p className="text-blue-600 text-sm font-semibold flex items-center gap-1.5 mt-1">
                        <Navigation className="w-3.5 h-3.5 fill-blue-600" />
                        {busy ? t('home.locating')
                            : permissionDenied ? t('home.locationOff')
                                : visibleGarages.length === 1 ? t('home.countWithinOne', { km: SEARCH_RADIUS_KM })
                                    : t('home.countWithin', { count: visibleGarages.length, km: SEARCH_RADIUS_KM })}
                    </p>
                </div>
                <button
                    onClick={() => setShowProfilePanel(true)}
                    aria-label="Menu"
                    className="w-12 h-12 flex items-center justify-center bg-white dark:bg-[var(--app-surface)] rounded-2xl shadow-sm border border-slate-100 dark:border-[var(--app-border)] text-slate-400 dark:text-[var(--app-muted)] active:bg-slate-50 dark:active:bg-[var(--app-bg)] transition-colors"
                >
                    <Settings className="w-5.5 h-5.5" />
                </button>
            </header>

            {permissionDenied && (
                <button
                    onClick={requestLocation}
                    className="mb-4 w-full text-left bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200 rounded-2xl px-4 py-3 text-sm font-medium flex items-center gap-3"
                >
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{t('home.locationBanner')}</span>
                    <span className="font-bold">{t('home.retry')}</span>
                </button>
            )}

            {/* Search */}
            <div className="flex gap-3 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                    <input
                        type="search"
                        placeholder={t('home.search')}
                        className="w-full h-14 bg-white dark:bg-[var(--app-surface)] rounded-2xl pl-12 pr-4 border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300 dark:placeholder:text-[#5A6B82] font-medium"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
                    />
                </div>
                <button
                    onClick={() => setShowFilterModal(true)}
                    aria-label={t('home.filters')}
                    className="relative w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white active:scale-95 transition-all"
                >
                    <Filter className="w-5.5 h-5.5" />
                    {activeFiltersCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {activeFiltersCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Services awaiting this customer's OTP: check the details first */}
            {pending.map((p) => (
                <PendingServiceCard key={p.id} service={p} onDeclined={(id) => setPending((xs) => xs.filter((x) => x.id !== id))} />
            ))}

            {/* On-device service reminder */}
            {dueVehicle && (
                <button
                    onClick={() => navigate('/customer/vehicles')}
                    className="w-full text-left mb-6 rounded-3xl p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center gap-3"
                >
                    <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 flex items-center justify-center shrink-0">
                        <CalendarClock className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-amber-900 dark:text-amber-100">{t('reminder.cardTitle', { vehicle: dueVehicle.vehicleNumber })}</p>
                        <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                            {t('reminder.cardBody', { date: new Date(dueVehicle.lastServiceAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                        </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-600" />
                </button>
            )}

            {/* Map Preview */}
            <div className="relative h-56 rounded-[2.5rem] overflow-hidden mb-10 shadow-2xl shadow-blue-900/10 border-4 border-white dark:border-[var(--app-surface)]">
                <GarageMap
                    garages={visibleGarages.map((g) => ({
                        id: g.id, name: g.name, lat: g.lat, lng: g.lng,
                        rating: g.rating, reviews: g.reviews, photo: g.photoUrl ?? undefined, phone: g.phone,
                    }))}
                    userLocation={location}
                    onGarageSelect={(g) => setSelectedGarage(garages.find((x) => x.id === g.id) ?? null)}
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-blue-600 shadow-sm border border-blue-50 z-[400]">
                    {t('home.tapMarkers')}
                </div>
            </div>

            {/* Rate your last garage */}
            {unrated && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 rounded-3xl p-5 mb-6 border border-amber-200 dark:border-amber-800/50"
                >
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                            <Star className="w-6 h-6 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)] text-sm">{t('home.rateTitle', { garage: unrated.garageName })}</h3>
                            <p className="text-xs text-slate-500 dark:text-[var(--app-muted)] mt-1 line-clamp-1">{unrated.serviceDescription}</p>
                        </div>
                        <button onClick={() => setUnrated(null)} aria-label="Dismiss" className="text-slate-400 dark:text-[var(--app-muted)]">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex justify-center gap-2 mb-4">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button key={star} onClick={() => { setReviewRating(star); haptic('tap'); }} aria-label={`${star} star${star > 1 ? 's' : ''}`} className="transition-transform active:scale-90">
                                <Star className={`w-10 h-10 ${star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
                            </button>
                        ))}
                    </div>

                    {reviewRating > 0 && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                            <textarea
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder={t('home.rateComment')}
                                rows={2}
                                maxLength={500}
                                className="w-full px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-white dark:bg-[var(--app-surface)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                            {reviewError && <p className="text-red-600 text-xs font-medium">{reviewError}</p>}
                            <button
                                onClick={handleSubmitReview}
                                disabled={submittingReview}
                                className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {submittingReview ? <Loader2 className="w-5 h-5 animate-spin" /> : t('home.rateSubmit')}
                            </button>
                        </motion.div>
                    )}
                </motion.div>
            )}

            {/* Garage List */}
            <div className="flex-1 space-y-5">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)]">{t('home.nearby')}</h2>
                    {!busy && <span className="text-slate-400 dark:text-[var(--app-muted)] text-sm">{t('home.found', { count: visibleGarages.length })}</span>}
                </div>

                {busy ? (
                    <div className="space-y-5" aria-busy="true">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-36 rounded-3xl bg-white dark:bg-[var(--app-surface)] border border-slate-100 dark:border-[var(--app-border)] flex overflow-hidden animate-pulse">
                                <div className="w-1/3 bg-slate-100 dark:bg-[var(--app-surface-2)]" />
                                <div className="flex-1 p-4 space-y-3">
                                    <div className="h-5 w-2/3 rounded bg-slate-100 dark:bg-[var(--app-surface-2)]" />
                                    <div className="h-4 w-1/3 rounded bg-slate-100 dark:bg-[var(--app-surface-2)]" />
                                    <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-[var(--app-surface-2)]" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : loadError ? (
                    <div className="text-center py-16">
                        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                        <p className="text-slate-500 dark:text-[var(--app-muted)] font-medium mb-4">{loadError}</p>
                        <button onClick={loadGarages} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white font-bold">
                            <RefreshCw className="w-4 h-4" /> {t('common.retry')}
                        </button>
                    </div>
                ) : visibleGarages.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-slate-700 dark:text-[var(--app-text)] font-bold mb-1">
                            {garages.length === 0 ? t('home.noneNearbyTitle') : t('home.noMatchTitle')}
                        </p>
                        <p className="text-slate-400 dark:text-[var(--app-muted)] text-sm mb-4">
                            {garages.length === 0 ? t('home.noneNearbyBody', { km: SEARCH_RADIUS_KM }) : t('home.noMatchBody')}
                        </p>
                        {garages.length > 0 && (
                            <button onClick={() => { setSearch(''); resetFilters(); }} className="text-blue-600 font-bold">{t('home.clearAll')}</button>
                        )}
                    </div>
                ) : (
                    pageOfGarages.map((garage) => {
                        const open = getOpenStatus(garage.serviceHours, garage.workingDays);
                        const joined = garage.joinedAt ? new Date(garage.joinedAt).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) : null;
                        const jobs = jobCounts.get(garage.id) ?? 0;
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                key={garage.id}
                                className="w-full bg-white dark:bg-[var(--app-surface)] rounded-3xl shadow-sm border border-slate-100 dark:border-[var(--app-border)] overflow-hidden flex flex-row h-36 cursor-pointer active:scale-[0.99] transition-transform"
                                onClick={() => navigate(`/customer/garage/${garage.id}`)}
                            >
                                <GaragePhoto src={garage.photoUrl} name={garage.name} className="w-1/3 h-full" />

                                <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)] mb-1 truncate text-lg leading-tight">{garage.name}</h3>
                                        <div className="flex items-center gap-2 text-xs mb-2">
                                            <RatingBadge garage={garage} />
                                            <span className="text-slate-500 dark:text-[var(--app-muted)] font-semibold">{formatDistance(garage.distanceKm)}</span>
                                        </div>
                                        {open.known && (
                                            <span className={`flex items-center gap-1 text-xs font-semibold ${open.isOpen ? 'text-green-600' : 'text-slate-400 dark:text-[var(--app-muted)]'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${open.isOpen ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                                                {openLabel(open, t)}
                                            </span>
                                        )}
                                        {jobs > 0 && (
                                            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-[var(--app-muted)] mt-0.5">
                                                <Wrench className="w-3 h-3" /> {t('home.servicesDone', { count: jobs })}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto">
                                        {joined ? (
                                            <span className="text-[10px] text-slate-400 dark:text-[var(--app-muted)] font-medium bg-slate-50 dark:bg-[var(--app-bg)] px-2 py-1 rounded-full border border-slate-100 dark:border-[var(--app-border)]">
                                                {t('home.since', { date: joined })}
                                            </span>
                                        ) : <span />}

                                        <div className="flex items-center gap-2">
                                            <a
                                                href={directionsUrl(garage)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={`Directions to ${garage.name}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-9 h-9 bg-blue-50 dark:bg-blue-950/40 rounded-full flex items-center justify-center text-blue-600 border border-blue-100 dark:border-blue-900/50"
                                            >
                                                <Navigation className="w-4 h-4 fill-blue-600" />
                                            </a>
                                            {garage.phone && (
                                                <a
                                                    href={`tel:+91${garage.phone}`}
                                                    aria-label={`Call ${garage.name}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-9 h-9 bg-green-50 dark:bg-green-950/40 rounded-full flex items-center justify-center text-green-600 border border-green-100 dark:border-green-900/50"
                                                >
                                                    <Phone className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })
                )}

                {!busy && visibleCount < visibleGarages.length && (
                    <button
                        onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                        className="w-full py-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 font-bold rounded-2xl"
                    >
                        {t('home.showMore', { count: visibleGarages.length - visibleCount })}
                    </button>
                )}
            </div>

            {/* Garage quick-view sheet (from a map marker) */}
            <AnimatePresence>
                {selectedGarage && (() => {
                    const open = getOpenStatus(selectedGarage.serviceHours, selectedGarage.workingDays);
                    return (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000]"
                                onClick={() => setSelectedGarage(null)}
                            />
                            <motion.div
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[var(--app-surface)] rounded-t-[3rem] p-8 pb-12 z-[1001] shadow-2xl max-w-md mx-auto"
                            >
                                <div className="w-12 h-1.5 bg-slate-100 dark:bg-[var(--app-surface-2)] rounded-full mx-auto mb-8" />
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)] mb-1 truncate">{selectedGarage.name}</h2>
                                        <p className="text-blue-600 font-bold flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 w-fit px-3 py-1 rounded-full text-xs">
                                            <MapPin className="w-3 h-3" />
                                            {t('home.away', { distance: formatDistance(selectedGarage.distanceKm) })}
                                        </p>
                                    </div>
                                    <button onClick={() => setSelectedGarage(null)} aria-label="Close" className="w-10 h-10 bg-slate-50 dark:bg-[var(--app-bg)] rounded-full flex items-center justify-center text-slate-400 dark:text-[var(--app-muted)]">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <GaragePhoto src={selectedGarage.photoUrl} name={selectedGarage.name} className="w-full h-44 rounded-[2rem] mb-6" />

                                <div className="grid grid-cols-2 gap-4 mb-6 text-center text-sm font-bold">
                                    <div className="bg-slate-50 dark:bg-[var(--app-bg)] p-4 rounded-2xl">
                                        <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs mb-1">{t('home.hours')}</p>
                                        <p className={open.isOpen ? 'text-green-600' : 'text-slate-900 dark:text-[var(--app-text)]'}>{openLabel(open, t)}</p>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-[var(--app-bg)] p-4 rounded-2xl">
                                        <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs mb-1">{t('home.rating')}</p>
                                        <p className="text-slate-900 dark:text-[var(--app-text)] flex items-center justify-center gap-1">
                                            {selectedGarage.reviews > 0 ? (
                                                <><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{selectedGarage.rating.toFixed(1)} ({selectedGarage.reviews})</>
                                            ) : t('home.new')}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => navigate(`/customer/garage/${selectedGarage.id}`)}
                                        className="flex-1 h-16 bg-slate-100 dark:bg-[var(--app-surface-2)] rounded-[1.25rem] text-slate-700 dark:text-[var(--app-text)] font-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                    >
                                        {t('home.details')} <ChevronRight className="w-5 h-5" />
                                    </button>
                                    {selectedGarage.phone ? (
                                        <a
                                            href={`tel:+91${selectedGarage.phone}`}
                                            className="flex-1 h-16 bg-green-600 rounded-[1.25rem] text-white font-black flex items-center justify-center gap-3 shadow-xl shadow-green-500/30 active:scale-95 transition-transform"
                                        >
                                            <Phone className="w-5 h-5" /> {t('home.call')}
                                        </a>
                                    ) : (
                                        <a
                                            href={directionsUrl(selectedGarage)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 h-16 bg-blue-600 rounded-[1.25rem] text-white font-black flex items-center justify-center gap-3 active:scale-95 transition-transform"
                                        >
                                            <Navigation className="w-5 h-5" /> {t('home.directions')}
                                        </a>
                                    )}
                                </div>
                            </motion.div>
                        </>
                    );
                })()}
            </AnimatePresence>

            {/* Logout Modal */}
            <AnimatePresence>
                {showLogoutModal && (
                    <div className="fixed inset-0 flex items-center justify-center p-6 z-[1100]">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={() => setShowLogoutModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-sm bg-white dark:bg-[var(--app-surface)] rounded-[2.5rem] p-8 text-center relative z-10 shadow-2xl"
                        >
                            <div className="w-20 h-20 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                <LogOut className="w-10 h-10" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)] mb-2">{t('home.logoutTitle')}</h2>
                            <p className="text-slate-500 dark:text-[var(--app-muted)] font-medium mb-10 leading-relaxed">{t('home.logoutBody')}</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleLogout} className="w-full h-16 bg-red-600 text-white font-bold rounded-2xl">{t('common.logout')}</button>
                                <button onClick={() => setShowLogoutModal(false)} className="w-full h-16 bg-slate-50 dark:bg-[var(--app-bg)] text-slate-500 dark:text-[var(--app-muted)] font-bold rounded-2xl">{t('common.cancel')}</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Menu panel */}
            <AnimatePresence>
                {showProfilePanel && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[1000]"
                            onClick={() => setShowProfilePanel(false)}
                        />
                        <motion.div
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white dark:bg-[var(--app-surface)] shadow-2xl z-[1001] flex flex-col"
                        >
                            <div className="p-6 pt-safe bg-blue-600 text-white">
                                <div className="flex items-center justify-end mb-4">
                                    <button onClick={() => setShowProfilePanel(false)} aria-label="Close menu" className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                        <User className="w-6 h-6" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold truncate">{customerName || t('home.yourAccount')}</p>
                                        <p className="text-blue-200 text-xs">+91 {userData?.phoneNumber}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 p-4 space-y-2">
                                {[
                                    { to: '/customer/vehicles', label: t('home.menuVehicles'), sub: t('home.menuVehiclesSub'), Icon: Car, tint: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600' },
                                    { to: '/customer/activity', label: t('home.menuActivity'), sub: t('home.menuActivitySub'), Icon: Clock, tint: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600' },
                                    { to: '/customer/profile', label: t('home.menuProfile'), sub: t('home.menuProfileSub'), Icon: User, tint: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600' },
                                    { to: '/customer/support', label: t('home.menuSupport'), sub: t('home.menuSupportSub'), Icon: Headphones, tint: 'bg-green-50 dark:bg-green-950/40 text-green-600' },
                                ].map(({ to, label, sub, Icon, tint }) => (
                                    <button
                                        key={to}
                                        onClick={() => { setShowProfilePanel(false); navigate(to); }}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-[var(--app-bg)] transition-all"
                                    >
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tint}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold text-slate-900 dark:text-[var(--app-text)]">{label}</p>
                                            <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs">{sub}</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                                    </button>
                                ))}
                            </div>

                            <div className="p-4 pb-safe border-t border-slate-100 dark:border-[var(--app-border)]">
                                <button
                                    onClick={() => { setShowProfilePanel(false); setShowLogoutModal(true); }}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600"
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span className="font-bold">{t('common.logout')}</span>
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Filters */}
            <AnimatePresence>
                {showFilterModal && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]"
                            onClick={() => setShowFilterModal(false)}
                        />
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-[var(--app-surface)] rounded-t-3xl z-[1001] p-6 pb-10 max-h-[80vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-[var(--app-text)]">{t('home.filters')}</h2>
                                <button onClick={() => setShowFilterModal(false)} aria-label={t('common.close')}>
                                    <X className="w-6 h-6 text-slate-400 dark:text-[var(--app-muted)]" />
                                </button>
                            </div>

                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-3">{t('home.sortBy')}</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {SORT_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => setSortBy(option.value)}
                                            className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${sortBy === option.value
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600'
                                                : 'border-slate-100 dark:border-[var(--app-border)] text-slate-700 dark:text-[var(--app-text)]'}`}
                                        >
                                            {t(option.label)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-6">
                                <button
                                    onClick={() => setShowOpenOnly(!showOpenOnly)}
                                    role="switch"
                                    aria-checked={showOpenOnly}
                                    className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${showOpenOnly
                                        ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
                                        : 'border-slate-100 dark:border-[var(--app-border)]'}`}
                                >
                                    <span className={`font-semibold ${showOpenOnly ? 'text-green-600' : 'text-slate-700 dark:text-[var(--app-text)]'}`}>{t('home.openOnly')}</span>
                                    <div className={`w-12 h-7 rounded-full transition-all ${showOpenOnly ? 'bg-green-500' : 'bg-slate-200 dark:bg-[var(--app-surface-2)]'}`}>
                                        <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-all mt-1 ${showOpenOnly ? 'ml-6' : 'ml-1'}`} />
                                    </div>
                                </button>
                            </div>

                            <div className="mb-8">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-3">{t('home.minRating')}</h3>
                                <div className="flex gap-2">
                                    {[0, 3, 3.5, 4, 4.5].map((rating) => (
                                        <button
                                            key={rating}
                                            onClick={() => setMinRating(rating)}
                                            className={`flex-1 p-3 rounded-xl border-2 text-center text-sm font-semibold transition-all ${minRating === rating
                                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-600'
                                                : 'border-slate-100 dark:border-[var(--app-border)] text-slate-600 dark:text-[var(--app-muted)]'}`}
                                        >
                                            {rating === 0 ? t('home.any') : `${rating}+`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={resetFilters} className="flex-1 py-4 rounded-xl border-2 border-slate-200 dark:border-[var(--app-border)] text-slate-600 dark:text-[var(--app-muted)] font-bold">
                                    {t('home.reset')}
                                </button>
                                <button
                                    onClick={() => { setVisibleCount(PAGE_SIZE); setShowFilterModal(false); }}
                                    className="flex-1 py-4 rounded-xl bg-blue-600 text-white font-bold"
                                >
                                    {t('home.showResults', { count: visibleGarages.length })}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
