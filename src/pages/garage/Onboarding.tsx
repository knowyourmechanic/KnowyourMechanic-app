import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation as useRouteLocation } from 'react-router-dom';
import {
    Building2, Phone, Mail, QrCode,
    CheckCircle, ArrowRight, ArrowLeft, Loader2, AlertTriangle,
    Upload, Camera, Check, X
} from 'lucide-react';
import TimeRangePicker from '../../components/TimeRangePicker';
import WorkingDaysPicker from '../../components/WorkingDaysPicker';
import LocationPicker from '../../components/LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { saveGarageBusinessInfo, saveGarageQr, completeGarageOnboarding, lookupReferralCode, saveGaragePhoto, getMyGarageMembership, createGarageAsStaff, applyGarageReferral } from '../../lib/data';
import { garageHome } from '../../lib/roles';
import { useI18n } from '../../i18n';
import { compressImage } from '../../lib/image';
import { errorMessage } from '../../lib/errors';

type Step = 'business' | 'qr' | 'success';

interface BusinessInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    coordinates: [number, number];
    hasValidLocation: boolean;
    serviceHours: string;
    workingDays: string[];
    businessType: string;
    legalBusinessName: string;
    referralCode: string;
    photoBase64: string;
}

interface FieldErrors {
    [key: string]: string;
}

interface ReferralStatus {
    checking: boolean;
    valid: boolean | null;
    employeeName: string;
}

