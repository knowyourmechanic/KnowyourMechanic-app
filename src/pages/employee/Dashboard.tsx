import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Building2, Wrench, IndianRupee, TrendingUp, LogOut, Loader2,
    Copy, Check, MapPin, Star, BarChart3
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import GarageMap from '../../components/GarageMap';
import RoleSwitcher from '../../components/RoleSwitcher';
import { getEmployeeDashboard, type EmployeeDashboard as EmployeeDashboardData } from '../../lib/data';

interface GarageItem {
    _id: string;
    name: string;
    location: { address: string; coordinates?: [number, number] };
    rating: number;
    totalReviews: number;
    totalServices: number;
    totalEarnings: number;
    avgServicesPerDay: string;
}

interface MapGarage {
    id: string;
    name: string;
    lat: number;
    lng: number;
    rating?: number;
    reviews?: number;
    address?: string;
    phone?: string;
    isMine: boolean;
}

export default function EmployeeDashboard() {
    const navigate = useNavigate();
    const { logout, userData } = useAuth();
    const [profile, setProfile] = useState<EmployeeDashboardData['profile']>(null);
    const [stats, setStats] = useState<EmployeeDashboardData['stats']>(null);
    const [garages, setGarages] = useState<GarageItem[]>([]);
    const [mapGarages, setMapGarages] = useState<MapGarage[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (userData?._id) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, [userData?._id]);

    const fetchData = async () => {
        try {
            const d = await getEmployeeDashboard(userData!._id);
            setProfile(d.profile);
            setStats(d.stats);
            setGarages(d.garages);
            setMapGarages(d.mapGarages);
        } catch (err) {
            console.error('Employee fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const copyCode = () => {
        if (!profile?.referralCode) return;
        navigator.clipboard.writeText(profile.referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatCurrency = (val: number) => {
        if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
        if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
        return `₹${val.toFixed(0)}`;
    };

    // Convert map garages to GarageMap format with colors
    const coloredMapGarages = mapGarages.map(g => ({
        ...g,
        color: g.isMine ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : '#52525b', // purple vs zinc-600
    }));

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-900">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-medium text-white tracking-tight">Hi, {profile?.name || 'Employee'} 👋</h1>
                        <p className="text-[11px] text-zinc-500">Your Performance Dashboard</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={copyCode}
                            className="font-mono text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:border-zinc-700 transition-colors"
                        >
                            {profile?.referralCode || '...'}
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
                        </button>
                        <button
                            onClick={async () => { await logout(); navigate('/auth'); }}
                            className="p-2 text-zinc-500 hover:text-white transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            <div className="max-w-5xl mx-auto p-6 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'My Garages', value: stats?.totalGarages || 0, icon: Building2 },
                        { label: 'Total Services', value: stats?.totalServices || 0, icon: Wrench },
                        { label: 'Total Earnings', value: formatCurrency(stats?.totalEarnings || 0), icon: IndianRupee },
                        { label: 'Avg Txn/Day', value: stats?.avgServicesPerDay || '0', icon: TrendingUp },
                    ].map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-black border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-zinc-500 text-xs font-medium">{stat.label}</p>
                                <stat.icon className="w-4 h-4 text-zinc-600" />
                            </div>
                            <p className="text-2xl font-light tracking-tight text-white">{stat.value}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Referral Info Strip */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-lg px-5 py-3 flex items-center justify-between">
                    <p className="text-xs text-zinc-400">
                        Share your code <span className="font-mono font-bold text-white">{profile?.referralCode}</span> during garage onboarding to link them to your account.
                    </p>
                </div>

                {/* Map Section */}
                <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-zinc-500" />
                            <h2 className="text-sm font-medium text-zinc-300">Network Map</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                                <span className="text-[10px] text-zinc-500 font-mono">YOUR GARAGES</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
                                <span className="text-[10px] text-zinc-500 font-mono">OTHERS</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[300px] relative bg-zinc-950">
                        {coloredMapGarages.length > 0 ? (
                            <GarageMap
                                garages={coloredMapGarages}
                                userLocation={{ lat: 18.5204, lng: 73.8567 }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">No map data</div>
                        )}
                    </div>
                </div>

                {/* Garage List */}
                <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-900 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-zinc-500" />
                        <h2 className="text-sm font-medium text-zinc-300">My Garages</h2>
                    </div>

                    {garages.length === 0 ? (
                        <div className="py-16 text-center text-zinc-600">
                            <Building2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm text-zinc-400">No garages assigned yet</p>
                            <p className="text-xs text-zinc-600 mt-1">Onboard garages using your referral code</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-zinc-950 border-b border-zinc-900 text-[11px] text-zinc-500 uppercase tracking-widest font-mono">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">Name</th>
                                        <th className="px-5 py-3 font-medium">Location</th>
                                        <th className="px-5 py-3 font-medium text-right">Rating</th>
                                        <th className="px-5 py-3 font-medium text-right">Services</th>
                                        <th className="px-5 py-3 font-medium text-right">Avg/Day</th>
                                        <th className="px-5 py-3 font-medium text-right">Earnings</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {garages.map((garage, i) => (
                                        <motion.tr
                                            key={garage._id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            className="hover:bg-zinc-900/30 transition-colors"
                                        >
                                            <td className="px-5 py-3 text-zinc-200 font-medium">{garage.name}</td>
                                            <td className="px-5 py-3 text-xs text-zinc-500 truncate max-w-[180px]">
                                                {garage.location?.address || '—'}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <span className="flex items-center justify-end gap-1 text-zinc-400 text-xs">
                                                    <Star className="w-3 h-3 text-amber-500" />
                                                    {garage.rating || '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono text-zinc-300">{garage.totalServices}</td>
                                            <td className="px-5 py-3 text-right font-mono text-zinc-400">{garage.avgServicesPerDay}</td>
                                            <td className="px-5 py-3 text-right font-mono text-emerald-400">{formatCurrency(garage.totalEarnings)}</td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="border border-zinc-800 rounded-lg p-2">
                    <RoleSwitcher variant="nav" />
                </div>
            </div>
        </div>
    );
}
