import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, Headphones, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    openMyTicket, getTicket, getTicketMessages, sendSupportMessage,
    subscribeToTicketMessages, subscribeToTicket,
    type SupportMessage, type SupportTicket,
} from '../lib/data';
import { useToast } from './Toast';
import { errorMessage } from '../lib/errors';

interface Props {
    openerRole: 'customer' | 'garage';
    onClose: () => void;
}

// Full-screen live chat between a customer/garage user and the support team.
export default function LiveChatPanel({ openerRole, onClose }: Props) {
    const { userData } = useAuth();
    const toast = useToast();
    const [ticket, setTicket] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [reopenKey, setReopenKey] = useState(0);
    const bottomRef = useRef<HTMLDivElement>(null);

    const addMessage = useCallback((m: SupportMessage) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    }, []);

    useEffect(() => {
        let unsubMsg = () => {};
        let unsubTicket = () => {};
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const ticketId = await openMyTicket(openerRole);
                const [t, msgs] = await Promise.all([getTicket(ticketId), getTicketMessages(ticketId)]);
                if (cancelled) return;
                setTicket(t);
                setMessages(msgs);
                unsubMsg = subscribeToTicketMessages(ticketId, addMessage);
                unsubTicket = subscribeToTicket(ticketId, (t2) => setTicket(t2));
            } catch (e) {
                console.error('open chat error', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; unsubMsg(); unsubTicket(); };
    }, [openerRole, reopenKey, addMessage]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = async () => {
        const body = input.trim();
        if (!body || !ticket || !userData?._id || sending) return;
        setSending(true);
        try {
            const msg = await sendSupportMessage(ticket.id, userData._id, body, 'user');
            addMessage(msg);
            setInput('');
        } catch (e) {
            toast.error(errorMessage(e, 'Failed to send message'));
        } finally {
            setSending(false);
        }
    };

    const status = ticket?.status;
    const banner = status === 'claimed'
        ? { icon: Headphones, text: 'Connected with support', cls: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300' }
        : status === 'resolved'
            ? { icon: CheckCircle, text: 'This chat was resolved', cls: 'bg-slate-100 dark:bg-[var(--app-surface-2)] text-slate-600 dark:text-[var(--app-muted)]' }
            : { icon: Clock, text: 'Waiting for an agent to join…', cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' };
    const BannerIcon = banner.icon;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col max-w-md mx-auto"
        >
            {/* Header */}
            <header className="bg-blue-600 text-white px-4 pt-safe pb-4">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                            <Headphones className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-black text-lg leading-tight">Live Support</h2>
                            <p className="text-blue-100 text-xs">We usually reply within a few minutes</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-xl hover:bg-white/10">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </header>

            {/* Status banner */}
            <div className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold ${banner.cls}`}>
                <BannerIcon className="w-4 h-4" />
                {banner.text}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 rounded-3xl flex items-center justify-center mb-4">
                            <Headphones className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-[var(--app-text)]">How can we help?</h3>
                        <p className="text-slate-500 dark:text-[var(--app-muted)] text-sm mt-1">Send us a message and a support agent will assist you.</p>
                    </div>
                ) : (
                    messages.map((m) => {
                        const mine = m.sender_kind === 'user';
                        return (
                            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${mine
                                    ? 'bg-blue-600 text-white rounded-br-md'
                                    : 'bg-white dark:bg-[var(--app-surface)] text-slate-800 dark:text-[var(--app-text)] border border-slate-100 dark:border-[var(--app-border)] rounded-bl-md'}`}>
                                    {!mine && <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 mb-0.5">Support</p>}
                                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-slate-200 dark:border-[var(--app-border)] bg-white dark:bg-[var(--app-surface)] px-3 py-3 pb-safe">
                {status === 'resolved' ? (
                    <button
                        onClick={() => setReopenKey((k) => k + 1)}
                        className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold"
                    >
                        Start a new chat
                    </button>
                ) : (
                    <div className="flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Type your message…"
                            rows={1}
                            className="flex-1 resize-none max-h-32 px-4 py-3 rounded-2xl border border-slate-200 dark:border-[var(--app-border)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || sending}
                            className="w-12 h-12 shrink-0 bg-blue-600 text-white rounded-2xl flex items-center justify-center disabled:opacity-40"
                        >
                            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