export default function GarageOnboardingWizard() {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>('business');
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const [business, setBusiness] = useState<BusinessInfo>({
        name: '',
        email: '',
        phone: '',
        address: '',
        coordinates: [0, 0],
        hasValidLocation: false,
        serviceHours: '9:00 AM - 8:00 PM',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        businessType: 'individual',
        legalBusinessName: '',
        referralCode: '',
        photoBase64: '',
    });

    // The garage's static payment QR (image the customer scans to pay directly).
    const [qrFile, setQrFile] = useState<File | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [qrPreview, setQrPreview] = useState('');

    const [referralStatus, setReferralStatus] = useState<ReferralStatus>({
        checking: false, valid: null, employeeName: '',
    });

    const { userData } = useAuth();
    const { t } = useI18n();
    const [garageId, setGarageId] = useState('');
    // Employee setting the garage up for their owner (from /garage/start).
    const routeState = useRouteLocation().state as { mode?: string; ownerPhone?: string; ownerName?: string; staffName?: string } | null;
    const [staffSetup, setStaffSetup] = useState<{ ownerPhone: string; ownerName: string; staffName: string } | null>(
        routeState?.mode === 'staff' && routeState.ownerPhone
            ? { ownerPhone: routeState.ownerPhone, ownerName: routeState.ownerName ?? '', staffName: routeState.staffName ?? '' }
            : null,
    );
    const [continuingAsStaff, setContinuingAsStaff] = useState(false);
    const isStaffMode = !!staffSetup || continuingAsStaff;

    useEffect(() => {
        if (userData?._id) checkOnboardingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, [userData?._id]);

    const checkOnboardingStatus = async () => {
        try {
            const m = await getMyGarageMembership();
            if (m) {
                const isOwnerSetup = m.memberRole === 'owner' && m.ownerConfirmed;
                const isMySetup = m.memberRole === 'staff' && m.status === 'active' && m.onboardedByMe;
                if ((!isOwnerSetup && !isMySetup) || m.onboardingComplete) {
                    navigate(await garageHome(), { replace: true });
                    return;
                }
                setGarageId(m.garageId);
                if (isMySetup) { setContinuingAsStaff(true); setStaffSetup(null); }
            }
        } catch (err) {
            console.error('Error checking status:', err);
        } finally {
            setCheckingStatus(false);
        }
    };

    // ---- Validation helpers ----
    const validatePhone = (phone: string): string => {
        const digits = phone.replace(/\D/g, '');
        if (!digits) return 'Phone number is required';
        if (digits.length !== 10) return 'Phone must be exactly 10 digits';
        return '';
    };

    const validateEmail = (email: string): string => {
        if (!email) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
        return '';
    };

    const validateBusinessStep = (): boolean => {
        const errors: FieldErrors = {};

        if (business.name.trim().length < 3) errors.name = 'Garage name must be at least 3 characters';
        const emailErr = validateEmail(business.email);
        if (emailErr) errors.email = emailErr;
        const phoneErr = validatePhone(business.phone);
        if (phoneErr) errors.phone = phoneErr;
        if (!business.hasValidLocation) errors.location = 'Please detect your GPS location';

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const validateQrStep = (): boolean => {
        const errors: FieldErrors = {};
        if (!qrFile) errors.qr = 'Please upload your payment QR (or skip and add it later)';
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // ---- Referral live check ----
    const verifyReferral = async (code: string) => {
        if (!code || code.length < 5) {
            setReferralStatus({ checking: false, valid: null, employeeName: '' });
            return;
        }
        setReferralStatus({ checking: true, valid: null, employeeName: '' });
        const name = await lookupReferralCode(code);
        setReferralStatus({ checking: false, valid: !!name, employeeName: name ?? '' });
    };

    // ---- Photo handler ----
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
        if (file.size > 15 * 1024 * 1024) {
            setError('Photo must be under 15MB');
            return;
        }
        setPhotoFile(file);
        setBusiness(prev => ({ ...prev, photoBase64: URL.createObjectURL(file) }));
    };

    // ---- Payment QR handler ----
    const handleQrSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
        if (file.size > 5 * 1024 * 1024) { setError('QR image must be under 5MB'); return; }
        setError('');
        setQrFile(file);
        setQrPreview(URL.createObjectURL(file));
        if (fieldErrors.qr) setFieldErrors(prev => ({ ...prev, qr: '' }));
    };

    // ---- Submit handlers ----
    const handleBusinessSubmit = async () => {
        if (!validateBusinessStep()) return;

        setLoading(true);
        setError('');

        try {
            const info = {
                name: business.name,
                email: business.email,
                phone: business.phone,
                address: business.address,
                coordinates: business.coordinates,
                serviceHours: business.serviceHours,
                workingDays: business.workingDays,
                businessType: business.businessType,
                legalBusinessName: business.legalBusinessName || business.name,
                // Only attach a code the server confirmed.
                referralCode: referralStatus.valid ? business.referralCode : undefined,
            };
            let id: string;
            if (staffSetup && !garageId) {
                // Employee: the garage is created in the owner's name.
                id = await createGarageAsStaff({ ...info, ...staffSetup });
                if (info.referralCode) await applyGarageReferral(id, info.referralCode).catch(() => {});
            } else {
                id = await saveGarageBusinessInfo(userData!._id, info, garageId || undefined);
            }
            if (photoFile) {
                // Non-fatal: the garage can add a photo later in Settings.
                await saveGaragePhoto(id, await compressImage(photoFile)).catch(() => {});
            }
            setGarageId(id);
            setFieldErrors({});
            setStep('qr');
        } catch (e) {
            setError(errorMessage(e, 'Failed to save'));
        } finally {
            setLoading(false);
        }
    };

    const handleQrSubmit = async () => {
        if (!validateQrStep()) return;

        setLoading(true);
        setError('');

        try {
            if (garageId && qrFile) {
                await saveGarageQr(garageId, qrFile);
                await completeGarageOnboarding(garageId);
            }
            localStorage.setItem('garageOnboarded', 'true');
            setFieldErrors({});
            setStep('success');
            setTimeout(() => navigate('/garage'), 2500);
        } catch (e) {
            setError(errorMessage(e, 'Failed to save'));
        } finally {
            setLoading(false);
        }
    };

    const handleSkipQr = async () => {
        setLoading(true);
        try {
            if (garageId) await completeGarageOnboarding(garageId);
            localStorage.setItem('garageOnboarded', 'true');
            setStep('success');
            setTimeout(() => navigate('/garage'), 2500);
        } catch (e) {
            setError(errorMessage(e, 'Network error'));
        } finally {
            setLoading(false);
        }
    };

    // ---- Render helpers ----
    const renderFieldError = (field: string) => {
        if (!fieldErrors[field]) return null;
        return (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {fieldErrors[field]}
            </p>
        );
    };

    if (checkingStatus) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    const stepIndicator = (
        <div className="flex items-center justify-center gap-2 mb-8">
            {['business', 'qr', 'success'].map((s, i) => (
                <div key={s} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                        ${step === s || ['business', 'qr', 'success'].indexOf(step) > i
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 dark:bg-[var(--app-surface-2)] text-slate-500 dark:text-[var(--app-muted)]'}`}
                    >
                        {i + 1}
                    </div>
                    {i < 2 && <div className={`w-8 h-0.5 ${['business', 'qr', 'success'].indexOf(step) > i ? 'bg-blue-600' : 'bg-slate-200 dark:bg-[var(--app-surface-2)]'}`} />}
                </div>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] pt-safe pb-10 px-6">
            <div className="max-w-md mx-auto pt-8">
                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)] mb-2">
                        {step === 'business' && 'Business Details'}
                        {step === 'qr' && 'Payment QR'}
                        {step === 'success' && 'All Set!'}
                    </h1>
                    <p className="text-slate-500 dark:text-[var(--app-muted)]">
                        {step === 'business' && (isStaffMode ? t('onb.staffSubtitle', { owner: staffSetup?.ownerName || t('onb.yourOwner') }) : 'Tell us about your garage')}
                        {step === 'qr' && 'Customers pay you directly on this QR'}
                        {step === 'success' && 'Your garage is ready'}
                    </p>
                </div>

                {stepIndicator}

                {error && (
                    <div className="bg-red-50 dark:bg-red-950/40 text-red-600 p-3 rounded-xl mb-4 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {/* Step: Business Info */}
                    {step === 'business' && (
                        <motion.div
                            key="business"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            {/* Photo Upload */}
                            <div className="flex justify-center mb-2">
                                <label className="cursor-pointer group">
                                    <div className={`w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${business.photoBase64
                                            ? 'border-green-300 bg-green-50 dark:bg-green-950/40'
                                            : 'border-slate-300 dark:border-[var(--app-border)] bg-slate-100 dark:bg-[var(--app-surface-2)] group-hover:border-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40'
                                        }`}>
                                        {business.photoBase64 ? (
                                            <img src={business.photoBase64} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center">
                                                <Camera className="w-6 h-6 text-slate-400 dark:text-[var(--app-muted)] mx-auto" />
                                                <span className="text-[10px] text-slate-400 dark:text-[var(--app-muted)] mt-1 block">Add Photo</span>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handlePhotoUpload}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            {/* Garage Name */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Garage Name *</label>
                                <div className="relative">
                                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                                    <input
                                        type="text"
                                        value={business.name}
                                        onChange={(e) => {
                                            setBusiness({ ...business, name: e.target.value });
                                            if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }));
                                        }}
                                        placeholder="Your Garage Name"
                                        className={`w-full pl-12 pr-4 py-3 rounded-xl border ${fieldErrors.name ? 'border-red-300 bg-red-50/50 dark:bg-red-950/50' : 'border-slate-200 dark:border-[var(--app-border)]'} focus:ring-2 focus:ring-blue-500`}
                                    />
                                </div>
                                {renderFieldError('name')}
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Email *</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                                    <input
                                        type="email"
                                        value={business.email}
                                        onChange={(e) => {
                                            setBusiness({ ...business, email: e.target.value });
                                            if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: '' }));
                                        }}
                                        onBlur={() => {
                                            const err = validateEmail(business.email);
                                            if (err) setFieldErrors(prev => ({ ...prev, email: err }));
                                        }}
                                        placeholder="garage@email.com"
                                        className={`w-full pl-12 pr-4 py-3 rounded-xl border ${fieldErrors.email ? 'border-red-300 bg-red-50/50 dark:bg-red-950/50' : 'border-slate-200 dark:border-[var(--app-border)]'} focus:ring-2 focus:ring-blue-500`}
                                    />
                                </div>
                                {renderFieldError('email')}
                            </div>

                            {/* Phone — digits only */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Phone *</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-[var(--app-muted)]" />
                                    <input
                                        type="tel"
                                        value={business.phone}
                                        onChange={(e) => {
                                            const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setBusiness({ ...business, phone: digits });
                                            if (fieldErrors.phone) setFieldErrors(prev => ({ ...prev, phone: '' }));
                                        }}
                                        onBlur={() => {
                                            const err = validatePhone(business.phone);
                                            if (err) setFieldErrors(prev => ({ ...prev, phone: err }));
                                        }}
                                        placeholder="9876543210"
                                        maxLength={10}
                                        inputMode="numeric"
                                        className={`w-full pl-12 pr-4 py-3 rounded-xl border ${fieldErrors.phone ? 'border-red-300 bg-red-50/50 dark:bg-red-950/50' : 'border-slate-200 dark:border-[var(--app-border)]'} focus:ring-2 focus:ring-blue-500`}
                                    />
                                    {business.phone.length > 0 && (
                                        <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono ${business.phone.length === 10 ? 'text-green-500' : 'text-slate-400 dark:text-[var(--app-muted)]'
                                            }`}>
                                            {business.phone.length}/10
                                        </span>
                                    )}
                                </div>
                                {renderFieldError('phone')}
                            </div>

                            {/* Location — GPS Only */}
                            <LocationPicker
                                address={business.address}
                                coordinates={business.coordinates}
                                hasValidLocation={business.hasValidLocation}
                                onLocationDetected={(address, coords) => {
                                    setBusiness(prev => ({
                                        ...prev,
                                        address,
                                        coordinates: coords,
                                        hasValidLocation: true,
                                    }));
                                    if (fieldErrors.location) setFieldErrors(prev => ({ ...prev, location: '' }));
                                }}
                            />
                            {renderFieldError('location')}

                            <TimeRangePicker
                                value={business.serviceHours}
                                onChange={(value) => setBusiness({ ...business, serviceHours: value })}
                            />

                            <WorkingDaysPicker
                                value={business.workingDays}
                                onChange={(value) => setBusiness({ ...business, workingDays: value })}
                            />

                            {/* Business Type */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Business Type</label>
                                <select
                                    value={business.businessType}
                                    onChange={(e) => setBusiness({ ...business, businessType: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="individual">Individual</option>
                                    <option value="proprietorship">Proprietorship</option>
                                    <option value="partnership">Partnership</option>
                                    <option value="private_limited">Private Limited</option>
                                </select>
                            </div>

                            {/* Referral Code with live validation */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Referral Code (optional)</label>
                                <div className="relative">
                                    <input
                                        value={business.referralCode}
                                        onChange={(e) => {
                                            const code = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                                            setBusiness({ ...business, referralCode: code });
                                            if (referralStatus.valid !== null) {
                                                setReferralStatus({ checking: false, valid: null, employeeName: '' });
                                            }
                                        }}
                                        onBlur={() => verifyReferral(business.referralCode)}
                                        placeholder="e.g. KYM-A7X3K"
                                        className={`w-full px-4 py-3 rounded-xl border font-mono uppercase focus:ring-2 focus:ring-blue-500 pr-10 ${referralStatus.valid === true ? 'border-green-300 bg-green-50/50 dark:bg-green-950/50' :
                                                referralStatus.valid === false ? 'border-red-300 bg-red-50/50 dark:bg-red-950/50' :
                                                    'border-slate-200 dark:border-[var(--app-border)]'
                                            }`}
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {referralStatus.checking && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                                        {referralStatus.valid === true && <Check className="w-5 h-5 text-green-500" />}
                                        {referralStatus.valid === false && <X className="w-5 h-5 text-red-400" />}
                                    </div>
                                </div>
                                {referralStatus.valid === true && (
                                    <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        Referred by <span className="font-bold">{referralStatus.employeeName}</span>
                                    </p>
                                )}
                                {referralStatus.valid === false && (
                                    <p className="text-red-500 text-xs mt-1">Invalid referral code</p>
                                )}
                                {referralStatus.valid === null && (
                                    <p className="text-xs text-slate-400 dark:text-[var(--app-muted)] mt-1">If provided by a KnowyourMechanic representative</p>
                                )}
                            </div>

                            <button
                                onClick={handleBusinessSubmit}
                                disabled={loading}
                                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 mt-6 disabled:opacity-50 transition-opacity"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                    <>Continue <ArrowRight className="w-5 h-5" /></>
                                )}
                            </button>
                        </motion.div>
                    )}

                    {/* Step: Payment QR */}
                    {step === 'qr' && (
                        <motion.div
                            key="qr"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-xl mb-2">
                                <p className="text-blue-800 dark:text-blue-200 text-sm">
                                    📷 Upload your UPI payment QR (from GPay, PhonePe, Paytm, etc.).
                                    Customers scan it to pay you <b>directly</b> — the money goes straight
                                    to you. You only settle a small platform fee to us at day's end.
                                </p>
                            </div>

                            {/* QR uploader */}
                            <label className="cursor-pointer block">
                                <div className={`rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-colors p-6 min-h-[220px]
                                    ${qrPreview
                                        ? 'border-green-300 bg-green-50 dark:bg-green-950/30'
                                        : `${fieldErrors.qr ? 'border-red-300 bg-red-50/50 dark:bg-red-950/40' : 'border-slate-300 dark:border-[var(--app-border)] bg-slate-50 dark:bg-[var(--app-surface-2)]'} hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40`}`}>
                                    {qrPreview ? (
                                        <>
                                            <img src={qrPreview} alt="Your payment QR" className="w-48 h-48 object-contain rounded-xl bg-white p-2" />
                                            <span className="text-xs font-semibold text-green-700 dark:text-green-300 mt-3 flex items-center gap-1">
                                                <Check className="w-4 h-4" /> QR selected — tap to change
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[var(--app-surface)] flex items-center justify-center mb-3">
                                                <QrCode className="w-8 h-8 text-blue-600" />
                                            </div>
                                            <span className="font-bold text-slate-700 dark:text-[var(--app-text)] flex items-center gap-2">
                                                <Upload className="w-4 h-4" /> Upload payment QR
                                            </span>
                                            <span className="text-xs text-slate-400 dark:text-[var(--app-muted)] mt-1">PNG or JPG, up to 5MB</span>
                                        </>
                                    )}
                                </div>
                                <input type="file" accept="image/*" onChange={handleQrSelect} className="hidden" />
                            </label>
                            {renderFieldError('qr')}

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => { setStep('business'); setFieldErrors({}); }}
                                    className="flex-1 bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-700 dark:text-[var(--app-text)] py-4 rounded-2xl font-bold flex items-center justify-center gap-2"
                                >
                                    <ArrowLeft className="w-5 h-5" /> Back
                                </button>
                                <button
                                    onClick={handleQrSubmit}
                                    disabled={loading}
                                    className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                        <>Complete <CheckCircle className="w-5 h-5" /></>
                                    )}
                                </button>
                            </div>

                            <button
                                onClick={handleSkipQr}
                                className="w-full text-slate-400 dark:text-[var(--app-muted)] text-sm font-semibold mt-2"
                            >
                                Skip for now (add later in Settings)
                            </button>
                        </motion.div>
                    )}

                    {/* Step: Success */}
                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-12"
                        >
                            <div className="w-24 h-24 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-12 h-12 text-green-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-[var(--app-text)] mb-2">{t('onb.doneTitle')}</h2>
                            <p className="text-slate-500 dark:text-[var(--app-muted)] mb-8">{isStaffMode ? t('onb.staffDone') : t('onb.ownerDone')}</p>
                            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
                            <p className="text-slate-400 dark:text-[var(--app-muted)] text-sm mt-2">{t('onb.redirecting')}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
