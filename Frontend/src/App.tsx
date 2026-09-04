import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Activity, Archive, ArrowLeft, Bell, Check, ChevronLeft, ChevronRight, CircleDot, Clock3, FileDown, Inbox, LayoutDashboard, LogOut, Menu, MessageSquare, Plus, Search, Send, Settings2, ShieldCheck, Ticket as TicketIcon, Users, UserPlus, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './api/client';
import type { Alert, DashboardData, Priority, Status, Ticket, TicketQuery, User } from './api/types';
import { useAuth } from './auth';

const statuses: Status[] = ['New', 'Open', 'Pending', 'Resolved', 'Closed'];
const priorities: Priority[] = ['Urgent', 'High', 'Normal', 'Low'];
const categories = ['Billing', 'Technical', 'How-to', 'Account'];

const statusTone: Record<Status, string> = {
  New: 'bg-stone-100 text-stone-700',
  Open: 'bg-blue-50 text-blue-700',
  Pending: 'bg-amber-50 text-amber-700',
  Resolved: 'bg-emerald-50 text-emerald-700',
  Closed: 'bg-slate-100 text-slate-500'
};

const priorityTone: Record<Priority, string> = {
  Urgent: 'text-red-700 bg-red-50',
  High: 'text-orange-700 bg-orange-50',
  Normal: 'text-sky-700 bg-sky-50',
  Low: 'text-slate-600 bg-slate-100'
};

const fmt = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));

