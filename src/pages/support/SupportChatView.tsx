import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, CheckCircle, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getTicket, getTicketMessages, sendSupportMessage, resolveTicket,
    subscribeToTicketMessages, subscribeToTicket,
    type SupportTicket, type SupportMessage,
} from '../../lib/data';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';

export default function SupportChatView() {
    const { ticketId } = useParams<{ ticketId: string }>();
    const navigate = useNavigate();
    const { userData } = useAuth();
    const toast = useToast();
    const [ticket, setTicket] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [resolving, setResolving] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const addMessage = useCallback((m: SupportMessage) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    }, []);

    useEffect(() => {
        if (!ticketId) return;
        let unsubM = () => {};
        let unsubT = () => {};
        let cancelled = false;
        (async () => {
            const [t, msgs] = await Promise.all([getTicket(ticketId), getTicketMessages(ticketId)]);
            if (cancelled) return;
            setTicket(t);
            setMessages(msgs);
            setLoading(false);
            unsubM = subscribeToTicketMessages(ticketId, addMessage);
            unsubT = subscribeToTicket(ticketId, (t2) => setTicket(t2));
        })();
        return () => { cancelled = true; unsubM(); unsubT(); };
    }, [ticketId, addMessage]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const mineClaim = !!(ticket && userData?._id && ticket.claimed_by === userData._id);
    const canReply = ticket?.status !== 'resolved' && mineClaim;

    const handleSend = async () => {
        const body = input.trim();
        if (!body || !ticket || !userData?._id || sending) return;
        setSending(true);
        try {
            const m = await sendSupportMessage(ticket.id, userData._id, body, 'support');
            addMessage(m);
            setInput('');
        } catch (e) {
            toast.error(errorMessage(e, 'Failed to send'));
        } finally {
            setSending(false);
        }
    };

    const handleResolve = async () => {
        if (!ticket) return;
        setResolving(true);
        try {
            await resolveTicket(ticket.id);
            navigate('/support');
        } catch (e) {
            toast.error(errorMessage(e, 'Failed to resolve'));
        } finally {
            setResolving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
        );
    }
    if (!ticket) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-zinc-500 text-sm gap-3">
                Chat not found
                <button onClick={() => navigate('/support')} className="text-zinc-300 underline">Back to queue</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-black border-b border-zinc-900 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => navigate('/support')} className="p-2 -ml-2 text-zinc-400 hover:text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{ticket.opener_name || ticket.opener_phone || 'User'}</p>
                        <p className="text-[11px] text-zinc-500 font-mono uppercase">{ticket.opener_role} · {ticket.opener_phone || '—'}</p>
                    </div>
                </div>
                {ticket.status === 'resolved' ? (
                    <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Resolved</span>
                ) : (
                    <button
                        onClick={handleResolve}
                        disabled={resolving || !mineClaim}
                        className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                        {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Resolve
                    </button>
                )}
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 ? (
                    <p className="text-center text-zinc-600 text-sm mt-10">No messages yet.</p>
                ) : (
                    messages.map((m) => {
                        const fromSupport = m.sender_kind === 'support';
                        return (
                            <div key={m.id} className={`flex ${fromSupport ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${fromSupport
                                    ? 'bg-blue-600 text-white rounded-br-md'
                                    : 'bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-bl-md'}`}>
                                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-zinc-900 bg-black px-3 py-3">
                {ticket.status === 'resolved' ? (
                    <p className="text-center text-xs text-zinc-600 py-2">This chat is resolved.</p>
                ) : !mineClaim ? (
                    <p className="text-center text-xs text-amber-500/80 py-2">This chat is handled by another agent.</p>
                ) : (
                    <div className="flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Type a reply…"
                            rows={1}
                            className="flex-1 resize-none max-h-32 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                            disabled={!canReply}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || sending || !canReply}
                            className="w-12 h-12 shrink-0 bg-blue-600 text-white rounded-xl flex items-center justify-center disabled:opacity-40"
                        >
                            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
