import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Repeat, X, Check, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_META, routeForRole } from '../lib/roles';
import { addMyRole, type AppRole } from '../lib/data';
import { useI18n } from '../i18n';

// Lets a user who holds more than one role switch dashboards without logging
// out, and lets a customer number register a garage (or a garage owner use the
// customer side) without a second account. Drop it into any settings screen.
// variant 'card' suits light settings screens; 'nav' suits the dark staff
// consoles (admin/support sidebars). Both open the same picker sheet.
export default function RoleSwitcher({ variant = 'card' }: { variant?: 'card' | 'nav' }) {
    const { userData, availableRoles, switchRole, refreshRoles } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<AppRole | null>(null);
    const [error, setError] = useState('');
    const { t } = useI18n();

    if (!userData) return null;
    const current = userData.role;
    // Self-service roles this number could add (privileged roles are admin-granted).
    const addable = (['garage', 'customer'] as const).filter(
        (r) => !availableRoles.includes(r) && (current === 'customer' || current === 'garage'),
    );
    if (availableRoles.length <= 1 && addable.length === 0) return null;

    const addRole = async (role: 'customer' | 'garage') => {
        setBusy(role);
        setError('');
        try {
            await addMyRole(role);
            await refreshRoles();
            switchRole(role);
            const path = await routeForRole(role, userData._id);
            setOpen(false);
            navigate(path);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not add that role.');
        } finally {
            setBusy(null);
        }
    };

    const choose = async (role: AppRole) => {
        if (role === current) { setOpen(false); return; }
        setBusy(role);
        try {
            switchRole(role);
            const path = await routeForRole(role, userData._id);
            setOpen(false);
            navigate(path);
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            {variant === 'nav' ? (
                <button
                    onClick={() => setOpen(true)}
                    className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-colors"
                >
                    <Repeat className="w-4 h-4 text-zinc-500" />
                    {t('roles.switch')}
                </button>
            ) : (
                <button
                    onClick={() => setOpen(true)}
                    className="w-full bg-white dark:bg-[var(--app-surface)] rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-[var(--app-border)] flex items-center gap-3 active:scale-[0.99] transition-transform"
                >
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600">
                        <Repeat className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                        <p className="font-bold text-slate-900 dark:text-[var(--app-text)]">{availableRoles.length > 1 ? t('roles.switch') : addable[0] === 'garage' ? t('roles.ownGarage') : t('roles.useCustomer')}</p>
                        <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">
                            {availableRoles.length > 1 ? t('roles.current', { role: ROLE_META[current]?.label ?? current }) : addable[0] === 'garage' ? t('roles.ownGarageSub') : t('roles.useCustomerSub')}
                        </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                </button>
            )}

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] bg-black/40 flex items-end sm:items-center justify-center"
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="bg-white dark:bg-[var(--app-surface)] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-xl font-black text-slate-900 dark:text-[var(--app-text)]">{t('roles.yours')}</h2>
                                <button onClick={() => setOpen(false)} className="text-slate-400 dark:text-[var(--app-muted)] active:scale-90 transition-transform">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                {availableRoles.map((role) => {
                                    const meta = ROLE_META[role];
                                    if (!meta) return null;
                                    const Icon = meta.Icon;
                                    const isCurrent = role === current;
                                    return (
                                        <button
                                            key={role}
                                            onClick={() => choose(role)}
                                            disabled={busy !== null}
                                            className={`w-full rounded-2xl p-4 flex items-center gap-4 border transition-all text-left ${isCurrent ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-100 dark:border-[var(--app-border)] bg-white dark:bg-[var(--app-surface)] hover:border-blue-200 dark:hover:border-blue-800/50'}`}
                                        >
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600">
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)]">{meta.label}</h3>
                                                <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">{meta.sub}</p>
                                            </div>
                                            {busy === role ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                            ) : isCurrent ? (
                                                <Check className="w-5 h-5 text-blue-600" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                                            )}
                                        </button>
                                    );
                                })}
                                {addable.map((role) => {
                                    const meta = ROLE_META[role];
                                    const Icon = meta.Icon;
                                    return (
                                        <button
                                            key={`add-${role}`}
                                            onClick={() => addRole(role)}
                                            disabled={busy !== null}
                                            className="w-full rounded-2xl p-4 flex items-center gap-4 border border-dashed border-blue-300 dark:border-blue-800/60 text-left"
                                        >
                                            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white">
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)]">{role === 'garage' ? t('roles.registerGarage') : t('roles.addCustomer')}</h3>
                                                <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm">{t('roles.sameNumber')}</p>
                                            </div>
                                            {busy === role ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> : <ChevronRight className="w-5 h-5 text-blue-600" />}
                                        </button>
                                    );
                                })}
                                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
