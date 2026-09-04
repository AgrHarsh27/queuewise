# Database Schema Documentation (SQLAlchemy & PostgreSQL)

## 1. Table by Table: Columns and Types

### `users`
- `id`: `VARCHAR(36)` (UUID Primary Key)
- `name`: `VARCHAR(255)`
- `email`: `VARCHAR(255)` (Unique Index)
- `password_hash`: `VARCHAR(255)`
- `role`: `VARCHAR(50)` (Default: `'agent'`)
- `created_at`: `TIMESTAMP WITH TIME ZONE` (Default: `now()`)

### `tickets`
- `id`: `VARCHAR(36)` (UUID Primary Key)
- `subject`: `TEXT`
- `description`: `TEXT`
- `requester`: `TEXT`
- `priority`: `VARCHAR(50)` (Default: `'Normal'`)
- `category`: `TEXT`
- `status`: `VARCHAR(50)` (Default: `'New'`)
- `primary_assignee_id`: `VARCHAR(36)` (Nullable FK → `users.id`)
- `created_at`: `TIMESTAMP WITH TIME ZONE` (Default: `now()`)
- `updated_at`: `TIMESTAMP WITH TIME ZONE` (Auto-updated)
- `archived_at`: `TIMESTAMP WITH TIME ZONE` (Nullable Index)
- `closed_at`: `TIMESTAMP WITH TIME ZONE` (Nullable)
- `pending_started_at`: `TIMESTAMP WITH TIME ZONE` (Nullable)
- `pending_seconds`: `INTEGER` (Default: `0`)

### `ticket_collaborators`
- `ticket_id`: `VARCHAR(36)` (FK → `tickets.id` ON DELETE CASCADE)
- `user_id`: `VARCHAR(36)` (FK → `users.id` ON DELETE CASCADE)
- `added_at`: `TIMESTAMP WITH TIME ZONE` (Default: `now()`)
- *Composite Primary Key*: `(ticket_id, user_id)`

### `replies`
- `id`: `VARCHAR(36)` (UUID Primary Key)
- `ticket_id`: `VARCHAR(36)` (FK → `tickets.id` ON DELETE CASCADE)
- `author_id`: `VARCHAR(36)` (FK → `users.id`)
- `body`: `TEXT`
- `is_internal`: `BOOLEAN` (Default: `False`)
- `created_at`: `TIMESTAMP WITH TIME ZONE` (Default: `now()`)
- *Index*: `(ticket_id, created_at)`

### `ticket_events`
- `id`: `VARCHAR(36)` (UUID Primary Key)
- `ticket_id`: `VARCHAR(36)` (FK → `tickets.id` ON DELETE CASCADE)
- `type`: `VARCHAR(50)` ('status_change', 'reassignment', 'reply')
- `actor_id`: `VARCHAR(36)` (FK → `users.id`)
- `old_value`: `TEXT` (Nullable)
- `new_value`: `TEXT` (Nullable)
- `created_at`: `TIMESTAMP WITH TIME ZONE` (Default: `now()`)
- *Index*: `(ticket_id, created_at)`

### `sla_alerts`
- `id`: `VARCHAR(36)` (UUID Primary Key)
- `ticket_id`: `VARCHAR(36)` (FK → `tickets.id` ON DELETE CASCADE)
- `breached_at`: `TIMESTAMP WITH TIME ZONE`
- `acknowledged_at`: `TIMESTAMP WITH TIME ZONE` (Nullable)
- `acknowledged_by`: `VARCHAR(36)` (Nullable FK → `users.id`)
- *Index*: `(acknowledged_at, breached_at)`

---

## 2. Entity Relationships

- **One-to-Many Relationships**:
  - `User` → `Ticket` (`primary_assignee` relation)
  - `User` → `Reply` (`author` relation)
  - `User` → `TicketEvent` (`actor` relation)
  - `User` → `SlaAlert` (`acknowledger` relation)
  - `Ticket` → `Reply` (Chronological message list)
  - `Ticket` → `TicketEvent` (Immutable audit timeline)
  - `Ticket` → `SlaAlert` (Historical & active breach alerts)

- **Many-to-Many Relationship**:
  - `Ticket` ↔ `User` joined via `ticket_collaborators` table.

---

## 3. Database vs. Application Enforced Constraints

| Constraint | Layer | Rationale |
| :--- | :--- | :--- |
| **Email Uniqueness** | Database | Eliminates race conditions during duplicate user creation. |
| **Foreign Keys & Cascade Deletes** | Database | Ensures relational integrity when tickets or users are removed. |
| **Composite Key Uniqueness** | Database | Prevents adding duplicate collaborator records to a ticket. |
| **Lifecycle State Transitions** | Application (`app.py`) | Complex business logic (e.g. *Closed → Open* only allowed within `REOPEN_WINDOW_DAYS = 7`). |
| **Role-Based Authorization** | Application (`app.py`) | Server checks verified JWT roles (`supervisor` vs `agent`) and enforces agent restriction from reassigning tickets away. |
| **Audit Log Immutability** | Application (`app.py`) | Simply omitting HTTP PUT/PATCH/DELETE endpoints for `ticket_events` guarantees append-only integrity. |

---

## 4. Deliberate Denormalization

- **Pending Time Tracking (`pending_seconds` & `pending_started_at`)**:
  - Instead of dynamically parsing and replaying all historical `ticket_events` on every ticket list query to compute cumulative paused duration, accumulated paused time is saved directly on `tickets`.
- **Alert State Snapshotting (`sla_alerts`)**:
  - Alert records store `breached_at` and `acknowledged_at` explicitly so dashboard query performance doesn't require computing SLA elapsed time for millions of historical tickets dynamically.

---

## 5. What Would Break First at 100x Data Volume?

1. **Dashboard Group-By & Weekly Aggregate Queries**:
   - `GET /api/dashboard/resolved-per-week` scans all `ticket_events` for the past 56 days. At 100x scale (millions of events), this will cause slow sequential table scans.
   - *Fix:* Create a composite index on `(type, new_value, created_at)` or maintain a daily pre-aggregated analytics table.
2. **Text Search (`ilike` queries)**:
   - PostgreSQL `ilike` queries on `subject` and `description` do not use standard B-Tree indexes.
   - *Fix:* Implement PostgreSQL Full-Text Search (`tsvector` with GIN indexing) or offload text search to Elasticsearch/Meilisearch.
3. **In-Memory Alert Synchronization (`sync_alerts`)**:
   - `sync_alerts()` fetches active tickets in memory to calculate remaining time. At 100x scale, this will exceed memory limits.
   - *Fix:* Move SLA calculation to a background worker job (Redis / Celery / pg_cron).
