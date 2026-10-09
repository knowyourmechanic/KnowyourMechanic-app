import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hourglass, Loader2, RefreshCw } from 'lucide-react';
import { cancelJoinRequest, getMyGarageMembership } from '../../lib/data';
import { garageHome } from '../../lib/roles';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { errorMessage } from '../../lib/errors';

// An employee waiting for the owner to approve their join request.
export default function GaragePending() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const toast = useToast();
    const { logout } = useAuth();
    const [garageName, setGarageName] = useState('');
    const [busy, setBusy] = useState(false);

    const check = useCallback(async () => {
        const m = await getMyGarageMembership();
        if (m?.status === 'pending') { setGarageName(m.garageName); return; }
        const next = await garageHome();
        if (next === '/garage') toast.success(t('pending.approved'));
        else if (next === '/garage/start') toast.info(t('pending.notApproved'));
        navigate(next, { replace: true });
    }, [navigate, t, toast]);

    useEffect(() => {
        check();
        // Re-check when the employee comes back to the app (e.g. after calling the owner).
        const onVisible = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [check]);

    const cancel = async () => {
        if (!(await toast.confirm(t('pending.cancelConfirm'), { confirmLabel: t('pending.cancel'), cancelLabel: t('common.back'), danger: true }))) return;
        setBusy(true);
        try {
            await cancelJoinRequest();
            navigate('/garage/start', { replace: true });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] px-6 pt-safe pb-10 flex flex-col justify-center text-center text-slate-900 dark:text-[var(--app-text)]">
            <div className="w-20 h-20 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto mb-6">
                <Hourglass className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-extrabold mb-2">{t('pending.title')}</h1>
            <p className="text-slate-500 dark:text-[var(--app-muted)] mb-8">{t('pending.body', { garage: garageName || '…' })}</p>
            <button onClick={check} className="w-full h-14 btn-premium rounded-2xl font-bold text-white flex items-center justify-center gap-2 mb-3">
                <RefreshCw className="w-5 h-5" /> {t('pending.check')}
            </button>
            <button onClick={cancel} disabled={busy} className="w-full h-12 rounded-2xl font-bold text-red-600 flex items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('pending.cancel')}
            </button>
            <button onClick={async () => { await logout(); navigate('/auth'); }} className="mt-6 text-sm text-slate-400">{t('common.logout')}</button>
        </div>
    );
}
