import { useState, useEffect } from 'react';
import {
    Wrench, IndianRupee, TrendingUp, Building2,
    Loader2, MapPin, Activity,
    ChevronRight, Star, Search, ChevronDown, ChevronsRight
} from 'lucide-react';
import GarageMap from '../../components/GarageMap';
import { getAdminStats, getAdminGarages, type AdminGarageItem } from '../../lib/data';

interface Stats {
    totalGarages: number;
    totalCustomers: number;
    totalEmployees: number;
    totalServices: number;
    totalRevenue: number;
    totalGMV: number;
    avgServicesPerDay: string;
    referredGarages: number;
    dailyBreakdown: { date: string; count: number; revenue: number }[];
}

type GarageItem = AdminGarageItem;

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [garages, setGarages] = useState<GarageItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [chartRange, setChartRange] = useState('30d');
    const [garageLimit, setGarageLimit] = useState(10);

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, []);

    // Re-fetch stats when chart range changes
    useEffect(() => {
        if (!loading) fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, [chartRange]);

    const fetchStats = async () => {
        try {
            setStats(await getAdminStats(parseInt(chartRange, 10) || 30));
        } catch (err) {
            console.error('Stats fetch error:', err);
        }
    };

    const fetchData = async () => {
        try {
            const [statsData, garagesData] = await Promise.all([getAdminStats(parseInt(chartRange, 10) || 30), getAdminGarages()]);
            setStats(statsData);
            setGarages(garagesData);
        } catch (err) {
            console.error('Admin fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const mapGarages = garages.map(g => ({
        id: g._id,
        name: g.name,
        lat: g.location?.coordinates?.[1] || 18.52,
        lng: g.location?.coordinates?.[0] || 73.86,
        rating: g.rating,
        reviews: g.totalReviews,
        address: g.location?.address,
        phone: g.phone,
    }));

    const filteredGarages = garages.filter(g =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.location?.address?.toLowerCase().includes(search.toLowerCase())
    );

    const maxCount = stats ? Math.max(...stats.dailyBreakdown.map(d => d.count), 1) : 1;

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    const formatCurrency = (val: number) => {
        if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
        if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
        return `₹${val.toFixed(0)}`;
    };

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800">
            <main className="max-w-7xl mx-auto p-6 space-y-6 pt-10">

                {/* Primary Stats: Solid Black, Thin Borders */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Garages', value: stats?.totalGarages || 0, icon: Building2 },
                        { label: 'Services Completed', value: stats?.totalServices || 0, icon: Wrench },
                        { label: 'Platform Revenue', value: formatCurrency(stats?.totalRevenue || 0), icon: IndianRupee },
                        { label: 'Avg Transactions (Per Day)', value: stats?.avgServicesPerDay || '0', icon: TrendingUp },
                    ].map((stat) => (
                        <div key={stat.label} className="bg-black border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-zinc-500 text-xs font-medium">{stat.label}</p>
                                <stat.icon className="w-4 h-4 text-zinc-600" />
                            </div>
                            <p className="text-3xl font-light tracking-tight text-white">{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Secondary Stats Row */}
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Active Customers', value: stats?.totalCustomers || 0 },
                        { label: 'Field Employees', value: stats?.totalEmployees || 0 },
                        { label: 'Referred Garages', value: stats?.referredGarages || 0 },
                    ].map(s => (
                        <div key={s.label} className="bg-zinc-950/50 border border-zinc-900 rounded-lg p-4 flex items-center justify-between">
                            <p className="text-zinc-500 text-xs">{s.label}</p>
                            <p className="text-lg font-medium text-zinc-300">{s.value}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Activity Chart */}
                    <div className="lg:col-span-2 bg-black border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-zinc-500" />
                                <h2 className="text-sm font-medium text-zinc-300">Service Volume</h2>
                            </div>
                            <div className="relative">
                                <select
                                    value={chartRange}
                                    onChange={e => setChartRange(e.target.value)}
                                    className="bg-black border border-zinc-800 hover:border-zinc-700 transition-colors rounded px-3 py-1.5 text-xs font-mono text-zinc-300 appearance-none pr-8 focus:outline-none focus:border-zinc-600"
                                >
                                    <option value="1d">Last Day</option>
                                    <option value="7d">Last Week</option>
                                    <option value="30d">Last Month</option>
                                    <option value="90d">Last 3 Months</option>
                                    <option value="180d">Last 6 Months</option>
                                    <option value="365d">Last Year</option>
                                    <option value="all">All Time</option>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                            </div>
                        </div>

                        <div className="p-5 flex-1 flex flex-col justify-end">
                            {stats && stats.dailyBreakdown.length > 0 ? (
                                <>
                                    <div className="flex items-end gap-1 h-40">
                                        {stats.dailyBreakdown.map((day) => {
                                            const height = Math.max(2, (day.count / maxCount) * 100);
                                            return (
                                                <div
                                                    key={day.date}
                                                    className="flex-1 group relative cursor-pointer flex flex-col justify-end h-full"
                                                    title={`${day.date}\n${day.count} services\n₹${day.revenue.toFixed(0)}`}
                                                >
                                                    <div
                                                        className="bg-zinc-800 hover:bg-zinc-500 rounded-sm w-full transition-colors"
                                                        style={{ height: `${height}%`, minHeight: '4px' }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-zinc-600 mt-3 font-mono">
                                        <span>{stats.dailyBreakdown[0]?.date}</span>
                                        <span>Today</span>
                                    </div>
                                </>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">No activity data</div>
                            )}
                        </div>
                    </div>

                    {/* Network Map */}
                    <div className="bg-black border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col h-[300px] lg:h-auto">
                        <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between z-10 bg-black">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-zinc-500" />
                                <h2 className="text-sm font-medium text-zinc-300">Location Distribution</h2>
                            </div>
                        </div>
                        <div className="flex-1 relative bg-zinc-950">
                            {mapGarages.length > 0 ? (
                                <GarageMap
                                    garages={mapGarages}
                                    userLocation={{ lat: 18.5204, lng: 73.8567 }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">No map data</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Spreadsheet-like Garage List */}
                <div className="bg-black border border-zinc-800/80 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-zinc-900 flex items-center justify-between gap-4">
                        <h2 className="text-sm font-medium text-zinc-300">Garage Directory</h2>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search directory..."
                                className="w-64 pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-zinc-950 border-b border-zinc-900 text-xs text-zinc-500">
                                <tr>
                                    <th className="px-5 py-3 font-medium">Name</th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">Location</th>
                                    <th className="px-5 py-3 font-medium text-right">Services</th>
                                    <th className="px-5 py-3 font-medium text-right">Earnings</th>
                                    <th className="px-5 py-3 font-medium">Reference</th>
                                    <th className="px-5 py-3 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/50">
                                {filteredGarages.slice(0, garageLimit).map(garage => (
                                    <tr key={garage._id} className="hover:bg-zinc-900/30 transition-colors group">
                                        <td className="px-5 py-3 text-zinc-200">
                                            <div className="flex items-center gap-2">
                                                {garage.name}
                                                {garage.rating > 0 && (
                                                    <span className="flex items-center gap-0.5 text-zinc-500 text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded">
                                                        <Star className="w-2.5 h-2.5" />
                                                        {garage.rating.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            {garage.onboardingStatus === 'completed' ? (
                                                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-xs text-zinc-500 truncate max-w-[200px]">
                                            {garage.location?.address || '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-zinc-400">
                                            {garage.serviceCount || 0}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-zinc-400">
                                            {formatCurrency(garage.totalEarnings || 0)}
                                        </td>
                                        <td className="px-5 py-3">
                                            {garage.referredBy ? (
                                                <span className="font-mono text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded">
                                                    {garage.referredBy.referralCode}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-700 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                                        </td>
                                    </tr>
                                ))}
                                {filteredGarages.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-12 text-center text-zinc-600 text-sm">
                                            No garages found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {filteredGarages.length > 10 && (
                        <div className="px-5 py-3 border-t border-zinc-900 flex items-center justify-between bg-zinc-950">
                            <p className="text-xs text-zinc-500 font-mono">
                                Showing {Math.min(garageLimit, filteredGarages.length)} of {filteredGarages.length}
                            </p>
                            <div className="flex items-center gap-2">
                                {garageLimit < filteredGarages.length && (
                                    <>
                                        <button
                                            onClick={() => setGarageLimit(prev => prev + 10)}
                                            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors flex items-center gap-1.5"
                                        >
                                            <ChevronsRight className="w-3.5 h-3.5" /> View More
                                        </button>
                                        <button
                                            onClick={() => setGarageLimit(filteredGarages.length)}
                                            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                                        >
                                            View All
                                        </button>
                                    </>
                                )}
                                {garageLimit > 10 && (
                                    <button
                                        onClick={() => setGarageLimit(10)}
                                        className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 ml-2"
                                    >
                                        <ChevronDown className="w-3.5 h-3.5 rotate-180" /> Show Less
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* GMV Minimal Strip */}
                {stats && stats.totalGMV > 0 && (
                    <div className="bg-zinc-950 border border-zinc-900 rounded-lg px-6 py-4 flex items-center justify-between">
                        <p className="text-zinc-500 text-xs font-medium tracking-wide">GROSS TRANSACTIONS VALUE</p>
                        <p className="font-mono font-medium text-zinc-300">{formatCurrency(stats.totalGMV)}</p>
                    </div>
                )}
            </main>
        </div>
    );
}
