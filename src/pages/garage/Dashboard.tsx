import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, Plus, Star, LogOut, Wrench, User,
    X, Headphones, ChevronRight, Edit
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getMyGarage, getGarageServiceRecords } from '../../lib/data';

import AddServiceModal from '../../components/AddServiceModal';
import FeeSettlementCard from '../../components/FeeSettlementCard';
import { DashboardSkeleton } from '../../components/Loaders';
import { getOpenStatus } from '../../lib/hours';

interface ServiceRecord {
    _id: string;
    customerPhone: string;
    vehicleNumber: string | null;
    description: string;
    amount: number;
    platformFee: number;
    status: string;
    invoiceNumber: string | null;
    createdAt: string;
}

// In-flight records can be resumed (OTP / payment) from the list.
const STATUS_META: Record<string, { label: string; tone: string }> = {
    pending_otp: { label: 'Awaiting OTP', tone: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
    otp_verified: { label: 'Collect payment', tone: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' },
    payment_pending: { label: 'Collect payment', tone: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' },
    completed: { label: 'Completed', tone: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300' },
    cancelled: { label: 'Cancelled', tone: 'bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-500' },
};
const isResumable = (status: string) => status === 'pending_otp' || status === 'otp_verified';




export default function GarageDashboard() {
    const [services, setServices] = useState<ServiceRecord[]>([]);
    const [showAllServices, setShowAllServices] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ pending: 0, completed: 0, todayEarnings: 0, rating: 0, totalReviews: 0 });
    const [showAddService, setShowAddService] = useState(false);
    const [resumeRecord, setResumeRecord] = useState<ServiceRecord | null>(null);
    const resume = useMemo(
        () => (resumeRecord ? { id: resumeRecord._id, amount: resumeRecord.amount, status: resumeRecord.status } : null),
        [resumeRecord],
    );
    const [garagePhotoUrl, setGaragePhotoUrl] = useState('');
    const [garageName, setGarageName] = useState('');
    const [serviceHours, setServiceHours] = useState('9:00 AM - 8:00 PM');
    const [workingDays, setWorkingDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [garageId, setGarageId] = useState('');
    const [feeReload, setFeeReload] = useState(0);   // bump to re-check fees owed

    const navigate = useNavigate();
    const { userData, logout } = useAuth();

    useEffect(() => {
        if (userData?._id) {
            loadDashboard();
        }
    }, [userData?._id]);

    // Loads the garage profile + its service records from Supabase.
    const loadDashboard = async () => {
        try {
            if (!userData?._id) { setLoading(false); return; }
            const garage = await getMyGarage(userData._id);
            if (garage) {
                setGarageId(garage.id);
                setGarageName(garage.name);
                if (garage.photo_url) setGaragePhotoUrl(garage.photo_url);
                if (garage.service_hours) setServiceHours(garage.service_hours);
                if (garage.working_days && garage.working_days.length) setWorkingDays(garage.working_days);
                await loadServices(garage.id, Number(garage.rating || 0), garage.total_reviews || 0);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadServices = async (gid: string, rating = stats.rating, totalReviews = stats.totalReviews) => {
        const records = await getGarageServiceRecords(gid);
        const mapped: ServiceRecord[] = records.map((r) => ({
            _id: r.id,
            customerPhone: r.customer_phone,
            vehicleNumber: r.vehicle_number,
            description: r.description,
            amount: Number(r.amount),
            platformFee: Number(r.platform_fee),
            status: r.status,
            invoiceNumber: r.invoice_number,
            createdAt: r.created_at,
        }));
        setServices(mapped);
        const today = new Date().toDateString();
        const completed = mapped.filter((m) => m.status === 'completed');
        setStats({
            pending: mapped.filter((m) => isResumable(m.status)).length,
            completed: completed.length,
            todayEarnings: completed.filter((m) => new Date(m.createdAt).toDateString() === today).reduce((sum, m) => sum + m.amount, 0),
            rating,
            totalReviews,
        });
    };

    // Called by the add-service modal after creating a record.
    const fetchServices = async () => {
        if (garageId) await loadServices(garageId);
        setFeeReload((v) => v + 1);   // a completed UPI service accrues a fee
    };

    const handleLogout = async () => {
        await logout();
        navigate('/auth');
    };

    const openNow = getOpenStatus(serviceHours, workingDays).isOpen;

    if (loading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pt-safe pb-6 text-slate-900 dark:text-[var(--app-text)]">
            {/* Hero Header with Full Width Photo */}
            <div className="relative h-72 w-full bg-slate-900 overflow-hidden mb-6">
                {garagePhotoUrl ? (
                    <img src={garagePhotoUrl} alt="Cover" className="w-full h-full object-cover opacity-70" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-blue-800" />
                )}

                {/* Gradient-to-top overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-black/20" />

                {/* Top Settings Button */}
                <div className="absolute top-4 right-6 z-10">
                    <button
                        onClick={() => setShowProfilePanel(true)}
                        className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20 hover:bg-black/30 transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>

                {/* Bottom Text Content */}
                <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                    <h1 className="text-3xl font-black text-white mb-2 leading-tight">
                        {garageName || (userData as any)?.name || 'Your Garage'}
                    </h1>
                    <div className="flex items-center gap-3">
                        {openNow ? (
                            <div className="px-3 py-1 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30 text-green-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                Open Now
                            </div>
                        ) : (
                            <div className="px-3 py-1 rounded-full bg-red-500/20 backdrop-blur-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Closed
                            </div>
                        )}
                        <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/90 text-xs font-bold flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            {stats.rating > 0 ? `${stats.rating.toFixed(1)} Rating` : 'No Ratings'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6">

                {/* Profile Slider Panel */}
                <AnimatePresence>
                    {showProfilePanel && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowProfilePanel(false)}
                                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                            />
                            {/* Panel */}
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="fixed top-0 right-0 h-full w-80 bg-white dark:bg-[var(--app-surface)] shadow-2xl z-50 flex flex-col"
                            >
                                {/* Panel Header */}
                                <div className="p-6 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                                    <button
                                        onClick={() => setShowProfilePanel(false)}
                                        className="absolute top-4 right-4 text-white/70 hover:text-white"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                    <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4 border-4 border-white/30 overflow-hidden">
                                        {garagePhotoUrl ? (
                                            <img src={garagePhotoUrl} alt="Garage" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-10 h-10 text-white" />
                                        )}
                                    </div>
                                    <h3 className="text-xl font-black">{garageName || (userData as any)?.name || 'Your Garage'}</h3>
                                    <p className="text-blue-200 text-sm font-medium flex items-center gap-2 mt-1">
                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                        Active
                                    </p>
                                </div>

                                {/* Panel Menu */}
                                <div className="flex-1 p-4 space-y-2">
                                    <button
                                        onClick={() => {
                                            setShowProfilePanel(false);
                                            // Navigate to profile settings
                                            navigate('/garage/settings');
                                        }}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-[var(--app-bg)] transition-all group"
                                    >
                                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/40 rounded-xl flex items-center justify-center text-blue-600">
                                            <Edit className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold text-slate-900 dark:text-[var(--app-text)]">Profile Settings</p>
                                            <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs">Edit garage details & photo</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
                                    </button>

                                    <button
                                        onClick={() => {
                                            setShowProfilePanel(false);
                                            navigate('/garage/support');
                                        }}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-[var(--app-bg)] transition-all group"
                                    >
                                        <div className="w-12 h-12 bg-green-50 dark:bg-green-950/40 rounded-xl flex items-center justify-center text-green-600">
                                            <Headphones className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-bold text-slate-900 dark:text-[var(--app-text)]">Support</p>
                                            <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs">Get help & contact us</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-green-500" />
                                    </button>
                                </div>

                                {/* Logout Button */}
                                <div className="p-4 border-t border-slate-100 dark:border-[var(--app-border)]">
                                    <button
                                        onClick={() => setShowLogoutConfirm(true)}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        <span className="font-bold">Logout</span>
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                    <div className="bg-white dark:bg-[var(--app-surface)] rounded-2xl border border-slate-100 dark:border-[var(--app-border)] p-4 flex flex-col items-center">
                        <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/40 rounded-xl flex items-center justify-center text-blue-600 mb-2">
                            <Wrench className="w-5 h-5" />
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)]">{stats.completed}</p>
                        <p className="text-slate-400 dark:text-[var(--app-muted)] text-[10px] font-bold uppercase">Completed · ₹{stats.todayEarnings.toLocaleString('en-IN')} today</p>
                    </div>
                    <div className="bg-white dark:bg-[var(--app-surface)] rounded-2xl border border-slate-100 dark:border-[var(--app-border)] p-4 flex flex-col items-center">
                        <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center text-amber-500 mb-2">
                            <Star className="w-5 h-5 fill-amber-500" />
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)]">{stats.rating > 0 ? stats.rating.toFixed(1) : '-'}</p>
                        <p className="text-slate-400 dark:text-[var(--app-muted)] text-[10px] font-bold uppercase">Rating ({stats.totalReviews})</p>
                    </div>
                </div>

                {/* Platform fees owed to KYM (settle in-app via Razorpay) */}
                {garageId && <FeeSettlementCard garageId={garageId} garageName={garageName} reloadSignal={feeReload} />}

                {/* Add Service Record Button */}
                <div className="mb-6">
                    <button
                        onClick={() => setShowAddService(true)}
                        className="w-full bg-blue-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-6 h-6" />
                        <span className="font-bold text-lg">Add Service</span>
                    </button>
                </div>

                {/* Recent Services */}
                {services.length > 0 && (
                    <div className="mb-6">
                        <div className="mb-3">
                            <h4 className="text-sm font-black text-slate-400 dark:text-[var(--app-muted)] uppercase tracking-[0.15em]">Recent Services</h4>
                        </div>
                        <div className="space-y-3">
                            {(showAllServices ? services : services.slice(0, 3)).map((service) => {
                                const meta = STATUS_META[service.status] ?? { label: service.status, tone: 'bg-slate-100 text-slate-500' };
                                const resumable = isResumable(service.status);
                                return (
                                    <button
                                        key={service._id}
                                        type="button"
                                        disabled={!resumable}
                                        onClick={() => { setResumeRecord(service); setShowAddService(true); }}
                                        className={`w-full text-left bg-white dark:bg-[var(--app-surface)] border rounded-2xl p-4 shadow-sm ${resumable ? 'border-amber-200 dark:border-amber-800/50 active:scale-[0.99] transition-transform' : 'border-slate-100 dark:border-[var(--app-border)]'}`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-900 dark:text-[var(--app-text)] text-sm truncate">{service.description}</p>
                                                <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs">
                                                    {service.vehicleNumber ? `${service.vehicleNumber} · ` : ''}+91 {service.customerPhone}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="font-bold text-slate-900 dark:text-[var(--app-text)]">₹{service.amount.toLocaleString('en-IN')}</p>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${meta.tone}`}>{meta.label}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-slate-300 dark:text-slate-600">
                                                {new Date(service.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {resumable && <span className="font-bold text-blue-600">Tap to continue →</span>}
                                            {!resumable && service.invoiceNumber && <span className="font-mono text-slate-400">{service.invoiceNumber}</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {services.length > 3 && (
                            <button
                                onClick={() => setShowAllServices(!showAllServices)}
                                className="w-full text-blue-600 text-sm font-bold text-center mt-4 py-2"
                            >
                                {showAllServices ? 'Show less' : `Show all ${services.length}`}
                            </button>
                        )}
                    </div>
                )}

                {/* Add Service Modal */}
                <AddServiceModal
                    isOpen={showAddService}
                    garageId={garageId}
                    resume={resume}
                    onClose={() => {
                        setShowAddService(false);
                        setResumeRecord(null);
                        fetchServices(); // a record may have been created / advanced
                    }}
                    onSuccess={() => {
                        setShowAddService(false);
                        setResumeRecord(null);
                        fetchServices();
                    }}
                />
            </div>

            {/* Logout Confirmation Modal - Full Screen Overlay */}
            <AnimatePresence>
                {showLogoutConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-[var(--app-surface)] rounded-3xl p-6 w-full max-w-xs shadow-2xl"
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <LogOut className="w-8 h-8 text-red-600" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-[var(--app-text)] mb-2">Logout?</h3>
                                <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">Are you sure you want to logout?</p>
                            </div>
                            <div className="space-y-2">
                                <button
                                    onClick={() => {
                                        setShowLogoutConfirm(false);
                                        setShowProfilePanel(false);
                                        handleLogout();
                                    }}
                                    className="w-full bg-red-600 text-white py-3 rounded-xl font-bold"
                                >
                                    Yes, Logout
                                </button>
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="w-full bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-600 dark:text-[var(--app-muted)] py-3 rounded-xl font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
