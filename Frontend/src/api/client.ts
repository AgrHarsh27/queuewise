import type { Alert, BulkResult, DashboardData, Status, Ticket, TicketPage, TicketQuery, User } from './types';

const getApiUrl = () => {
    let url = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'https://queuewise-api-vr47.onrender.com/api';
    url = url.replace(/\/$/, '');
    return url.endsWith('/api') ? url : `${url}/api`;
};
const API_URL = getApiUrl();
const token = () => localStorage.getItem('qw-token');
const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.reason ?? `Request failed with status ${response.status}`);
    }
    return response.status === 204 ? undefined as T : response.json();
};
const mapTicket = (raw: any): Ticket => ({
    ...raw,
    requesterEmail: raw.requester,
    assignee: raw.primaryAssignee?.name ?? 'Unassigned',
    assigneeId: raw.primaryAssignee?.id ?? '',
    collaborators: (raw.collaborators ?? []).map((x: any) => x.name),
    updatedAt: raw.updatedAt,
    createdAt: raw.createdAt,
    slaMinutes: Math.round((raw.sla?.targetSeconds ?? 0) / 60),
    slaStartedAt: raw.createdAt,
    archived: Boolean(raw.archivedAt),
    replies: (raw.replies ?? []).map((x: any) => ({ id: x.id, author: x.author?.name ?? 'Unknown', body: x.body, timestamp: x.createdAt, internal: x.isInternal })),
    activity: (raw.events ?? []).map((x: any) => ({ id: x.id, type: x.type === 'status_change' ? 'status' : x.type === 'reassignment' ? 'assignment' : 'reply', text: x.type === 'status_change' ? `${x.oldValue ?? ''} -> ${x.newValue ?? ''}` : x.type, timestamp: x.createdAt, actor: x.actor?.name ?? 'Unknown' }))
});
const queryString = (query: TicketQuery = {}) => { const params = new URLSearchParams(); Object.entries(query).forEach(([key, value]) => value !== undefined && params.set(key === 'sort' && value === 'lastUpdate' ? 'sort' : key, key === 'sort' && value === 'lastUpdate' ? 'updated_at' : String(value))); return params.toString(); };

export const api = {
    async getUsers(): Promise<User[]> { const team = await request<User[]>('/users'); users.splice(0, users.length, ...team); return team; },
    async createUser(input: { name: string; email: string; password?: string; role: 'agent' | 'supervisor' }): Promise<User> { const user = await request<User>('/users', { method: 'POST', body: JSON.stringify(input) }); await this.getUsers().catch(() => []); return user; },
    async login(email: string, password = 'password'): Promise<{ token: string; user: User }> { const result = await request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem('qw-token', result.token); localStorage.setItem('qw-user', JSON.stringify(result.user)); await this.getUsers().catch(() => []); return result; },
    async listTickets(query: TicketQuery = {}): Promise<TicketPage> { const page = await request<any>(`/tickets?${queryString(query)}`); return { ...page, results: page.results.map(mapTicket) }; },
    async getTicket(id: string): Promise<Ticket> { return mapTicket(await request(`/tickets/${id}`)); },
    async updateStatus(id: string, status: Status): Promise<Ticket> { return mapTicket(await request(`/tickets/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) })); },
    async bulkClose(ids: string[]): Promise<BulkResult[]> { const results = await request<any[]>('/tickets/bulk/close', { method: 'POST', body: JSON.stringify({ ticketIds: ids }) }); return results.map(x => ({ id: x.ticketId, subject: x.ticketId, succeeded: x.success, reason: x.reason })); },
    async bulkReassign(ids: string[], assignee: User): Promise<BulkResult[]> { const results = await request<any[]>('/tickets/bulk/reassign', { method: 'POST', body: JSON.stringify({ ticketIds: ids, assigneeId: assignee.id }) }); return results.map(x => ({ id: x.ticketId, subject: x.ticketId, succeeded: x.success, reason: x.reason })); },
    async addReply(id: string, body: string, internal: boolean): Promise<Ticket> { await request(`/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ body, is_internal: internal }) }); return this.getTicket(id); },
    async createTicket(input: Pick<Ticket, 'subject' | 'description' | 'requester' | 'priority' | 'category'>): Promise<Ticket> { return mapTicket(await request('/tickets', { method: 'POST', body: JSON.stringify(input) })); },
    async dashboard(): Promise<DashboardData> { const [summary, status, agents, resolved] = await Promise.all([request<any>('/dashboard/summary'), request<any[]>('/dashboard/by-status'), request<any[]>('/dashboard/by-agent'), request<any[]>('/dashboard/resolved-per-week')]); return { stats: { open: summary.open, pending: summary.pending, resolved: summary.resolvedThisWeek, breaching: summary.breaching }, status: status.map(x => ({ name: x.status, value: x.count })), agents: agents.map(x => ({ name: x.agent, value: x.count })), resolved: resolved.map(x => ({ week: x.weekStart, value: x.count })) }; },
    async alerts(): Promise<Alert[]> { return request('/alerts'); },
    async acknowledgeAlert(id: string) { await request(`/alerts/${id}/acknowledge`, { method: 'POST' }); },
    async exportCsv(query: TicketQuery) { const response = await fetch(`${API_URL}/tickets/export?${queryString(query)}`, { headers: { Authorization: `Bearer ${token()}` } }); if (!response.ok) throw new Error('CSV export failed.'); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'queuewise-tickets.csv'; link.click(); URL.revokeObjectURL(link.href); }
};
export const users: User[] = [];