function ErrorBox({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><X size={16} className="mt-0.5 shrink-0" />{message}</div>;
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [alertsCount, setAlertsCount] = useState(3);

  const nav = [
    ['/dashboard', 'Overview', LayoutDashboard],
    ['/queue', 'Queue', Inbox],
    ['/alerts', 'Alerts', Bell],
    ['/team', 'Team Members', Users]
  ] as const;

  return (
    <div className="min-h-screen bg-[#f5f7f5] text-[#17211f]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-[#e1e9e3] bg-[#fbfcfa] px-4 py-5 lg:block">
        <Link to="/dashboard" className="mb-9 flex items-center gap-2 px-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#174f3a] text-white"><TicketIcon size={17} /></span>
          <span className="display text-lg font-bold tracking-tight">queuewise</span>
        </Link>
        <p className="eyebrow px-3">Workspace</p>
        <nav className="mt-3 space-y-1">
          {nav.map(([href, label, Icon]) => (
            <Link key={href} to={href} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold ${location.pathname.startsWith(href) ? 'bg-[#e7f0ea] text-[#174f3a]' : 'text-[#6b7a72] hover:bg-[#f0f4f1]'}`}>
              <span className="flex items-center gap-3"><Icon size={17} />{label}</span>
              {label === 'Alerts' && alertsCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#db6d4e] px-1 text-[10px] text-white">{alertsCount}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4 border-t border-[#e1e9e3] pt-4">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#6b7a72]"><Settings2 size={17} />Settings</button>
          <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#6b7a72] hover:text-red-700"><LogOut size={17} />Sign out</button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="flex h-16 items-center justify-between border-b border-[#e1e9e3] bg-[#fbfcfa] px-5 sm:px-8">
          <button className="lg:hidden"><Menu size={20} /></button>
          <div className="text-sm text-[#78877f]">Tuesday, September 4, 2026</div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs capitalize text-[#78877f]">{user?.role}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dcece2] text-sm font-bold text-[#174f3a]">
              {user?.name.split(' ').map(x => x[0]).join('')}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] p-5 sm:p-8">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/alerts" element={<Alerts onCount={setAlertsCount} />} />
            <Route path="/team" element={<TeamManagement />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" />;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
      <div className="relative hidden overflow-hidden bg-[#174f3a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#d6e9dc] text-[#174f3a]"><TicketIcon size={18} /></span>
            <span className="display text-xl font-bold">queuewise</span>
          </div>
          <div className="mt-28 max-w-lg">
            <p className="eyebrow text-[#a9cfb6]">Support operations, clarified</p>
            <h1 className="display mt-4 text-5xl font-bold leading-[1.05]">Every conversation has a next step.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#c2ddd0]">A shared queue for teams who care about the details, the response time, and the person on the other side.</p>
          </div>
        </div>
        <div className="flex items-center gap-8 text-sm text-[#b5d5c1]">
          <span className="flex items-center gap-2"><ShieldCheck size={16} />SOC 2 ready</span>
          <span className="flex items-center gap-2"><Clock3 size={16} />Live SLA tracking</span>
        </div>
        <div className="absolute -right-28 bottom-24 h-64 w-64 rounded-full border-[28px] border-[#2d7056] opacity-60" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><span className="display text-xl font-bold">queuewise</span></div>
          <p className="eyebrow">Welcome back</p>
          <h2 className="display mt-2 text-3xl font-bold">Sign in to your workspace</h2>
          <p className="mt-2 text-sm text-[#78877f]">Use your workspace credentials to access the queue.</p>
          {error && <div className="mt-5"><ErrorBox message={error} /></div>}
          <form className="mt-8 space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await login(email, password); nav('/dashboard'); } catch (err) { setError(String(err).replace('Error: ', '')); } finally { setBusy(false); } }}>
            <label className="block text-sm font-semibold">Email
              <input className="field mt-2 w-full" type="email" placeholder="example@queuewise.co" value={email} onChange={e => setEmail(e.target.value)} required />
            </label>
            <label className="block text-sm font-semibold">Password
              <input className="field mt-2 w-full" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </label>
            <button disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#174f3a] px-4 py-3 text-sm font-bold text-white hover:bg-[#113d2c] disabled:opacity-60">
              {busy ? 'Signing in...' : 'Sign in'}<ArrowLeft className="rotate-180" size={16} />
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-[#88958e]">Contact your supervisor if you need a workspace account created.</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData>();

  useEffect(() => { api.dashboard().then(setData); }, []);

  if (!data) return <Loading />;

  return (
    <>
      <PageTitle eyebrow="Workspace overview" title={`Good morning, ${user?.name.split(' ')[0] ?? 'User'}`} subtitle="Here is what needs your team's attention today." action={<Link to="/queue" className="flex items-center gap-2 rounded-lg bg-[#174f3a] px-4 py-2.5 text-sm font-bold text-white"><Inbox size={16} />Open queue</Link>} />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Open tickets', data.stats.open, 'Needs attention', 'text-[#174f3a]'],
          ['Pending on customer', data.stats.pending, 'Waiting on a reply', 'text-amber-700'],
          ['Resolved this week', data.stats.resolved, 'Up 12% from last week', 'text-blue-700'],
          ['Breaching SLA', data.stats.breaching, 'Requires action now', 'text-red-700']
        ].map(([label, value, sub, color]) => (
          <div className="panel p-5" key={label as string}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#6e7d75]">{label}</p>
              <CircleDot size={17} className={color as string} />
            </div>
            <p className={`display mt-4 text-3xl font-bold ${color}`}>{value}</p>
            <p className="mt-1 text-xs text-[#8a968f]">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="panel p-6">
          <div className="flex items-center justify-between">
            <div><p className="eyebrow">Volume trend</p><h3 className="display mt-1 text-lg font-bold">Tickets resolved</h3></div>
            <span className="text-xs text-[#87948d]">Last 8 weeks</span>
          </div>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.resolved}>
                <CartesianGrid stroke="#edf1ee" vertical={false} />
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8b9891' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8b9891' }} />
                <Tooltip contentStyle={{ border: '1px solid #e0e9e3', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#2c8060" strokeWidth={3} dot={{ r: 3, fill: '#2c8060', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-6">
          <p className="eyebrow">Current queue</p>
          <h3 className="display mt-1 text-lg font-bold">By status</h3>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.status} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#596961' }} width={62} />
                <Tooltip cursor={{ fill: '#f2f6f3' }} contentStyle={{ border: '1px solid #e0e9e3', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#8cbba2" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 panel p-6">
        <p className="eyebrow">Workload</p>
        <h3 className="display mt-1 text-lg font-bold">Tickets by agent</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {data.agents.map(agent => (
            <div className="rounded-lg bg-[#f5f8f5] p-4" key={agent.name}>
              <p className="text-sm text-[#67776e]">{agent.name}</p>
              <p className="display mt-2 text-2xl font-bold text-[#174f3a]">{agent.value}</p>
              <div className="mt-3 h-1.5 rounded-full bg-[#dfeae2]">
                <div className="h-1.5 rounded-full bg-[#64a27e]" style={{ width: `${Math.min(agent.value * 6, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[#77857d]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Loading() {
  return <div className="panel grid min-h-56 place-items-center text-sm text-[#84928a]">Loading workspace data...</div>;
}

function Queue() {
  const { user } = useAuth();
  const [query, setQuery] = useState<TicketQuery>({ page: 1 });
  const [page, setPage] = useState({ results: [], total: 0, page: 1, pageSize: 4 } as any);
  const [selected, setSelected] = useState<string[]>([]);
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.getUsers().then(setTeamUsers).catch(() => []);
  }, []);

  useEffect(() => {
    setBusy(true);
    api.listTickets({ ...query, page: query.page ?? 1 }).then(setPage).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, [query]);

  const setFilter = (key: string, value: string) => setQuery(q => ({ ...q, [key]: value || undefined, page: 1 }));
  const allSelected = page.results.length > 0 && selected.length === page.results.length;

  const doBulk = async (type: 'close' | 'assign') => {
    setError('');
    setBusy(true);
    try {
      let r: any[] = [];
      if (type === 'close') {
        r = await api.bulkClose(selected);
      } else {
        const targetUser = teamUsers.find(u => u.id === selectedAssigneeId);
        if (!targetUser) throw new Error('Please select an agent/supervisor to reassign tickets to.');
        r = await api.bulkReassign(selected, targetUser);
      }
      setResults(r);
      setSelected([]);
      await api.listTickets({ ...query, page: query.page ?? 1 }).then(setPage);
    } catch (e) {
      setError(String(e).replace('Error: ', ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle eyebrow="Shared queue" title="Tickets" subtitle={`${page.total} conversations in your workspace`} action={
        <div className="flex gap-2">
          <button onClick={() => api.exportCsv(query)} className="flex items-center gap-2 rounded-lg border border-[#d5e0d8] bg-white px-3 py-2.5 text-sm font-bold text-[#496057]">
            <FileDown size={16} />Export CSV
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-[#174f3a] px-4 py-2.5 text-sm font-bold text-white">
            <Plus size={16} />New ticket
          </button>
        </div>
      } />

      <div className="mt-7 panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-[#8c9992]" />
            <input className="field w-full pl-9" placeholder="Search subject or description..." value={query.q || ''} onChange={e => setFilter('q', e.target.value)} />
          </div>
          <select className="field" value={query.status || ''} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(x => <option key={x}>{x}</option>)}
          </select>
          <select className="field" value={query.priority || ''} onChange={e => setFilter('priority', e.target.value)}>
            <option value="">All priorities</option>
            {priorities.map(x => <option key={x}>{x}</option>)}
          </select>
          <select className="field" value={query.category || ''} onChange={e => setFilter('category', e.target.value)}>
            <option value="">All categories</option>
            {categories.map(x => <option key={x}>{x}</option>)}
          </select>
          <select className="field" value={query.assignee || ''} onChange={e => setFilter('assignee', e.target.value)}>
            <option value="">All assignees</option>
            {teamUsers.map(x => <option key={x.id} value={x.id}>{x.name} ({x.role})</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ee] pt-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-[#697970]">
            <input type="checkbox" checked={query.includeArchived || false} onChange={e => setQuery(q => ({ ...q, includeArchived: e.target.checked, page: 1 }))} />
            Include archived tickets
          </label>
          <select className="field py-1.5 text-xs" value={query.sort || ''} onChange={e => setFilter('sort', e.target.value)}>
            <option value="">Sort: newest created</option>
            <option value="priority">Sort: priority</option>
            <option value="lastUpdate">Sort: last update</option>
          </select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#b9d7c4] bg-[#eaf4ed] p-3 sm:flex-row sm:items-center">
          <span className="text-sm font-bold text-[#174f3a]">{selected.length} selected</span>
          {user?.role === 'supervisor' ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className="field py-1.5 text-xs bg-white" value={selectedAssigneeId} onChange={e => setSelectedAssigneeId(e.target.value)}>
                <option value="">Select assignee to reassign...</option>
                {teamUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
              <button disabled={!selectedAssigneeId || busy} onClick={() => doBulk('assign')} className="rounded-md bg-[#2c8060] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                Reassign Selected
              </button>
              <button disabled={busy} onClick={() => doBulk('close')} className="rounded-md border border-[#bdd2c3] bg-white px-3 py-2 text-xs font-bold text-[#315c48] disabled:cursor-not-allowed disabled:opacity-50">
                Close Selected
              </button>
            </div>
          ) : (
            <span className="text-xs text-[#a15a45]">Supervisor role required for bulk actions</span>
          )}
        </div>
      )}

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}

      {results.length > 0 && (
        <div className="mt-4 panel overflow-hidden">
          <div className="border-b border-[#e6ede8] bg-[#fbfcfa] px-4 py-3 text-sm font-bold">Bulk action results</div>
          {results.map(r => (
            <div className="flex items-center justify-between border-b border-[#eef2ef] px-4 py-3 text-sm last:border-0" key={r.id}>
              <span><b>{r.id}</b> <span className="text-[#6d7c73]">{r.subject}</span></span>
              {r.succeeded ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><Check size={14} />Succeeded</span> : <span className="max-w-[45%] text-right text-xs font-semibold text-red-700">Refused: {r.reason}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="panel mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-[#fbfcfa] text-[11px] uppercase tracking-wider text-[#87948d]">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={e => setSelected(e.target.checked ? page.results.map((t: Ticket) => t.id) : [])} />
                </th>
                <th className="px-3 py-3">Ticket</th>
                <th className="px-3 py-3">Requester</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Assignee</th>
                <th className="px-3 py-3">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ee]">
              {busy ? (
                <tr><td colSpan={8}><div className="p-12 text-center text-sm text-[#84928a]">Loading tickets...</div></td></tr>
              ) : page.results.length === 0 ? (
                <tr><td colSpan={8}><div className="p-12 text-center text-sm text-[#84928a]">No tickets match these filters.</div></td></tr>
              ) : (
                page.results.map((t: Ticket) => (
                  <tr className="hover:bg-[#fbfdfb]" key={t.id}>
                    <td className="px-4 py-4">
                      <input type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(s => e.target.checked ? [...s, t.id] : s.filter(id => id !== t.id))} />
                    </td>
                    <td className="px-3 py-4">
                      <Link to={`/tickets/${t.id}`} className="font-bold text-[#174f3a] hover:underline">{t.subject}</Link>
                      <p className="mt-1 text-xs text-[#98a39d]">{t.id}</p>
                    </td>
                    <td className="px-3 py-4 text-sm">{t.requester}</td>
                    <td className="px-3 py-4"><Badge className={priorityTone[t.priority]}>{t.priority}</Badge></td>
                    <td className="px-3 py-4 text-sm text-[#5f7067]">{t.category}</td>
                    <td className="px-3 py-4"><Badge className={statusTone[t.status]}>{t.status}</Badge></td>
                    <td className="px-3 py-4 text-sm font-medium">{t.assignee}</td>
                    <td className="px-3 py-4 text-xs text-[#77857d]">{fmt(t.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#edf1ee] px-4 py-3 text-xs text-[#77857d]">
          <span>Showing {page.results.length ? ((page.page - 1) * page.pageSize) + 1 : 0}-{Math.min(page.page * page.pageSize, page.total)} of {page.total}</span>
          <div className="flex gap-1">
            <button className="rounded border p-1 disabled:opacity-30" disabled={page.page <= 1} onClick={() => setQuery(q => ({ ...q, page: (q.page || 1) - 1 }))}><ChevronLeft size={16} /></button>
            <button className="rounded border p-1 disabled:opacity-30" disabled={page.page * page.pageSize >= page.total} onClick={() => setQuery(q => ({ ...q, page: (q.page || 1) + 1 }))}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {showCreate && <CreateModal close={() => setShowCreate(false)} created={() => { setShowCreate(false); setQuery(q => ({ ...q })); }} />}
    </>
  );
}

function CreateModal({ close, created }: { close: () => void; created: () => void }) {
  const [form, setForm] = useState({ subject: '', description: '', requester: '', priority: 'Normal', category: 'Technical', primaryAssigneeId: '' });
  const [teamUsers, setTeamUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getUsers().then(setTeamUsers).catch(() => []);
  }, []);

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[#12241d80] p-4">
      <form className="panel w-full max-w-lg p-6" onSubmit={async e => { e.preventDefault(); await api.createTicket({ ...form, priority: form.priority as Priority }); created(); }}>
        <div className="flex items-center justify-between">
          <div><p className="eyebrow">New conversation</p><h2 className="display mt-1 text-xl font-bold">Create a ticket</h2></div>
          <button type="button" onClick={close}><X size={19} /></button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">Subject
            <input required className="field mt-2 w-full" placeholder="Issue summary..." value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Requester email
            <input required type="email" className="field mt-2 w-full" placeholder="customer@example.com" value={form.requester} onChange={e => setForm({ ...form, requester: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Description
            <textarea required className="field mt-2 min-h-24 w-full resize-y" placeholder="Describe the issue in detail..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">Priority
              <select className="field mt-2 w-full" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {priorities.map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Category
              <select className="field mt-2 w-full" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {categories.map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold">Primary Assignee (Optional)
            <select className="field mt-2 w-full" value={form.primaryAssigneeId} onChange={e => setForm({ ...form, primaryAssigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {teamUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-bold text-[#66766d]">Cancel</button>
          <button className="rounded-lg bg-[#174f3a] px-4 py-2 text-sm font-bold text-white">Create ticket</button>
        </div>
      </form>
    </div>
  );
}

function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket>();
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) api.getTicket(id).then(setTicket);
    api.getUsers().then(setTeamUsers).catch(() => []);
  }, [id]);

  if (!ticket) return <Loading />;

  const next = statuses[statuses.indexOf(ticket.status) + 1];
  const options = ticket.status === 'Closed' ? ['Open'] : next ? [next] : [];
  const remaining = ticket.status === 'Pending' ? null : ticket.slaMinutes - Math.round((Date.now() - Date.parse(ticket.slaStartedAt)) / 60000);

  const changeStatus = async (s: Status) => {
    setError('');
    try { setTicket(await api.updateStatus(ticket.id, s)); } catch (e) { setError(String(e).replace('Error: ', '')); }
  };

  const reassignToUser = async (targetUser: User) => {
    setError('');
    try {
      await api.bulkReassign([ticket.id], targetUser);
      setTicket(await api.getTicket(ticket.id));
    } catch (e) {
      setError(String(e).replace('Error: ', ''));
    }
  };

  return (
    <>
      <button onClick={() => nav('/queue')} className="mb-5 flex items-center gap-2 text-sm font-bold text-[#61736a]"><ArrowLeft size={16} />Back to queue</button>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#829088]">{ticket.id}</span>
            <Badge className={statusTone[ticket.status]}>{ticket.status}</Badge>
            <Badge className={priorityTone[ticket.priority]}>{ticket.priority}</Badge>
          </div>
          <h1 className="display mt-3 max-w-3xl text-3xl font-bold">{ticket.subject}</h1>
          <p className="mt-2 text-sm text-[#77857d]">Opened by {ticket.requester} · {fmt(ticket.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <select disabled={!options.length} className="field text-sm font-bold" value="" onChange={e => e.target.value && changeStatus(e.target.value as Status)}>
            <option value="">Change status</option>
            {options.map(x => <option key={x}>{x}</option>)}
          </select>
          <button className="flex items-center gap-2 rounded-lg border border-[#d5e0d8] bg-white px-3 py-2 text-sm font-bold text-[#52665b]">
            <Archive size={16} />{ticket.archived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </div>

      {error && <div className="mt-5"><ErrorBox message={error} /></div>}

      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_330px]">
        <div className="space-y-6">
          <section className="panel p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e2f0e5] text-sm font-bold text-[#286448]">
                {ticket.requester.split(' ').map(x => x[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-bold">{ticket.requester}</p>
                <p className="text-xs text-[#829088]">{ticket.requesterEmail}</p>
              </div>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-[#45564d]">{ticket.description}</p>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#e6ede8] px-6 py-4"><h2 className="display font-bold">Conversation</h2></div>
            <div className="space-y-5 p-6">
              {ticket.replies.length === 0 ? <p className="py-6 text-center text-sm text-[#89968f]">No replies yet.</p> : ticket.replies.map(r => (
                <div className={`rounded-lg border p-4 ${r.internal ? 'border-amber-200 bg-amber-50/50' : 'border-[#e3ebe5] bg-[#fbfcfa]'}`} key={r.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold">{r.author}</span>
                    <span className="text-xs text-[#8b9891]">{fmt(r.timestamp)}</span>
                  </div>
                  {r.internal && <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">Internal note</p>}
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#516159]">{r.body}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-[#e6ede8] bg-[#fbfcfa] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold text-[#6c7b73]">Reply as {user?.name}</span>
                <label className="flex items-center gap-2 text-xs font-bold text-[#6c7b73]">
                  <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />Internal note
                </label>
              </div>
              <textarea className="field min-h-24 w-full resize-y" placeholder={internal ? 'Only your team will see this note...' : 'Write a customer-visible reply...'} value={reply} onChange={e => setReply(e.target.value)} />
              <button disabled={!reply.trim() || busy} onClick={async () => { setBusy(true); setTicket(await api.addReply(ticket.id, reply, internal)); setReply(''); setBusy(false); }} className="mt-3 flex items-center gap-2 rounded-lg bg-[#174f3a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                <Send size={15} />{busy ? 'Sending...' : 'Send reply'}
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <p className="eyebrow">SLA response target</p>
            <div className="mt-3 flex items-center gap-3">
              {ticket.status === 'Pending' ? (
                <><Clock3 className="text-amber-600" size={22} /><div><p className="font-bold text-amber-700">Clock paused</p><p className="text-xs text-[#829088]">Waiting on customer</p></div></>
              ) : (
                <><Clock3 className={remaining !== null && remaining < 0 ? 'text-red-600' : 'text-[#2c8060]'} size={22} /><div><p className={`font-bold ${remaining !== null && remaining < 0 ? 'text-red-700' : 'text-[#246447]'}`}>{remaining !== null && remaining < 0 ? `${Math.abs(remaining)}m overdue` : `${remaining}m remaining`}</p><p className="text-xs text-[#829088]">First response SLA</p></div></>
              )}
            </div>
          </section>

          <section className="panel p-5">
            <p className="eyebrow">Ticket details</p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs text-[#85938b]">Assignee</p>
                <p className="mt-1 font-semibold">{ticket.assignee}</p>
                {user?.role === 'agent' && <button disabled className="mt-2 w-full rounded-md border border-[#e0e7e1] px-3 py-2 text-left text-xs text-[#9aa59f]">Reassignment locked for agents</button>}
                {user?.role === 'supervisor' && (
                  <select className="field mt-2 w-full text-xs font-semibold" value={ticket.assigneeId || ''} onChange={e => {
                    const selected = teamUsers.find(u => u.id === e.target.value);
                    if (selected) reassignToUser(selected);
                  }}>
                    <option value="" disabled>Change assignee...</option>
                    {teamUsers.map(x => <option key={x.id} value={x.id}>{x.name} ({x.role})</option>)}
                  </select>
                )}
              </div>

              <div>
                <p className="text-xs text-[#85938b]">Collaborators</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ticket.collaborators.length ? ticket.collaborators.map(x => <Badge className="bg-[#edf3ee] text-[#4d6658]" key={x}>{x}</Badge>) : <span className="text-xs text-[#9aa59f]">None added</span>}
                </div>
              </div>

              <div>
                <p className="text-xs text-[#85938b]">Category</p>
                <p className="mt-1 font-semibold">{ticket.category}</p>
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <p className="eyebrow">Activity history</p>
            <div className="mt-4 space-y-4">
              {ticket.activity.length === 0 ? <p className="text-xs text-[#89968f]">No activity recorded.</p> : ticket.activity.map(a => (
                <div className="relative pl-5" key={a.id}>
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#72a487]" />
                  <p className="text-xs font-semibold">{a.text}</p>
                  <p className="mt-1 text-[11px] text-[#8b9891]">{a.actor} · {fmt(a.timestamp)}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Alerts({ onCount }: { onCount: (n: number) => void }) {
  const { user } = useAuth();
  const [list, setList] = useState<Alert[]>();
  const [error, setError] = useState('');

  useEffect(() => {
    api.alerts().then(x => { setList(x); onCount(x.length); });
  }, [onCount]);

  if (!list) return <Loading />;

  return (
    <>
      <PageTitle eyebrow="SLA monitoring" title="Alerts" subtitle="Tickets that need a timely response." />
      <div className="mt-7 space-y-3">
        {list.length === 0 ? (
          <div className="panel grid min-h-48 place-items-center text-sm text-[#84928a]">All clear. No active SLA alerts.</div>
        ) : (
          list.map(alert => (
            <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={alert.id}>
              <div className="flex items-start gap-4">
                <div className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full ${alert.severity === 'breaching' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  <Bell size={17} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#839189]">{alert.id}</span>
                    <Badge className={alert.severity === 'breaching' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}>
                      {alert.severity === 'breaching' ? 'Breaching' : 'Near breach'}
                    </Badge>
                  </div>
                  <h3 className="mt-1 font-bold">{alert.subject}</h3>
                  <p className="mt-1 text-sm text-[#77857d]">Assigned to {alert.assignee} · {alert.minutes < 0 ? `${Math.abs(alert.minutes)} minutes overdue` : `${alert.minutes} minutes remaining`}</p>
                </div>
              </div>
              <button disabled={user?.id !== alert.assigneeId} onClick={async () => { try { await api.acknowledgeAlert(alert.id); const next = list.filter(x => x.id !== alert.id); setList(next); onCount(next.length); } catch (e) { setError(String(e)); } }} className="rounded-lg border border-[#d5e0d8] bg-white px-4 py-2 text-sm font-bold text-[#315c48] disabled:cursor-not-allowed disabled:opacity-40">
                Acknowledge
              </button>
            </div>
          ))
        )}
        {error && <ErrorBox message={error} />}
      </div>
    </>
  );
}

function TeamManagement() {
  const { user } = useAuth();
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const reloadUsers = () => {
    setLoading(true);
    api.getUsers().then(setTeamUsers).finally(() => setLoading(false));
  };

  useEffect(() => {
    reloadUsers();
  }, []);

  return (
    <>
      <PageTitle
        eyebrow="User Management"
        title="Team Members"
        subtitle="Manage agents and supervisors in your Queuewise workspace."
        action={
          user?.role === 'supervisor' ? (
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 rounded-lg bg-[#174f3a] px-4 py-2.5 text-sm font-bold text-white">
              <UserPlus size={16} />Add User / Agent
            </button>
          ) : undefined
        }
      />

      <div className="mt-7 panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-[#84928a]">Loading team members...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-[#fbfcfa] text-[11px] uppercase tracking-wider text-[#87948d]">
                <tr>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ee]">
                {teamUsers.map(u => (
                  <tr key={u.id} className="hover:bg-[#fbfdfb]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dcece2] text-sm font-bold text-[#174f3a]">
                          {u.name.split(' ').map(x => x[0]).join('')}
                        </div>
                        <div>
                          <p className="font-bold text-[#174f3a]">{u.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#5f7067]">{u.email}</td>
                    <td className="px-4 py-4">
                      <Badge className={u.role === 'supervisor' ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700'}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-xs text-[#87948d] font-mono">{u.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && <AddUserModal close={() => setShowAddModal(false)} created={() => { setShowAddModal(false); reloadUsers(); }} />}
    </>
  );
}

function AddUserModal({ close, created }: { close: () => void; created: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' as 'agent' | 'supervisor' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[#12241d80] p-4">
      <form className="panel w-full max-w-md p-6" onSubmit={async e => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
          await api.createUser(form);
          created();
        } catch (err) {
          setError(String(err).replace('Error: ', ''));
        } finally {
          setBusy(false);
        }
      }}>
        <div className="flex items-center justify-between">
          <div><p className="eyebrow">User Authentication Management</p><h2 className="display mt-1 text-xl font-bold">Add Team Member</h2></div>
          <button type="button" onClick={close}><X size={19} /></button>
        </div>

        {error && <div className="mt-4"><ErrorBox message={error} /></div>}

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">Full Name
            <input required className="field mt-2 w-full" placeholder="e.g. Alex Johnson" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Email Address
            <input required type="email" className="field mt-2 w-full" placeholder="alex@queuewise.co" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Role
            <select className="field mt-2 w-full" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">Password
            <input required type="password" className="field mt-2 w-full" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-bold text-[#66766d]">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-[#174f3a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  return user ? <Layout /> : <Routes><Route path="*" element={<Login />} /></Routes>;
}
