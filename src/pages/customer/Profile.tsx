import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Car, Save, Loader2, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getCustomerProfile, saveCustomerProfile } from '../../lib/data';
import RoleSwitcher from '../../components/RoleSwitcher';
import LanguagePicker from '../../components/LanguagePicker';
import { useToast } from '../../components/Toast';
import { useI18n } from '../../i18n';

export default function CustomerProfile() {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const { t } = useI18n();
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loadingProfile, setLoadingProfile] = useState(true);

    const [profile, setProfile] = useState({
        name: '',
        vehicleMake: '',
        vehicleModel: '',
        vehicleYear: '',
        vehicleNumber: '',
    });

    useEffect(() => {
        if (userData?._id) {
            getCustomerProfile(userData._id)
                .then(setProfile)
                .catch((e) => console.error('Failed to fetch profile:', e))
                .finally(() => setLoadingProfile(false));
        }
    }, [userData?._id]);

    const handleSave = async () => {
        if (!userData?._id) return;
        setSaving(true);
        try {
            await saveCustomerProfile(userData._id, profile);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            toast.error(t('profile.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    if (loadingProfile) {
        return (
            <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pt-safe pb-6">
            {/* Header with Back Button */}
            <header className="bg-blue-600 text-white px-6 py-8 rounded-b-[2.5rem] mb-6">
                <button
                    onClick={() => navigate('/customer')}
                    className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">{t('common.back')}</span>
                </button>
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                        <User className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black">{t('profile.title')}</h1>
                        <p className="text-blue-200 text-sm">{t('profile.subtitle')}</p>
                    </div>
                </div>
            </header>

            <div className="px-6 space-y-6">
                {/* Personal Info */}
                <div className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-[var(--app-border)]">
                    <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)] mb-4 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        {t('profile.personal')}
                    </h3>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-[var(--app-muted)] mb-2">{t('profile.name')}</label>
                        <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            placeholder="Enter your name"
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] border border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Vehicle Info */}
                <div className="bg-white dark:bg-[var(--app-surface)] rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-[var(--app-border)]">
                    <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)] mb-4 flex items-center gap-2">
                        <Car className="w-4 h-4 text-blue-600" />
                        {t('profile.vehicle')}
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-[var(--app-muted)] mb-1">{t('profile.make')}</label>
                                <input
                                    type="text"
                                    value={profile.vehicleMake}
                                    onChange={(e) => setProfile({ ...profile, vehicleMake: e.target.value })}
                                    placeholder="e.g. Honda"
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] border border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-[var(--app-muted)] mb-1">{t('profile.model')}</label>
                                <input
                                    type="text"
                                    value={profile.vehicleModel}
                                    onChange={(e) => setProfile({ ...profile, vehicleModel: e.target.value })}
                                    placeholder="e.g. City"
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] border border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-[var(--app-muted)] mb-1">{t('profile.year')}</label>
                                <input
                                    type="text"
                                    value={profile.vehicleYear}
                                    onChange={(e) => setProfile({ ...profile, vehicleYear: e.target.value })}
                                    placeholder="e.g. 2022"
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] border border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-[var(--app-muted)] mb-1">{t('profile.number')}</label>
                                <input
                                    type="text"
                                    value={profile.vehicleNumber}
                                    onChange={(e) => setProfile({ ...profile, vehicleNumber: e.target.value.toUpperCase() })}
                                    placeholder="MH 12 AB 1234"
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[var(--app-bg)] border border-slate-200 dark:border-[var(--app-border)] focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm uppercase"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <motion.button
                    onClick={handleSave}
                    disabled={saving}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${saved
                        ? 'bg-green-500 text-white'
                        : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        }`}
                >
                    {saving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : saved ? (
                        <>
                            <Check className="w-5 h-5" />
                            {t('profile.saved')}
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            {t('profile.save')}
                        </>
                    )}
                </motion.button>

                <LanguagePicker tone="card" />

                <RoleSwitcher />
            </div>
        </div>
    );
}
