import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Loader2, Wrench, Car, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sendOtp, verifyOtp } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getMyRoles, type AppRole } from '../lib/data';
import { ROLE_META, routeForRole } from '../lib/roles';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';
import LanguagePicker from '../components/LanguagePicker';
import { errorMessage } from '../lib/errors';
import { haptic } from '../lib/haptics';

type Step = 'phone' | 'otp' | 'role' | 'choose';

export default function AuthPage() {
    /* dark-mode themed via dark: variants (Tailwind v4 follows system preference) */
    const [step, setStep] = useState<Step>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // For the "Continue as…" picker when the number holds more than one role.
    const [roleChoices, setRoleChoices] = useState<AppRole[]>([]);
    const [linkedProfile, setLinkedProfile] = useState<{ id: string; auth_user_id: string; phone_number: string; role: AppRole } | null>(null);

    const navigate = useNavigate();
    const { t } = useI18n();
    const { setUserData, setUser, refreshRoles } = useAuth();

    // Sets the active-role userData and routes to the matching home screen.
    const enterAsRole = async (role: AppRole, profile: { id: string; auth_user_id: string; phone_number: string }) => {
        const userData = { _id: profile.id, firebaseUid: profile.auth_user_id, phoneNumber: profile.phone_number, role };
        setUserData(userData);
        localStorage.setItem('userRole', role);
        refreshRoles().catch(() => {});
        navigate(await routeForRole(role, profile.id));
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (phone.length < 10) {
            setError(t('auth.invalidPhone'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            await sendOtp(phone);
            setStep('otp');
        } catch (err) {
            setError(errorMessage(err, t('auth.sendFailed')));
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length < 6) {
            setError(t('auth.otpInvalid'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            const user = await verifyOtp(otp);
            setUser(user);

            // Link the auth user to its profile (by phone), then load every role
            // the number holds.
            const { data, error } = await supabase.rpc('link_current_auth_profile');
            const row = Array.isArray(data) ? data[0] : data;

            if (!error && row) {
                const roles = await getMyRoles();
                const known: AppRole[] = roles.length > 0 ? roles : [row.role as AppRole];

                if (known.length > 1) {
                    // Multiple roles on this number — let them pick which to enter.
                    setLinkedProfile(row);
                    setRoleChoices(known);
                    setStep('choose');
                    return;
                }

                await enterAsRole(known[0], row);
                return;
            }

            // No profile yet — new user, choose a role.
            setStep('role');
        } catch (err) {
            haptic('error');
            setError(errorMessage(err, t('auth.verifyFailed')));
        } finally {
            setLoading(false);
        }
    };

    const handleRoleSelect = async (role: 'customer' | 'garage') => {
        setLoading(true);
        setError('');

        try {
            const { data: userResult } = await supabase.auth.getUser();
            const authUser = userResult.user;
            if (!authUser) {
                setError('Session expired. Please sign in again.');
                return;
            }
            const phoneDigits = (authUser.phone || '').replace(/\D/g, '').slice(-10);

            // Insert WITHOUT .select() back: a fresh user can't read the row they
            // just created in the same statement — current_profile_id() (a STABLE
            // function in the SELECT policy) is evaluated on the pre-insert
            // snapshot and returns null, which surfaces as an RLS error. Create
            // first, then load the profile via the RPC (which also links it).
            const { error } = await supabase
                .from('profiles')
                .insert({ auth_user_id: authUser.id, phone_number: phoneDigits, role });

            if (error) {
                setError(error.message || 'Error creating profile');
                return;
            }

            const { data: linked, error: linkErr } = await supabase.rpc('link_current_auth_profile');
            const row = Array.isArray(linked) ? linked[0] : linked;
            if (linkErr || !row) {
                setError(linkErr?.message || 'Profile created but could not be loaded.');
                return;
            }

            await enterAsRole(role, row);
        } catch (err) {
            setError(errorMessage(err, t('auth.profileFailed')));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-dark min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pt-safe px-6 pb-12 overflow-hidden text-slate-900 dark:text-[var(--app-text)]">

            <AnimatePresence mode="wait">
                {step === 'phone' && (
                    <motion.div
                        key="phone"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, x: -100 }}
                        className="flex-1 flex flex-col"
                    >
                        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
                            <div className="w-28 h-28 rounded-[2rem] bg-white dark:bg-[var(--app-surface)] shadow-2xl shadow-blue-200/50 flex items-center justify-center mb-10 mx-auto overflow-hidden">
                                <img src="/logo.jpg" alt="KnowYourMechanic" className="w-full h-full object-cover" />
                            </div>

                            <div className="text-center mb-10">
                                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-[var(--app-text)] mb-3">
                                    KnowyourMechanic
                                </h1>
                                <p className="text-slate-500 dark:text-[var(--app-muted)] text-lg">
                                    {t('auth.tagline')}
                                </p>
                            </div>

                            <form onSubmit={handleSendOtp} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600 dark:text-[var(--app-muted)] ml-1">{t('auth.phoneLabel')}</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 border-r border-slate-200 dark:border-[var(--app-border)] pr-3">
                                            <span className="text-slate-500 dark:text-[var(--app-muted)] font-medium">+91</span>
                                        </div>
                                        <input
                                            type="tel"
                                            placeholder="00000 00000"
                                            className="w-full h-16 bg-white dark:bg-[var(--app-surface)] rounded-2xl pl-20 pr-4 text-xl font-semibold tracking-wide placeholder:text-slate-300 dark:placeholder:text-[#5A6B82]"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                        />
                                    </div>
                                </div>

                                {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}

                                <button
                                    type="submit"
                                    disabled={loading || phone.length < 10}
                                    className="w-full h-16 btn-premium rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all"
                                >
                                    {loading ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            {t('auth.continue')}
                                            <ChevronRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <div className="mt-8">
                                <LanguagePicker />
                            </div>
                        </div>

                        <div className="mt-auto text-center py-6">
                            <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs">
                                By continuing, you agree to our Terms & Privacy Policy
                            </p>
                        </div>
                    </motion.div>
                )}

                {step === 'otp' && (
                    <motion.div
                        key="otp"
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        className="flex-1 flex flex-col max-w-sm mx-auto w-full pt-10"
                    >
                        <button
                            onClick={() => setStep('phone')}
                            aria-label={t('auth.changeNumber')}
                            className="w-10 h-10 rounded-full border border-slate-200 dark:border-[var(--app-border)] flex items-center justify-center text-slate-400 dark:text-[var(--app-muted)] self-start mb-8 transition-colors active:bg-slate-100 dark:active:bg-[var(--app-surface-2)]"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>

                        <div className="mb-10">
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-[var(--app-text)] mb-3">{t('auth.otpTitle')}</h2>
                            <p className="text-slate-500 dark:text-[var(--app-muted)] text-lg">
                                {t('auth.otpSent', { phone })}
                            </p>
                            <button type="button" onClick={() => setStep('phone')} className="mt-2 text-blue-600 font-semibold text-sm">
                                {t('auth.changeNumber')}
                            </button>
                        </div>

                        <form onSubmit={handleVerifyOtp} className="space-y-8">
                            <div className="flex justify-center">
                                <input
                                    type="text"
                                    placeholder="000000"
                                    className="w-full h-20 bg-white dark:bg-[var(--app-surface)] rounded-3xl text-center text-4xl font-bold tracking-[1rem] placeholder:text-slate-200 dark:placeholder:text-[#5A6B82]"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    maxLength={6}
                                />
                            </div>

                            {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}

                            <button
                                type="submit"
                                disabled={loading || otp.length < 6}
                                className="w-full h-16 btn-premium rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-40 transition-all shadow-xl shadow-blue-500/20"
                            >
                                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : t('auth.verify')}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('phone')}
                                className="w-full text-blue-600 font-bold hover:underline"
                            >
                                Resend code
                            </button>
                        </form>
                    </motion.div>
                )}

                {step === 'role' && (
                    <motion.div
                        key="role"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full"
                    >
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-[var(--app-text)] mb-3">{t('auth.roleTitle')}</h2>
                        </div>

                        <div className="space-y-6">
                            <button
                                onClick={() => handleRoleSelect('customer')}
                                disabled={loading}
                                className="w-full premium-card p-8 flex items-center gap-6 group hover:border-blue-300 transition-all text-left"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center group-hover:bg-blue-600 text-blue-600 group-hover:text-white transition-colors shadow-inner">
                                    <Car className="w-8 h-8" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-[var(--app-text)]">{t('auth.roleCustomer')}</h3>
                                    <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">{t('auth.roleCustomerSub')}</p>
                                </div>
                                <ChevronRight className="w-6 h-6 text-slate-300 dark:text-slate-600 group-hover:text-blue-600 transition-colors" />
                            </button>

                            <button
                                onClick={() => handleRoleSelect('garage')}
                                disabled={loading}
                                className="w-full premium-card p-8 flex items-center gap-6 group hover:border-blue-300 transition-all text-left"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-[var(--app-surface-2)] flex items-center justify-center group-hover:bg-blue-600 text-slate-600 dark:text-[var(--app-muted)] group-hover:text-white transition-colors shadow-inner">
                                    <Wrench className="w-8 h-8" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-[var(--app-text)]">{t('auth.roleGarage')}</h3>
                                    <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">{t('auth.roleGarageSub')}</p>
                                </div>
                                <ChevronRight className="w-6 h-6 text-slate-300 dark:text-slate-600 group-hover:text-blue-600 transition-colors" />
                            </button>
                        </div>

                        {error && <p className="text-red-500 text-sm font-medium text-center mt-6 bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}
                    </motion.div>
                )}

                {step === 'choose' && (
                    <motion.div
                        key="choose"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full"
                    >
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-[var(--app-text)] mb-3">{t('auth.chooseTitle')}</h2>
                        </div>

                        <div className="space-y-4">
                            {roleChoices.map((role) => {
                                const meta = ROLE_META[role];
                                const Icon = meta.Icon;
                                return (
                                    <button
                                        key={role}
                                        onClick={() => linkedProfile && enterAsRole(role, linkedProfile)}
                                        disabled={loading}
                                        className="w-full premium-card p-6 flex items-center gap-5 group hover:border-blue-300 transition-all text-left"
                                    >
                                        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center group-hover:bg-blue-600 text-blue-600 group-hover:text-white transition-colors shadow-inner">
                                            <Icon className="w-7 h-7" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-[var(--app-text)]">{meta.label}</h3>
                                            <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">{meta.sub}</p>
                                        </div>
                                        <ChevronRight className="w-6 h-6 text-slate-300 dark:text-slate-600 group-hover:text-blue-600 transition-colors" />
                                    </button>
                                );
                            })}
                        </div>

                        {error && <p className="text-red-500 text-sm font-medium text-center mt-6 bg-red-50 dark:bg-red-950/40 py-2 rounded-lg">{error}</p>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
