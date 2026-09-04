# AI Prompts & Workflow Log

This document records the master prompt workflows used during the development of Queuewise, including the original prompts for generating the frontend and backend, the transition to Python Flask, and all subsequent refinement prompts and manual corrections.

---

## 1. Master Frontend Generation Prompt

### Prompt
> "Build the frontend for a support ticketing web app — a shared queue replacing a group email inbox. React + TypeScript (Vite), React Router, Tailwind, recharts for charts. Assume a REST API at `/api/*` returning JSON (JWT auth); wire against reasonable assumed endpoints and typed mock data so it's demoable standalone, but keep API calls isolated in `src/api/*.ts` so real endpoints can be swapped in later.
> 
> Two roles: agent and supervisor. Only supervisors can reassign any ticket or close it outright; agents act only on tickets where they're primary assignee or collaborator, and can't reassign a ticket away from themselves. Hide/disable what a role can't do, but also handle 403s from the API gracefully everywhere — never assume hiding a button is enough.
> 
> Pages:
> 1. **Login** — email/password, store JWT + user (id, name, role) in context.
> 2. **Dashboard (landing page)** — stat cards (open, pending-on-customer, resolved this week, breaching SLA), breakdown by status and by agent, and a chart of tickets resolved/week for the last 8 weeks.
> 3. **Queue** — server-side paginated ticket table (subject, requester, priority, category, status, assignee, last update). Text search + filters (status, priority, category, assignee) + sort (created date, priority, last update), all sent as query params, never filtered client-side. Archived tickets excluded by default with a toggle to include them. Row checkboxes drive a bulk action bar: reassign selected to an agent, or close selected — response must render a per-ticket outcome list (succeeded / refused + reason), not one pass/fail toast. "Export CSV" button exports the currently filtered set. "New ticket" form (subject, description, requester, priority, category).
> 4. **Ticket detail** — header with status, priority, assignee, collaborators; a status control that only offers valid next statuses for the current one (New→Open→Pending→Resolved→Closed, plus reopen-from-Closed within a window) and surfaces the server's rejection message verbatim if a move is refused. Assignee/collaborator editor, with reassignment disabled for agents. Reply thread (author, timestamp, internal-note vs customer-visible styling) with a composer that toggles internal/customer-visible. Read-only activity timeline interleaving status changes, reassignments, and replies — no edit/delete controls anywhere on it. An SLA indicator showing time remaining/overdue and whether the clock is currently paused.
> 5. **Alerts** — list of tickets currently breaching or near-breaching SLA, a count badge on the nav item, and an "Acknowledge" action scoped to the current user's assigned tickets.
> 
> Every action that can fail (bad transition, 403, partial bulk failure) needs a real inline error state. Loading and empty states on every list. Build routing/auth context/API client with typed mocks first, then Queue, then Ticket Detail, then Dashboard, then Alerts — in reviewable, commit-sized chunks, not one dump."

### What was produced
- A complete React 19 + Vite + TypeScript frontend with Tailwind CSS and Recharts.
- Strongly typed API module (`Frontend/src/api/client.ts`) isolating REST interactions under `/api/*`.
- Role-aware UI components with inline error banners, multi-filter queue tables, bulk selection action bars, SLA breach counters, and ticket event timelines.

### What was corrected / refined
- **API URL Fallback**: Configured `VITE_API_URL` handling to ensure live production deployments on Vercel seamlessly route requests to the live Render backend (`https://queuewise-api-vr47.onrender.com/api`).
- **Build Script Alignment**: Updated `Frontend/package.json` build command to `vite build` and untracked `node_modules` from Git to eliminate Linux permission errors on Vercel.

---

## 2. Master Backend Generation Prompt (Node/Express → Python Flask Migration)

