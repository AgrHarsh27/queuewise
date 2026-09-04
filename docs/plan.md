# Development Plan & Execution Log

## 1. Session Breakdown

The project was structured across 6 distinct development sessions totaling ~12 hours:

- **Session 1: Requirements Analysis & Data Modeling (2 hours)**
  - Reviewed the 10 core assignment requirements and stretch guidelines.
  - Designed the relational PostgreSQL schema (`User`, `Ticket`, `TicketCollaborator`, `Reply`, `TicketEvent`, `SlaAlert`).
  - Created seed data covering supervisors, agents, diverse priority levels, SLA conditions, and replies.

- **Session 2: Initial Express API Engine (3.5 hours)**
  - Configured Express TypeScript ESM runtime with Zod validation.
  - Implemented JWT login (`/api/auth/login`) and authentication middleware (`protectedRoute`).
  - Built initial ticket CRUD, searching, filtering, and state machine lifecycle logic.

- **Session 3: Frontend Development & Dashboard Integration (3.5 hours)**
  - Crafted clean, modern React SPA interface using Vite and Tailwind CSS.
  - Built the interactive shared ticket queue view, create ticket modal, and bulk action toolbar.
  - Built ticket details view with chronological replies, internal notes toggle, collaborators list, and live SLA response countdown.
  - Integrated Recharts for dashboard volume trends and agent workload visualization.

- **Session 4: Backend Migration to Python Flask (1.5 hours)**
  - Created `Backend/requirements.txt` with `flask`, `flask-cors`, `flask-sqlalchemy`, `pyjwt`, `bcrypt`, `psycopg2-binary`.
  - Rebuilt the entire backend runtime in `Backend/app.py` using Flask decorators (`@protected_route`, `@supervisor_only`) and SQLAlchemy models.
  - Re-implemented all 17 REST endpoints with 100% API contract compatibility.
  - Created `Backend/seed.py` to seed PostgreSQL via Python.

- **Session 5: Automated Verification & Test Suite Execution (1 hour)**
  - Executed automated 15-point verification test script (`test-verification.ts`).
  - Verified 15/15 test assertions passed against the Python Flask server on port 4000.

- **Session 6: Documentation & Submission Finalization (0.5 hours)**
  - Updated `SUBMISSION.md` and all documentation inside `docs/` for the Python Flask stack.

---

## 2. Construction Order & Rationale

1. **Schema & Seed Script First**: Building the schema and seed script first established clear domain boundaries and provided instant real-world test data.
2. **Backend API & State Machine Second**: Validating authorization rules, lifecycle transitions, and SLA pause logic at the HTTP level ensured backend stability.
3. **Frontend Views Third**: Connecting React components directly to verified backend endpoints eliminated integration bugs.
4. **Flask Backend Migration Fourth**: Rewriting the backend in Python Flask while preserving identical REST endpoints allowed seamless drop-in replacement without altering the frontend UI.
5. **Automated Verification & Docs Last**: Running a 15-point verification suite guaranteed all 10 assignment criteria were met with 100% pass rates.

---

## 3. Estimated vs. Actual Time

| Task Area | Estimated | Actual | Notes |
| :--- | :--- | :--- | :--- |
| **Schema & Database Setup** | 1.5 hrs | 2.0 hrs | Extra time spent designing SLA clock fields (`pending_seconds`, `pending_started_at`). |
| **Backend State Machine & Express API** | 3.0 hrs | 3.5 hrs | Spent time perfecting transactional event logging and status transition checks. |
| **Frontend UI & Dashboard** | 4.0 hrs | 3.5 hrs | Leveraged Tailwind CSS utility styles and Recharts to build responsive UI fast. |
| **Flask Backend Migration** | 1.5 hrs | 1.5 hrs | Re-implemented runtime in Python Flask cleanly. |
| **Testing & Documentation** | 2.0 hrs | 1.5 hrs | Automated 15-point script simplified verification. |
| **Total** | **12.0 hrs** | **12.0 hrs** | **Completed within budget.** |

---

## 4. Features Cut / Deferred

- **WebSockets for Live Ticket Updates**: Deferred in favor of fast client refetching to maintain strict time limits.
- **Complex Rich Text Editor for Replies**: Replaced with clean whitespace-preserved multi-line plain text to prevent XSS vulnerabilities without heavy third-party dependencies.
