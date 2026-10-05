import { supabase } from '../supabase';

// ============================================================================
// Live chat support
// ============================================================================
export type SupportTicketStatus = 'open' | 'claimed' | 'resolved';

export interface SupportTicket {
    id: string;
    opener_profile_id: string;
    opener_role: string;
    opener_name: string | null;
    opener_phone: string | null;
    subject: string | null;
    status: SupportTicketStatus;
    claimed_by: string | null;
    claimed_at: string | null;
    last_message_at: string;
    created_at: string;
}

export interface SupportMessage {
    id: string;
    ticket_id: string;
    sender_profile_id: string;
    sender_kind: 'user' | 'support';
    body: string;
    created_at: string;
}

// ---- user side (customer / garage) ----

// Get-or-create the caller's active support ticket; returns its id.
export async function openMyTicket(openerRole: 'customer' | 'garage'): Promise<string> {
    const { data, error } = await supabase.rpc('open_support_ticket', { p_opener_role: openerRole });
    if (error) throw new Error(error.message);
    return data as string;
}

export async function getTicket(ticketId: string): Promise<SupportTicket | null> {
    const { data, error } = await supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
    if (error) { console.error('getTicket error', error); return null; }
    return (data as SupportTicket) ?? null;
}

export async function getTicketMessages(ticketId: string): Promise<SupportMessage[]> {
    const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
    if (error) { console.error('getTicketMessages error', error); return []; }
    return (data ?? []) as SupportMessage[];
}

export async function sendSupportMessage(
    ticketId: string,
    senderProfileId: string,
    body: string,
    kind: 'user' | 'support',
): Promise<SupportMessage> {
    const { data, error } = await supabase
        .from('support_messages')
        .insert({
            ticket_id: ticketId,
            sender_profile_id: senderProfileId,
            sender_kind: kind,
            body: body.trim(),
        })
        .select('*')
        .single();
    if (error) throw new Error(error.message);
    return data as SupportMessage;
}

// ---- support side ----

// Unclaimed tickets awaiting an agent (oldest first).
export async function getOpenTickets(): Promise<SupportTicket[]> {
    const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('status', 'open')
        .order('last_message_at', { ascending: true });
    if (error) { console.error('getOpenTickets error', error); return []; }
    return (data ?? []) as SupportTicket[];
}

// Tickets this agent has claimed and not yet resolved (most recent activity first).
export async function getMyClaimedTickets(profileId: string): Promise<SupportTicket[]> {
    const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('claimed_by', profileId)
        .eq('status', 'claimed')
        .order('last_message_at', { ascending: false });
    if (error) { console.error('getMyClaimedTickets error', error); return []; }
    return (data ?? []) as SupportTicket[];
}

// Atomically claim an unclaimed ticket. Throws 'ticket already claimed' if another agent won.
export async function claimTicket(ticketId: string): Promise<SupportTicket> {
    const { data, error } = await supabase.rpc('claim_support_ticket', { p_ticket_id: ticketId });
    if (error) throw new Error(error.message);
    return data as SupportTicket;
}

export async function resolveTicket(ticketId: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_support_ticket', { p_ticket_id: ticketId });
    if (error) throw new Error(error.message);
}

// ---- realtime helpers (return an unsubscribe function) ----

export function subscribeToTicketMessages(ticketId: string, onInsert: (m: SupportMessage) => void): () => void {
    const channel = supabase
        .channel(`support_messages:${ticketId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` },
            (payload) => onInsert(payload.new as SupportMessage),
        )
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}

export function subscribeToTicket(ticketId: string, onUpdate: (t: SupportTicket) => void): () => void {
    const channel = supabase
        .channel(`support_ticket:${ticketId}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
            (payload) => onUpdate(payload.new as SupportTicket),
        )
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}

// Any change to the ticket queue (new ticket, claim, resolve) — refetch on fire.
export function subscribeToTicketQueue(onChange: () => void): () => void {
    const channel = supabase
        .channel('support_tickets_queue')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => onChange())
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}

