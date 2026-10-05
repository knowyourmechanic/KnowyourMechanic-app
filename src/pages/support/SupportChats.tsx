import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, MessageSquare, Clock, ChevronRight, Inbox } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getOpenTickets, getMyClaimedTickets, claimTicket, subscribeToTicketQueue,
    type SupportTicket,
} from '../../lib/data';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';

function timeAgo(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function openerLabel(t: SupportTicket): string {
    return t.opener_name || t.opener_phone || 'Unknown user';
}

export default function SupportChats() {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const toast = useToast();
    const [pending, setPending] = useState<SupportTicket[]>([]);
    const [mine, setMine] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!userData?._id) return;
        const [open, claimed] = await Promise.all([getOpenTickets(), getMyClaimedTickets(userData._id)]);
        setPending(open);
        setMine(claimed);
        setLoading(false);
    }, [userData?._id]);

    useEffect(() => { load(); }, [load]);

    // Live queue: any ticket insert/claim/resolve re-fetches both lists.
    useEffect(() => {
        const unsub = subscribeToTicketQueue(() => { load(); });
        return unsub;
    }, [load]);

    const handleClaim = async (id: string) => {
        setClaiming(id);
        try {
            await claimTicket(id);
            navigate(`/support/chat/${id}`);
        } catch (e) {
            toast.error(errorMessage(e) === 'ticket already claimed'
                ? 'Another agent just claimed this chat.'
                : errorMessage(e, 'Failed to claim chat'));
            load();
        } finally {
            setClaiming(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-zinc-100">
            <main className="max-w-4xl mx-auto p-6 space-y-8 pt-10">
                {/* Pending queue */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <h1 className="text-2xl font-light tracking-tight text-white">Pending Chats</h1>
                        {pending.length > 0 && (
                            <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold">
                                {pending.length} WAITING
                            </span>
                        )}
                    </div>

                    {pending.length === 0 ? (
                        <div className="border border-dashed border-zinc-800 rounded-lg py-16 text-center text-zinc-600">
                            <Inbox className="w-8 h-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm text-zinc-400">No pending chats</p>
                            <p className="text-xs mt-1">New conversations will appear here in real time.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pending.map((t, i) => (
                                <motion.div
                                    key={t.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                            <MessageSquare className="w-5 h-5 text-amber-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{openerLabel(t)}</p>
                                            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                <span className="uppercase font-mono">{t.opener_role}</span>
                                                <span>·</span>
                                                <Clock className="w-3 h-3" /> {timeAgo(t.last_message_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleClaim(t.id)}
                                        disabled={claiming === t.id}
                                        className="px-4 py-2 bg-white text-black text-xs font-semibold rounded hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                                    >
                                        {claiming === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                        Claim
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </section>

                {/* My active chats */}
                <section>
                    <h2 className="text-sm font-medium text-white mb-4">My Active Chats</h2>
                    {mine.length === 0 ? (
                        <p className="text-xs text-zinc-600">You haven't claimed any chats yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {mine.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => navigate(`/support/chat/${t.id}`)}
                                    className="w-full bg-black border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center justify-between gap-4 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                            <MessageSquare className="w-5 h-5 text-green-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{openerLabel(t)}</p>
                                            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                <span className="uppercase font-mono">{t.opener_role}</span>
                                                <span>·</span>
                                                <Clock className="w-3 h-3" /> {timeAgo(t.last_message_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
