import { Wrench } from 'lucide-react';

// A garage's cover photo, or a branded placeholder when none is uploaded
// (instead of hot-linking a stock photo that implies a real storefront).
export default function GaragePhoto({ src, name, className = '' }: { src?: string | null; name: string; className?: string }) {
    if (src) {
        return <img src={src} alt={name} loading="lazy" className={`object-cover ${className}`} />;
    }
    const initial = name.trim().charAt(0).toUpperCase() || 'G';
    return (
        <div
            aria-label={name}
            className={`relative flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white ${className}`}
        >
            <Wrench className="absolute w-1/2 h-1/2 opacity-10" />
            <span className="relative font-black text-2xl">{initial}</span>
        </div>
    );
}