### Original Specification Prompt
> "Build the backend API for a support ticketing app — a shared queue replacing a group email inbox. Node.js + Express, TypeScript, PostgreSQL, Prisma, JWT auth + bcrypt. Config via env vars only, single seed script, deployable to a free host.
> 
> Data model: users (id, name, email, password_hash, role: agent|supervisor), tickets (subject, description, requester, priority, category, status, primary_assignee_id, timestamps, archived_at), ticket_collaborators (many-to-many), replies (ticket_id, author_id, body, is_internal, created_at), ticket_events (append-only: ticket_id, type: status_change|reassignment|reply, actor_id, old_value, new_value, created_at) as the audit timeline, and sla_alerts (ticket_id, breached_at, acknowledged_at, acknowledged_by). Document which relations are 1:many vs many:many, what's a DB constraint vs app-level rule, and anything denormalized.
> 
> Auth & roles — enforce server-side, never trust the client:
> - POST /api/auth/login → JWT with user id + role.
> - Supervisors: reassign any ticket, close any ticket, see entire queue.
> - Agents: act only on tickets where they're primary assignee or collaborator; cannot reassign a ticket away from themselves (403 with explicit reason if attempted).
> - Every protected route returns 403 with a clear JSON reason, not a bare status code.
> 
> Tickets:
> - POST/PATCH /api/tickets — create/edit.
> - POST /api/tickets/:id/archive and /restore — archived tickets drop out of default queue views but keep full history intact.
> 
> Lifecycle (the part that gets tested hardest):
> - Enforce New→Open→Pending→Resolved→Closed only. Reopen from Closed allowed only within a fixed window after closing; reject after that, even for supervisors.
> - POST /api/tickets/:id/status validates the move and rejects invalid ones with a specific reason (not a generic error).
> - Every successful transition writes an immutable ticket_events row — no PATCH/DELETE route for events, ever, for anyone.
> - Response clock: target time derived from priority. Clock runs in New/Open, pauses while Pending (store when Pending started, exclude that span from elapsed time), and a customer reply while Pending moves the ticket back to Open and resumes the clock. Document how a 'customer reply' is distinguished from an agent reply. Expose computed elapsed/remaining time on ticket reads, don't make the client derive it.
> 
> Collaborators: add/remove endpoints; collaborators can reply/update like the primary assignee. GET /api/tickets/mine — everything where the user is primary assignee or collaborator.
> 
> Replies: POST/GET /api/tickets/:id/replies — body, is_internal flag, author = current user, chronological order, feeds the timeline.
> 
> Queue search — GET /api/tickets must support server-side: q (subject+description), filters (status, priority, category, assignee), sort (created_at|priority|updated_at + direction), page/pageSize, includeArchived (default false). Response includes total matching the full filtered count, not just the page.
> 
> Bulk actions:
> - POST /api/tickets/bulk/reassign and /bulk/close — check eligibility per ticket independently; never fail the whole batch for one bad ticket. Response: array of { ticketId, success, reason? } per ticket.
> - GET /api/tickets/export — same filters as the queue, returns CSV of the filtered set only.
> 
> Dashboard — real aggregate queries (not in-memory counting):
> - GET /api/dashboard/summary: open, pending, resolved this week, breaching counts.
> - /by-status and /by-agent breakdowns.
> - /resolved-per-week: last 8 weeks as [{ weekStart, count }].
> 
> SLA alerts:
> - Active when elapsed time exceeds target, or is within a defined near-breach window.
> - GET /api/alerts and /api/alerts/count for the nav badge.
> - POST /api/alerts/:id/acknowledge — only the ticket's assignee may acknowledge (403 otherwise).
> - A ticket reopened and re-breaching must produce a new active alert, not stay silently suppressed by an old acknowledgment.
> 
> Cross-cutting: validate all input, consistent 400 error shapes, wrap multi-table writes in transactions. Seed script: both roles, several agents, tickets across every status/priority including some already breaching and some pending, enough replies/history to populate the dashboard and timelines on first load."

### Flask Migration Prompt & Refinement
> "Migrate the backend API from Node.js/Express/Prisma to a production-grade Python 3 Flask REST backend (`Backend/app.py`) using SQLAlchemy ORM, PyJWT, bcrypt, and psycopg2 for PostgreSQL compatibility. Preserve 100% contract compatibility with the React frontend and test suite. Implement `@protected_route` and `@supervisor_only` decorators, transactional `db.session` operations for state machine transitions and audit events, auto-seeding on startup if tables are empty, and robust DATABASE_URL formatting for Render & Neon PostgreSQL hosting."

### What was produced
- Complete Python Flask application (`Backend/app.py`) matching all required routes, data structures, authorization rules, and SLA tracking math.
- Automatic database table creation (`db.create_all()`) and auto-seeding (`auto_seed_db()`) on startup when deployed with Gunicorn on Render.

### What was corrected
- **Render PostgreSQL URL Conversion**: Added runtime URL parsing in `app.py` to automatically convert Render's `postgres://` prefix to `postgresql://` and strip `?schema=` parameters.
- **PyJWT Encoding Compatibility**: Added `isinstance(token, bytes)` decoding check in `/api/auth/login` to ensure PyJWT tokens serialize cleanly to JSON string format without throwing 500 errors on Python 3.11.

---

## 3. Deployment & Cloud Hosting Configuration Prompts

### Prompt
> "Configure the Queuewise project for dual cloud deployment: React + Vite frontend on Vercel, Python Flask API on Render with Gunicorn, and a cloud PostgreSQL database on Neon.tech."

### Key Configuration Artifacts Generated
1. **`render.yaml`**: Defines the Render web service (`queuewise-api`), root directory (`Backend`), build command (`pip install -r requirements.txt`), start command (`gunicorn app:app --bind 0.0.0.0:$PORT`), and environment variable bindings.
2. **`vercel.json`**: Configures route rewrites to support single-page application routing (`/(.*) -> /index.html`).
3. **`.gitignore`**: Excludes local virtual environments, `node_modules`, build artifacts, and local environment files from Git tracking.
