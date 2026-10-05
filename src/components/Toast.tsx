import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { haptic } from '../lib/haptics';

// App-wide toasts (replaces blocking window.alert). Usage:
//   const toast = useToast(); toast.success('Saved'); toast.error(err)
type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; text: string }
interface ConfirmOptions { confirmLabel?: string; cancelLabel?: string; danger?: boolean }
interface ToastApi {
    success: (text: string) => void;
    error: (text: string) => void;
    info: (text: string) => void;
    // In-app replacement for window.confirm. Resolves true on confirm.
    confirm: (text: string, opts?: ConfirmOptions) => Promise<boolean>;
}
interface PendingConfirm extends ConfirmOptions { text: string; resolve: (ok: boolean) => void }

const ToastContext = createContext<ToastApi | null>(null);

const TONE = {
    success: { Icon: CheckCircle2, cls: 'bg-emerald-600 text-white' },
    error: { Icon: AlertTriangle, cls: 'bg-red-600 text-white' },
    info: { Icon: Info, cls: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);
    const [pending, setPending] = useState<PendingConfirm | null>(null);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
    const push = useCallback((tone: Tone, text: string) => {
        const id = nextId.current++;
        setItems((xs) => [...xs.slice(-2), { id, tone, text }]);
        if (tone !== 'info') haptic(tone === 'success' ? 'success' : 'error');
        setTimeout(() => dismiss(id), tone === 'error' ? 5000 : 3000);
    }, [dismiss]);

    const api = useMemo<ToastApi>(() => ({
        success: (t) => push('success', t),
        error: (t) => push('error', t),
        info: (t) => push('info', t),
        confirm: (text, opts) => new Promise<boolean>((resolve) => setPending({ text, resolve, ...opts })),
    }), [push]);

    const settle = (ok: boolean) => {
        pending?.resolve(ok);
        setPending(null);
    };

    return (
        <ToastContext.Provider value={api}>
            {children}
            <AnimatePresence>
                {pending && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2001] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                        onClick={() => settle(false)}
                    >
                        <motion.div
                            role="alertdialog"
                            aria-modal="true"
                            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                            className="w-full max-w-sm bg-white dark:bg-[var(--app-surface)] rounded-3xl p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <p className="text-slate-900 dark:text-[var(--app-text)] font-semibold text-base mb-6">{pending.text}</p>
                            <div className="flex gap-3">
                                <button onClick={() => settle(false)} className="flex-1 h-12 rounded-2xl bg-slate-100 dark:bg-[var(--app-surface-2)] font-bold text-slate-600 dark:text-[var(--app-muted)]">
                                    {pending.cancelLabel ?? 'Cancel'}
                                </button>
                                <button
                                    onClick={() => settle(true)}
                                    autoFocus
                                    className={`flex-1 h-12 rounded-2xl font-bold text-white ${pending.danger ? 'bg-red-600' : 'bg-blue-600'}`}
                                >
                                    {pending.confirmLabel ?? 'OK'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="fixed inset-x-0 bottom-0 z-[2000] flex flex-col items-center gap-2 px-4 pb-safe pointer-events-none" aria-live="polite">
                <AnimatePresence>
                    {items.map(({ id, tone, text }) => {
                        const { Icon, cls } = TONE[tone];
                        return (
                            <motion.div
                                key={id}
                                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 12 }}
                                role={tone === 'error' ? 'alert' : 'status'}
                                className={`pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 text-sm font-semibold ${cls}`}
                            >
                                <Icon className="w-5 h-5 shrink-0" />
                                <span className="flex-1">{text}</span>
                                <button onClick={() => dismiss(id)} aria-label="Dismiss" className="opacity-70">
                                    <X className="w-4 h-4" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
