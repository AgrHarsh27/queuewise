# Architecture

## 1. Moving Pieces and Communication

The Queuewise application is built as a decoupled client-server web architecture using a Python Flask backend:

1. **Frontend UI (Single Page Application)**:
   - Built with React 19, TypeScript, and Vite.
   - Communicates with the backend exclusively via RESTful HTTP JSON endpoints under `/api/*`.
   - Uses `localStorage` to persist JWT tokens and user session state across page reloads.
   - Renders reactive interface components (Queue tables, SLA Alert indicators, Dashboard charts with Recharts).

2. **Backend API Server (Python Flask)**:
   - Built with Python 3, Flask, SQLAlchemy, PyJWT, and bcrypt.
   - Enforces JWT authentication decorators (`@protected_route`), role-based access control (`@supervisor_only`), and ticket ownership/collaboration checks (`can_act`).
   - Handles complex business logic: state machine transitions (*New → Open → Pending → Resolved → Closed*), SLA clock calculations, bulk operations, and CSV string formatting.

3. **Database Layer**:
   - Managed PostgreSQL database accessed via **SQLAlchemy ORM**.
   - Enforces relational integrity, indexes, foreign keys, and transaction atomicity across database operations.

---

## 2. Where Each Piece Runs

- **Client Tier**: Runs inside the user's browser (React SPA served statically via Vite or Vercel).
- **Application Server Tier**: Runs on a Python WSGI process (`PORT=4000` via `python app.py` or Gunicorn/uWSGI in production).
- **Database Tier**: PostgreSQL daemon running locally on port `5432` or hosted on Supabase/Neon PostgreSQL.

---

## 3. End-to-End Request Path (Representative Action: Customer Reply on a Pending Ticket)

Below is the step-by-step execution path when an agent posts a customer-visible reply to a ticket currently in `Pending` status:

1. **User Action**: The agent types a message in the ticket details view, keeps "Internal note" unchecked, and clicks **Send reply**.
2. **HTTP Request**: The frontend `api.addReply(ticketId, body, false)` makes a `POST /api/tickets/:id/replies` request with `Authorization: Bearer <jwt>`.
3. **Authentication Decorator**: Flask runs `@protected_route`, decodes the JWT signature using `pyjwt` and `JWT_SECRET`, and attaches `g.user` payload (`{ id, role, name, email }`).
4. **Authorization Check**: `can_act(g.user, id)` executes a database check to confirm the user is a supervisor, primary assignee, or collaborator. Returns `403` if unauthorized.
5. **Validation**: Flask route parses `request.get_json()`. Returns `400` if validation fails.
6. **SQLAlchemy Transaction (`db.session.commit()`)**:
   a. Inserts a new row into `replies` (`is_internal=False`).
   b. Inserts an append-only row into `ticket_events` (`type='reply'`).
   c. **SLA State Machine Transition**: Detects that status is `Pending` and `is_internal` is `False`. Invokes `write_status()` inside the transaction:
      - Computes accumulated pending duration: `pending_seconds += now - pending_started_at`.
      - Clears `pending_started_at` to `None`.
      - Updates ticket status back to `Open`.
      - Writes a `status_change` event into `ticket_events`.
7. **HTTP Response**: Flask returns the newly created reply with `201 Created`. The frontend refetches the updated ticket model and updates the UI (SLA clock resumes, ticket status updates to `Open`).

---

## 4. What Was Decided *Not* to Build, and Why

1. **WebSocket / Real-Time Push Subscriptions**:
   - *Why omitted:* Polling and explicit refetching on user actions met all SLA monitoring requirements without adding the operational overhead and state management complexity of socket connections or SSE.
2. **Full Soft-Deletion Framework**:
   - *Why omitted:* Archiving (`archived_at` timestamp) satisfied all requirements for hiding inactive tickets from default views while maintaining audit trail integrity. Permanent deletion was intentionally excluded to prevent accidental history destruction.
3. **Multi-Tenant Workspace Isolation**:
   - *Why omitted:* The project scope called for a single dedicated company queue. Introducing organization tenancy models would have increased database complexity without adding value to the core 10 requirements.
