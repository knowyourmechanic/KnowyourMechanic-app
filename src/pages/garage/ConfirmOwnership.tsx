import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, Loader2, MapPin, X } from 'lucide-react';
import { getGarageSetupBy, getMyGarageMembership, respondToGarageClaim } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { garageHome } from '../../lib/roles';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';

// An employee set this garage up with your number as the owner. Confirm it to
// take charge (and list it for customers), or say it isn't yours.
export default function ConfirmOwnership() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const toast = useToast();
    const [garage, setGarage] = useState<{ id: string; name: string; address: string | null } | null>(null);
    const [setupBy, setSetupBy] = useState<string | null>(null);
    const [busy, setBusy] = useState<'yes' | 'no' | null>(null);

    useEffect(() => {
        (async () => {
            const m = await getMyGarageMembership();
            if (!m || m.memberRole !== 'owner' || m.ownerConfirmed) { navigate(await garageHome(), { replace: true }); return; }
            const { data } = await supabase.from('garages').select('id,name,address').eq('id', m.garageId).maybeSingle();
            if (data) setGarage(data);
            setSetupBy(await getGarageSetupBy(m.garageId));
        })();
    }, [navigate]);

    const answer = async (accept: boolean) => {
        if (!garage) return;
        if (!accept && !(await toast.confirm(t('confirm.declineConfirm'), { confirmLabel: t('confirm.no'), cancelLabel: t('common.back'), danger: true }))) return;
        setBusy(accept ? 'yes' : 'no');
        try {
            await respondToGarageClaim(garage.id, accept);
            toast.success(accept ? t('confirm.accepted') : t('confirm.declined'));
            navigate(await garageHome(), { replace: true });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    if (!garage) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[var(--app-bg)]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    }

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] px-6 pt-safe pb-10 flex flex-col justify-center text-slate-900 dark:text-[var(--app-text)]">
            <h1 className="text-2xl font-extrabold mb-2">{t('confirm.title')}</h1>
            <p className="text-slate-500 dark:text-[var(--app-muted)] mb-6">
                {setupBy ? t('confirm.bodyBy', { name: setupBy }) : t('confirm.body')}
            </p>
            <div className="bg-white dark:bg-[var(--app-surface)] rounded-3xl p-5 border border-slate-100 dark:border-[var(--app-border)] mb-6 flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0"><Building2 className="w-6 h-6" /></div>
                <div className="min-w-0">
                    <p className="font-bold text-lg">{garage.name}</p>
                    {garage.address && <p className="text-sm text-slate-500 dark:text-[var(--app-muted)] flex items-start gap-1"><MapPin className="w-4 h-4 mt-0.5 shrink-0" />{garage.address}</p>}
                </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-[var(--app-muted)] mb-6">{t('confirm.explain')}</p>
            <button onClick={() => answer(true)} disabled={busy !== null}
                className="w-full h-14 btn-premium rounded-2xl font-bold text-white flex items-center justify-center gap-2 mb-3 disabled:opacity-50">
                {busy === 'yes' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} {t('confirm.yes')}
            </button>
            <button onClick={() => answer(false)} disabled={busy !== null}
                className="w-full h-12 rounded-2xl font-bold text-red-600 flex items-center justify-center gap-2 disabled:opacity-50">
                {busy === 'no' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} {t('confirm.no')}
            </button>
        </div>
    );
}
