import { Languages } from 'lucide-react';
import { useI18n } from '../i18n';
import { LANGUAGES } from '../i18n/languages';

// Compact segmented language switch (English / हिन्दी / मराठी).
export default function LanguagePicker({ tone = 'light' }: { tone?: 'light' | 'card' }) {
    const { lang, setLang, t } = useI18n();
    return (
        <div className={tone === 'card' ? 'bg-white dark:bg-[var(--app-surface)] rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-[var(--app-border)]' : ''}>
            {tone === 'card' && (
                <p className="font-bold text-slate-900 dark:text-[var(--app-text)] mb-3 flex items-center gap-2">
                    <Languages className="w-5 h-5 text-blue-600" /> {t('lang.title')}
                </p>
            )}
            <div role="radiogroup" aria-label={t('lang.title')} className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((l) => (
                    <button
                        key={l.code}
                        role="radio"
                        aria-checked={lang === l.code}
                        onClick={() => setLang(l.code)}
                        className={`h-11 rounded-xl text-sm font-bold transition-colors ${lang === l.code
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-600 dark:text-[var(--app-muted)]'}`}
                    >
                        {l.native}
                    </button>
                ))}
            </div>
        </div>
    );
}
