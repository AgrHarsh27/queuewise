# AI Prompts & Workflow Log

This document records the prompt workflows used during the development of Queuewise, including AI suggestions, generated code, and necessary manual corrections.

---

## 1. Backend Schema & State Machine Generation

### Prompt
> "Design a SQLAlchemy schema for a support ticket management system named Queuewise. Support User roles ('agent', 'supervisor'), Ticket priorities ('Urgent', 'High', 'Normal', 'Low'), Ticket status ('New', 'Open', 'Pending', 'Resolved', 'Closed'), Collaborators join table, Replies with internal notes toggle, TicketEvent audit log, and SLA alerts with acknowledgement tracking."

### What was produced
A comprehensive SQLAlchemy model file with relationships, composite keys, and cascade rules matching the PostgreSQL schema.

### What was corrected
The initial schema generated `pending_started_at` without an accumulated `pending_seconds` counter. During design review, I added `pending_seconds = db.Column(db.Integer, default=0)` to the `Ticket` model so paused SLA duration across multiple pending state intervals could be aggregated cleanly without parsing raw event logs.

---

## 2. Flask REST API Route Generation

### Prompt
> "Write a Python Flask REST API that handles authentication (JWT login), ticket CRUD with server-side filtering, sorting, pagination, ticket lifecycle state machine, SLA clock pause on Pending status, bulk reassign and bulk close with per-ticket success/failure reports, CSV export, and SLA alerts with acknowledgement."

### What was produced
A complete `app.py` Flask application with SQLAlchemy models, `@protected_route`/`@supervisor_only` decorators, `can_act` authorization checks, `write_status` transaction helper, and all REST endpoints.

### What was corrected (**Prompt output error & fix**)
- **Issue**: The generated DATABASE_URL parsing directly passed the Prisma-style URL (`postgresql://...?schema=public`) to psycopg2, which does not support the `schema` query parameter in the connection string.
- **Symptom**: `seed.py` crashed with `psycopg2.ProgrammingError: invalid dsn: invalid connection option "schema"`.
- **Correction**: Added URL sanitization logic to strip `?schema=` from the DATABASE_URL before passing it to SQLAlchemy, and configured the PostgreSQL schema via `SQLALCHEMY_ENGINE_OPTIONS` instead.

---

## 3. Server-Side Queue Filtering & Pagination

### Prompt
> "Write a Flask GET /api/tickets route that supports server-side text search on subject and description using ilike, status filter, priority filter, category filter, assignee filter, multi-column sorting (created_at, priority, updated_at), pagination (page, pageSize), and optional includeArchived parameter using SQLAlchemy."

### What was produced
A route handler using SQLAlchemy query composition, `or_`, `ilike`, `asc`/`desc` column ordering, and `.offset().limit()` pagination.

### What was corrected
The initial query used case-sensitive matching. I updated the filter to use `.ilike(f'%{q}%')` ensuring search behavior matches user expectations regardless of text casing.

---

## 4. Frontend Authentication & Local Storage Token Handling

### Prompt
> "Create a React TypeScript API client that handles authentication logging in, listing tickets, adding replies, and managing SLA alerts."

### What was produced
An API client module with `request` wrappers that attached `Authorization: Bearer <token>` headers from `localStorage`.

### What was corrected (**Prompt output error & fix**)
- **Issue**: The generated `api.login` implementation made a secondary `request('/users')` call inside `api.login` *before* the JWT token was saved to `localStorage`.
- **Symptom**: Runtime browser testing showed HTTP `403 Forbidden: Authentication required: provide a Bearer token.` on login.
- **Correction**: Updated `api.login()` in `Frontend/src/api/client.ts` to explicitly invoke `localStorage.setItem('qw-token', result.token)` synchronously right after receiving the `/auth/login` payload, ensuring subsequent API calls attached valid credentials.

---

## 5. Automated 15-Point Verification Test Suite

### Prompt
> "Generate a standalone Node/TypeScript verification test script that executes 15 distinct assertion tests against all backend requirements (health check, JWT login, 401/403 security, agent access isolation, invalid status transitions, SLA pending clock pause, public reply reopen, bulk action per-ticket results, archive filtering, and dashboard aggregates)."

### What was produced
`test-verification.ts` script utilizing native `fetch` to validate all API endpoints against the running Flask server.

### What was corrected
Added automatic demo user token retrieval (`supervisorToken`, `agentToken`, `agent2Token`) at the start of the script so each sub-test executes under isolated role permissions. **All 15 tests pass against the Python Flask backend.**
