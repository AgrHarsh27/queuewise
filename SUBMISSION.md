# Submission

## Links

- **GitHub repository:** `https://github.com/AgrHarsh27/queuewise`
- **Live Frontend Application:** `https://queuewise-rho.vercel.app`
- **Live Backend API:** `https://queuewise-api-vr47.onrender.com/api`

## Notes for the reviewer

- **Production Deployment:** The React frontend is deployed on **Vercel** (`https://queuewise-rho.vercel.app`) and connects to the Python Flask API hosted on **Render** (`https://queuewise-api-vr47.onrender.com/api`) with a managed **Neon PostgreSQL** database.
- **Local Development:** The local Python Flask backend runs on `http://localhost:4000/api` (`app.py`) and the React frontend runs on `http://localhost:5173`.
- Demo users and initial ticket conversations covering all priorities, statuses, SLA alert conditions, and audit history are automatically seeded into PostgreSQL on startup.
- Password for all demo accounts is **`password`**.

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| **Supervisor** | `maya@queuewise.co` | `password` |
| **Agent** | `jordan@queuewise.co` | `password` |
| **Agent** | `sam@queuewise.co` | `password` |
| **Agent** | `priya@queuewise.co` | `password` |

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Lucide Icons | Fast component rendering, strong type safety, responsive modern design, interactive data visualization for SLA charts. |
| **Backend** | Python 3, Flask, SQLAlchemy, PyJWT, bcrypt, psycopg2-binary | Clean Python WSGI REST framework, robust object-relational mapping via SQLAlchemy, stateless PyJWT auth, and secure bcrypt password verification. |
| **Database** | PostgreSQL | Relational ACID compliance, robust indexing on enum columns and foreign keys, transaction support for status transitions and immutable audit logs. |
| **Hosting** | Vercel (Frontend React app) + Render (Flask Gunicorn API) + Neon (PostgreSQL Database) | Fully deployed production serverless frontend & cloud API with automated CI/CD and managed cloud database. |

## Goal checklist

| # | Goal | Status | Notes |
|---|------|--------|-------|
| **1** | Accounts and roles | **Done** | Enforces supervisor vs agent permissions on both client and Flask backend routes (`403` returned if agents attempt unauthorized reassignments). |
| **2** | Tickets | **Done** | Full CRUD, filtering, categorization, priority setting, soft-archive and restore functionality. |
| **3** | Replies inside tickets | **Done** | Chronological reply threads with support for customer-visible vs internal notes. |
| **4** | Ticket lifecycle | **Done** | State machine (*New → Open → Pending → Resolved → Closed*). SLA response clock pauses on *Pending* and resumes on public customer reply. Reopen window enforced within 7 days. |
| **5** | Collaborators | **Done** | Supports primary assignee + multiple collaborators. `GET /api/tickets/mine` filters tickets where the user is assignee or collaborator. |
| **6** | Finding tickets | **Done** | Server-side text search over subject & description, multi-filter dropdowns, multi-column sorting, and server-side pagination. |
| **7** | Acting on many tickets at once | **Done** | Bulk reassignment and bulk close with itemized success/failure status reports. Server-side CSV queue export. |
| **8** | Dashboard | **Done** | Real-time aggregate statistics: open, pending, resolved this week, SLA breaching count, status breakdown, workload by agent, and 8-week resolution trend chart. |
| **9** | History you cannot rewrite | **Done** | Append-only `TicketEvent` audit log tracking status transitions, reassignments, and replies. No edit or delete routes exist. |
| **10** | SLA alerts | **Done** | Automated SLA tracking based on priority rules (Urgent: 60m, High: 240m, Normal: 480m, Low: 1440m). Badge counters and primary-assignee alert acknowledgement. |

## How much time did you actually spend?

- **Total Time:** ~12 hours across 6 sessions.
  - Setup & Initial Node Schema: 2 hours
  - Express Prototype: 3.5 hours
  - Frontend UI & Dashboard Integration: 3.5 hours
  - **Flask Backend Rewrite & Migration**: 1.5 hours
  - Verification & Documentation: 1.5 hours

## What would you do next, with another 12 hours?

1. **Canned Response Library**: Implement pre-written template replies for frequent technical & billing queries to decrease agent response time.
2. **Post-Resolution CSAT Ratings**: Send feedback rating links automatically upon closing a ticket and visualize CSAT metrics on the supervisor dashboard.
3. **Internal Knowledge Base**: Allow agents to attach KB articles directly into customer replies.
4. **WebSocket/SSE Live Updates**: Replace polling with real-time push notifications for SLA breach alerts and ticket assignments.

## What are you least happy with in this codebase, and why?

- `Backend/app.py` is consolidated inside a single file for speed and simplified transaction handling. Scaling this to a larger production environment would benefit from modularizing into Flask Blueprints, separate model files, and service modules.
