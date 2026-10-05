import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey } from './en';
import { hi } from './hi';
import { mr } from './mr';

// Lightweight i18n: English is the source of truth; Hindi/Marathi fall back to
// English for any key not yet translated. `{name}` placeholders are filled from vars.
import type { Lang } from './languages';
export type { Lang } from './languages';

const DICTS: Record<Lang, Partial<Record<MessageKey, string>>> = { en, hi, mr };
const STORAGE_KEY = 'lang';

type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

interface I18nApi {
    lang: Lang;
    setLang: (l: Lang) => void;
    t: TFunction;
    locale: string;   // for Intl number/date formatting
}

const I18nContext = createContext<I18nApi | null>(null);

function initialLang(): Lang {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'en' || saved === 'hi' || saved === 'mr') return saved;
    } catch { /* storage unavailable */ }
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2);
    return nav === 'hi' || nav === 'mr' ? nav : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(initialLang);

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = useCallback((l: Lang) => {
        setLangState(l);
        try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    }, []);

    const t = useCallback<TFunction>((key, vars) => {
        let s = DICTS[lang][key] ?? en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
        return s;
    }, [lang]);

    const api = useMemo(() => ({ lang, setLang, t, // Latin digits everywhere: OTPs, plates and UPI amounts are Latin, so
        // mixing in Devanagari numerals (mr-IN's default) would confuse.
        locale: `${lang}-IN-u-nu-latn` }), [lang, setLang, t]);
    return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export function useI18n(): I18nApi {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used within I18nProvider');
    return ctx;
}
