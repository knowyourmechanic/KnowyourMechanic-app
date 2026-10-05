import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2, Building2, Wrench, IndianRupee, TrendingUp, Star,
    Edit2, Trash2, X
} from 'lucide-react';

import { getEmployeeDetail, updateEmployee, deleteEmployee, type EmployeeDetailData } from '../../lib/data';
import { useToast } from '../../components/Toast';

interface GaragePerf {
    _id: string;
    name: string;
    location: { address: string };
    rating: number;
    totalReviews: number;
    totalServices: number;
    totalEarnings: number;
    avgServicesPerDay: string;
}

export default function EmployeeDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [data, setData] = useState<EmployeeDetailData | null>(null);
    const [loading, setLoading] = useState(true);

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [saving, setSaving] = useState(false);

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the key changes; the loader is also reused for manual refresh
    }, [id]);

    const fetchData = async () => {
        try {
            if (!id) return;
            const fetchedData = await getEmployeeDetail(id);
            if (fetchedData) {
                setData(fetchedData);
                setEditName(fetchedData.employee.name);
                setEditEmail(fetchedData.employee.email);
                setEditPhone(fetchedData.employee.phone);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = async () => {
        if (!id) return;
        setSaving(true);
        try {
            await updateEmployee(id, { name: editName, email: editEmail, phone: editPhone });
            setShowEditModal(false);
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error('Failed to update employee');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        setDeleting(true);
        try {
            await deleteEmployee(id);
            navigate('/admin/employees');
        } catch (error) {
            console.error(error);
            toast.error('Failed to delete employee');
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 text-sm">
                Employee not found
            </div>
        );
    }

    const { employee, garages, aggregates } = data;

    const formatCurrency = (val: number) => {
        if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
        if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
        return `₹${val.toFixed(0)}`;
    };

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800">
            <main className="max-w-5xl mx-auto p-6 space-y-6 pt-10">
            {/* Header Section */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-light tracking-tight text-white">{employee.name}</h1>
                        {!employee.isActive && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                                Inactive
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
                        <p>{employee.email}</p>
                        <p>{employee.phone}</p>
                        <p className="border-l border-zinc-800 pl-4">Added {new Date(employee.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowEditModal(true)}
                        className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white rounded-lg text-xs transition-colors flex items-center gap-2"
                    >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="px-4 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 rounded-lg text-xs transition-colors flex items-center gap-2"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                </div>
            </div>

            {/* Aggregate Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Garages', value: aggregates.totalGarages, icon: Building2 },
                    { label: 'Total Services', value: aggregates.totalServices, icon: Wrench },
                    { label: 'Total Earnings', value: formatCurrency(aggregates.totalEarnings), icon: IndianRupee },
                    { label: 'Avg/Garage', value: `${aggregates.avgServicesPerGarage}`, icon: TrendingUp },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-black border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition-colors"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-zinc-500 text-xs">{stat.label}</p>
                            <stat.icon className="w-3.5 h-3.5 text-zinc-600" />
                        </div>
                        <p className="text-2xl font-light text-white">{stat.value}</p>
                    </motion.div>
                ))}
            </div>

            {/* Garage Portfolio Table */}
            <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden mt-8">
                <div className="px-5 py-4 border-b border-zinc-900">
                    <h2 className="text-sm font-medium text-white">Garage Portfolio</h2>
                    <p className="text-xs text-zinc-500 mt-1">Garages onboarded by this employee</p>
                </div>

                {garages.length === 0 ? (
                    <div className="px-5 py-16 text-center text-zinc-600 text-sm">
                        <p>No garages assigned yet</p>
                        <p className="mt-1 text-xs">Share referral code <span className="font-mono text-zinc-400 border border-zinc-800 bg-zinc-900 px-1 rounded">{employee.referralCode}</span></p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-zinc-950 border-b border-zinc-900 text-xs text-zinc-500">
                                <tr>
                                    <th className="px-5 py-3 font-medium">Garage</th>
                                    <th className="px-5 py-3 font-medium">Location</th>
                                    <th className="px-5 py-3 font-medium text-right">Services</th>
                                    <th className="px-5 py-3 font-medium text-right">Avg/Day</th>
                                    <th className="px-5 py-3 font-medium text-right">Earnings</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/50">
                                {(garages as GaragePerf[]).map((garage, i) => (
                                    <motion.tr
                                        key={garage._id}
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="hover:bg-zinc-900/30 transition-colors"
                                    >
                                        <td className="px-5 py-3 text-zinc-200">
                                            <div className="flex items-center gap-2">
                                                {garage.name}
                                                {garage.rating > 0 && (
                                                    <span className="flex items-center gap-0.5 text-zinc-500 text-[10px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                                                        <Star className="w-2.5 h-2.5" />
                                                        {garage.rating.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-xs text-zinc-500 truncate max-w-[200px]">
                                            {garage.location?.address || '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-zinc-400">
                                            {garage.totalServices}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-zinc-400">
                                            {garage.avgServicesPerDay}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-zinc-400">
                                            {formatCurrency(garage.totalEarnings)}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </main>

            {/* Edit Profile Modal */ }
    <AnimatePresence>
        {showEditModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.95, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 10 }}
                    className="bg-white border border-gray-200 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl"
                >
                    <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                        <h3 className="text-sm font-bold text-black">Edit Employee</h3>
                        <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-black transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-5 space-y-4">
                        <div>
                            <label className="text-[10px] text-gray-600 font-extrabold uppercase tracking-widest block mb-1.5">Full Name</label>
                            <input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="w-full bg-white border border-gray-300 rounded text-sm px-3 py-2 text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-600 font-extrabold uppercase tracking-widest block mb-1.5">Email</label>
                            <input
                                value={editEmail}
                                onChange={e => setEditEmail(e.target.value)}
                                type="email"
                                className="w-full bg-white border border-gray-300 rounded text-sm px-3 py-2 text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-600 font-extrabold uppercase tracking-widest block mb-1.5">Phone Component</label>
                            <input
                                value={editPhone}
                                onChange={e => setEditPhone(e.target.value)}
                                className="w-full bg-white border border-gray-300 rounded text-sm px-3 py-2 text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                        <button
                            onClick={() => setShowEditModal(false)}
                            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-black transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleEdit}
                            disabled={saving || !editName || !editEmail || !editPhone}
                            className="px-4 py-2 bg-black text-white hover:bg-gray-800 rounded text-xs font-bold disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                            Save Changes
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>

    {/* Delete Confirmation Modal */ }
    <AnimatePresence>
        {showDeleteModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.95, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 10 }}
                    className="bg-zinc-950 border border-zinc-800 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl"
                >
                    <div className="p-6">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                            <Trash2 className="w-5 h-5 text-red-500" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">Delete Employee</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Are you sure you want to permanently delete <span className="text-white font-medium">{employee.name}</span>? They will lose access to the platform immediately.
                        </p>
                    </div>

                    <div className="px-6 py-4 border-t border-zinc-900 bg-black flex justify-end gap-2">
                        <button
                            onClick={() => setShowDeleteModal(false)}
                            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                            {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                            Delete Employee
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>
        </div >
    );
}
