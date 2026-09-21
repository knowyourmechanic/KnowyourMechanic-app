import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Building2, QrCode, Upload,
    Loader2, AlertTriangle, User, Save, Check, Camera
} from 'lucide-react';
import { CustomLoader } from '../../components/Loaders';
import TimeRangePicker from '../../components/TimeRangePicker';
import WorkingDaysPicker from '../../components/WorkingDaysPicker';
import LocationPicker from '../../components/LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { getMyGarage, saveGarageBusinessInfo, saveGarageQr, getMyGarageQr } from '../../lib/data';
import RoleSwitcher from '../../components/RoleSwitcher';


interface BusinessInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    coordinates: [number, number];
    serviceHours: string;
    workingDays: string[];
    businessType: string;
    legalBusinessName: string;
}

export default function GarageSettings() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [qrUrl, setQrUrl] = useState('');
    const [uploadingQr, setUploadingQr] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const qrInputRef = useRef<HTMLInputElement>(null);

    const [business, setBusiness] = useState<BusinessInfo>({
        name: '',
        email: '',
        phone: '',
        address: '',
        coordinates: [73.8567, 18.5204],
        serviceHours: '9:00 AM - 8:00 PM',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        businessType: 'individual',
        legalBusinessName: '',
    });

    const { userData } = useAuth();
    const [garageId, setGarageId] = useState('');

    useEffect(() => {
        if (userData?._id) fetchGarageDetails();
    }, [userData?._id]);

    const fetchGarageDetails = async () => {
        try {
            const g = await getMyGarage(userData!._id);
            if (g) {
                setGarageId(g.id);
                setBusiness({
                    name: g.name || '',
                    email: g.email || '',
                    phone: g.phone || '',
                    address: g.address || '',
                    coordinates: [g.longitude ?? 73.8567, g.latitude ?? 18.5204],
                    serviceHours: g.service_hours || '9:00 AM - 8:00 PM',
                    workingDays: Array.isArray(g.working_days) && g.working_days.length ? g.working_days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                    businessType: (g as any).business_type || 'individual',
                    legalBusinessName: (g as any).legal_business_name || '',
                });
                if (g.photo_url) setPhotoUrl(g.photo_url);

                // Load the saved payment QR (owner-only) so the section shows it.
                const qr = await getMyGarageQr(g.id);
                if (qr) setQrUrl(qr);
            }
        } catch (err) {
            console.error('Error fetching garage details:', err);
            setError('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveBusiness = async () => {
        if (!business.name || !business.phone) {
            setError('Name and phone are required');
            return;
        }

        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const id = await saveGarageBusinessInfo(userData!._id, {
                name: business.name,
                email: business.email,
                phone: business.phone,
                address: business.address,
                coordinates: business.coordinates,
                serviceHours: business.serviceHours,
                workingDays: business.workingDays,
                businessType: business.businessType,
                legalBusinessName: business.legalBusinessName || business.name,
            });
            setGarageId(id);
            setSuccess('Business details saved successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
        if (file.size > 5 * 1024 * 1024) { setError('QR image must be under 5MB'); return; }
        if (!garageId) { setError('Save your business details first'); return; }

        setUploadingQr(true);
        setError('');
        setSuccess('');
        try {
            const url = await saveGarageQr(garageId, file);
            setQrUrl(url);
            setSuccess('Payment QR updated successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to upload QR');
        } finally {
            setUploadingQr(false);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type and size (limit to 1MB for Base64 storage)
        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }
        if (file.size > 1 * 1024 * 1024) {
            setError('Image must be less than 1MB');
            return;
        }

        setUploadingPhoto(true);
        setError('');

        try {
            // Convert file to Base64
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64String = reader.result as string;

                    // Store the image (Base64 data URL) on the garage row.
                    const { supabase } = await import('../../lib/supabase');
                    const { error: upErr } = await supabase
                        .from('garages')
                        .update({ photo_url: base64String })
                        .eq('id', garageId);
                    if (upErr) throw new Error(upErr.message);

                    setPhotoUrl(base64String);
                    setSuccess('Photo updated successfully!');
                    setTimeout(() => setSuccess(''), 3000);
                } catch (err: any) {
                    console.error('Photo save error:', err);
                    setError(err.message || 'Failed to save photo');
                } finally {
                    setUploadingPhoto(false);
                }
            };
            reader.onerror = () => {
                setError('Failed to read image file');
                setUploadingPhoto(false);
            };
            reader.readAsDataURL(file);
        } catch (err: any) {
            console.error('Photo upload error:', err);
            setError(err.message || 'Failed to upload photo');
            setUploadingPhoto(false);
        }
    };



    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex items-center justify-center">
                <CustomLoader />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] pb-10">
            {/* Header */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-6 pt-safe pb-8">
                <div className="flex items-center gap-4 pt-4 mb-6">
                    <button onClick={() => navigate('/garage')} className="p-2 -ml-2">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold">Profile Settings</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30 overflow-hidden">
                            {photoUrl ? (
                                <img src={photoUrl} alt="Garage" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-12 h-12 text-white" />
                            )}
                            {uploadingPhoto && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingPhoto}
                            className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-[var(--app-surface)] rounded-full flex items-center justify-center shadow-lg"
                        >
                            <Camera className="w-4 h-4 text-blue-600" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                        />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black">{business.name || 'Your Garage'}</h2>
                        <p className="text-blue-200 text-sm">{business.phone}</p>
                        <p className="text-blue-300 text-xs mt-1">Tap photo to change</p>
                    </div>
                </div>
            </div>

            <div className="px-6 -mt-4 space-y-6">
                {/* Success/Error Messages */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-950/40 text-red-600 p-3 rounded-xl text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="bg-green-50 dark:bg-green-950/40 text-green-600 p-3 rounded-xl text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {success}
                    </div>
                )}

                {/* Business Details Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-[var(--app-surface)] rounded-3xl p-6 shadow-sm"
                >
                    <h3 className="text-lg font-bold text-slate-900 dark:text-[var(--app-text)] mb-4 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        Business Details
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Garage Name *</label>
                            <input
                                type="text"
                                value={business.name}
                                onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-300 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)]"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Email</label>
                                <input
                                    type="email"
                                    value={business.email}
                                    onChange={(e) => setBusiness({ ...business, email: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-300 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Phone *</label>
                                <input
                                    type="tel"
                                    value={business.phone}
                                    onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-300 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)]"
                                />
                            </div>
                        </div>

                        <LocationPicker
                            address={business.address}
                            coordinates={business.coordinates}
                            hasValidLocation={Array.isArray(business.coordinates) && business.coordinates.length === 2}
                            onLocationDetected={(address, coords) => setBusiness({
                                ...business,
                                address,
                                coordinates: coords,
                            })}
                        />

                        <TimeRangePicker
                            value={business.serviceHours}
                            onChange={(value) => setBusiness({ ...business, serviceHours: value })}
                        />

                        <WorkingDaysPicker
                            value={business.workingDays}
                            onChange={(value) => setBusiness({ ...business, workingDays: value })}
                        />

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Business Type</label>
                            <select
                                value={business.businessType}
                                onChange={(e) => setBusiness({ ...business, businessType: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-300 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)]"
                            >
                                <option value="individual">Individual</option>
                                <option value="proprietorship">Proprietorship</option>
                                <option value="partnership">Partnership</option>
                                <option value="private_limited">Private Limited</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-[var(--app-text)] mb-2">Legal Business Name</label>
                            <input
                                type="text"
                                value={business.legalBusinessName}
                                onChange={(e) => setBusiness({ ...business, legalBusinessName: e.target.value })}
                                placeholder="Same as garage name if not registered"
                                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-[var(--app-surface-2)] border-2 border-slate-300 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white dark:focus:bg-[var(--app-surface)]"
                            />
                        </div>

                        <button
                            onClick={handleSaveBusiness}
                            disabled={saving}
                            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Save Business Details
                        </button>
                    </div>
                </motion.div>

                {/* Payment QR Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-[var(--app-surface)] rounded-3xl p-6 shadow-sm"
                >
                    <h3 className="text-lg font-bold text-slate-900 dark:text-[var(--app-text)] mb-4 flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-green-600" />
                        Payment QR
                    </h3>

                    <p className="text-sm text-slate-500 dark:text-[var(--app-muted)] mb-4">
                        Customers scan this to pay you <b className="text-slate-700 dark:text-[var(--app-text)]">directly</b>.
                        Upload the UPI QR from any payment app (GPay, PhonePe, Paytm…). You can change it anytime.
                    </p>

                    <input
                        ref={qrInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleQrUpload}
                        className="hidden"
                    />

                    {qrUrl ? (
                        <div className="space-y-4">
                            <div className="bg-slate-50 dark:bg-[var(--app-bg)] rounded-2xl p-4 flex justify-center">
                                <img src={qrUrl} alt="Your payment QR" className="w-48 h-48 object-contain rounded-xl bg-white p-2" />
                            </div>
                            <button
                                onClick={() => qrInputRef.current?.click()}
                                disabled={uploadingQr}
                                className="w-full bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-700 dark:text-[var(--app-text)] py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {uploadingQr ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                Replace QR
                            </button>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-[var(--app-surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <QrCode className="w-8 h-8 text-slate-400 dark:text-[var(--app-muted)]" />
                            </div>
                            <p className="text-slate-500 dark:text-[var(--app-muted)] mb-4">No payment QR added yet</p>
                            <button
                                onClick={() => qrInputRef.current?.click()}
                                disabled={uploadingQr}
                                className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2 disabled:opacity-50"
                            >
                                {uploadingQr ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                Upload QR
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>

            <div className="px-6 mt-4">
                <RoleSwitcher />
            </div>
        </div>
    );
}
