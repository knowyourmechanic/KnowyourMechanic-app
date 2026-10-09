import { Star } from 'lucide-react';
import { haptic } from '../lib/haptics';

// Read-only or tappable 1–5 stars.
export default function Stars({ value, onChange, size = 'md', label }: {
    value: number;
    onChange?: (v: number) => void;
    size?: 'sm' | 'md' | 'lg';
    label?: string;
}) {
    const cls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-9 h-9' : 'w-6 h-6';
    return (
        <div className="flex items-center gap-1" role={onChange ? 'radiogroup' : 'img'} aria-label={label ?? `${value} / 5`}>
            {[1, 2, 3, 4, 5].map((n) => {
                const star = <Star className={`${cls} ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />;
                return onChange ? (
                    <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n}`}
                        onClick={() => { haptic('tap'); onChange(n); }} className="active:scale-90 transition-transform">
                        {star}
                    </button>
                ) : <span key={n}>{star}</span>;
            })}
        </div>
    );
}
