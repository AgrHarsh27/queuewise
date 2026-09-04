# Queuewise Backend Guide

This document is the detailed reference for the Queuewise support ticket API.

## 1. Purpose

Queuewise is a shared support queue that replaces a group email inbox. The backend provides:

- PostgreSQL persistence through Prisma
- JWT authentication
- bcrypt password verification
- Server-side role and ticket authorization
- Ticket lifecycle and immutable audit events
- SLA clock calculations and alerts
- Replies, internal notes, and collaborators
- Queue search, filtering, pagination, bulk operations, and CSV export
- Database-backed dashboard aggregates

The API is implemented in `src/index.ts`. The data model is in `prisma/schema.prisma`, the initial migration is in `prisma/migrations/0001_init`, and demo data is in `prisma/seed.ts`.

## 2. Requirements

- Node.js 18.18 or newer
- PostgreSQL 14 or newer
- A PostgreSQL database named `queuewise`
- A valid database role with access to that database

The application reads configuration from environment variables only. Do not hard-code database credentials, JWT secrets, ports, or frontend origins.

## 3. Configuration

Create `Backend/.env` from `.env.example`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/queuewise?schema=public"
JWT_SECRET="a-long-random-secret"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
REOPEN_WINDOW_DAYS=7
SLA_NEAR_BREACH_MINUTES=60
```

`DATABASE_URL` is a standard PostgreSQL connection URL. Password characters with URL meaning must be encoded. For example, `Harsh@123` becomes `Harsh%40123`:

```env
DATABASE_URL="postgresql://postgres:Harsh%40123@localhost:5432/queuewise?schema=public"
```

Configuration values:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret used to sign and verify JWTs | Required |
| `PORT` | HTTP port | `4000` |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins | Any origin when unset |
| `REOPEN_WINDOW_DAYS` | Maximum age of a closed ticket that may reopen | `7` |
| `SLA_NEAR_BREACH_MINUTES` | Alert window before an SLA target | `60` |

## 4. Install, migrate, seed, and run

From `Backend`:

```powershell
npm install
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run dev
```

The production flow is:

```powershell
npm install
npm run prisma:deploy
npm run build
npm start
```

`npm run prisma:deploy` applies checked-in migrations. `npm run prisma:migrate -- --name <name>` is intended for local development when creating a new migration.

The seed script is intentionally a single script and is destructive. It deletes existing Queuewise records and inserts:

- Supervisor: `maya@queuewise.co`
- Agents: `jordan@queuewise.co`, `sam@queuewise.co`, `priya@queuewise.co`
- Password for all seeded users: `password`
- Tickets covering every lifecycle status and priority
- Replies, status history, collaborators, pending time, and closed tickets

Do not use the demo password in a shared or production environment.

## 5. Runtime structure

`src/index.ts` currently contains the complete API runtime:

1. Loads `.env` using `dotenv`.
2. Creates the Prisma client and Express application.
3. Configures CORS and JSON parsing.
4. Verifies JWTs for `/api/*` routes.
5. Applies role and ticket-participation checks.
6. Validates request bodies and query parameters with Zod.
7. Executes Prisma reads and transactional writes.
8. Converts Prisma/domain failures into JSON error responses.
9. Starts the HTTP listener.

The public route is `GET /health`. All other `/api/*` routes require a Bearer token except `POST /api/auth/login`.

## 6. Data model

### User

Stores support users:

- `id`: UUID primary key
- `name`: display name
- `email`: unique login email
- `password_hash`: bcrypt hash, never returned to clients
- `role`: `agent` or `supervisor`
- `created_at`: creation timestamp

### Ticket

Stores the support conversation:

- `id`: UUID primary key
- `subject`, `description`, `requester`, `category`
- `priority`: `Urgent`, `High`, `Normal`, or `Low`
- `status`: `New`, `Open`, `Pending`, `Resolved`, or `Closed`
- `primary_assignee_id`: nullable foreign key to `users`
- `created_at`, `updated_at`
- `archived_at`: nullable; archived tickets remain stored and retain history
- `closed_at`: used to enforce the reopen window
- `pending_started_at`: start of the current pending pause
- `pending_seconds`: accumulated pending duration

### TicketCollaborator

Join table for ticket/user collaboration:

- `ticket_id`
- `user_id`
- `added_at`
- Composite primary key `(ticket_id, user_id)` prevents duplicate collaborators.

### Reply

Stores chronological conversation entries:

- `id`
- `ticket_id`
- `author_id`
- `body`
- `is_internal`
- `created_at`

### TicketEvent

Append-only audit timeline:

- `id`
- `ticket_id`
- `type`: `status_change`, `reassignment`, or `reply`
- `actor_id`
- `old_value`, `new_value`
- `created_at`

There are deliberately no event update or delete endpoints.

### SlaAlert

Stores active and acknowledged SLA alerts:

- `id`
- `ticket_id`
- `breached_at`
- `acknowledged_at`
- `acknowledged_by`

## 7. Relations and integrity rules

### One-to-many relations

- One user has many primary-assigned tickets.
- One user authors many replies.
- One user creates many ticket events.
- One user acknowledges many SLA alerts.
- One ticket has many replies.
- One ticket has many ticket events.
- One ticket has many SLA alerts.

### Many-to-many relation

Tickets and users are many-to-many collaborators through `ticket_collaborators`. A user may collaborate on many tickets, and a ticket may have many collaborators.

### Database-enforced rules

PostgreSQL/Prisma enforce:

- Required scalar fields
- UUID primary keys
- Unique user email addresses
- Enum values for roles, priorities, statuses, and event types
- Foreign-key relationships
- Cascade deletion of ticket children when a ticket is deleted
- Composite uniqueness for collaborators
- Indexes used for archived queue filtering, assignees, replies, events, and alerts

### Application-enforced rules

The API enforces:

- JWT validity and expiration
- Supervisor versus agent capabilities
- Agent ticket participation
- Agent cannot reassign a ticket away from themselves
- Valid lifecycle transitions
- Closed-ticket reopen window
- Event immutability by providing no mutation routes
- SLA timing and pending-clock behavior
- Only the primary assignee may acknowledge an alert
- Request shape and field validation through Zod

### Denormalized fields

`pending_started_at`, `pending_seconds`, and `closed_at` are lifecycle state stored on the ticket to calculate SLA values without replaying all events for every read. `sla_alerts` stores alert and acknowledgement state; elapsed and remaining SLA time are computed from ticket data on reads.

## 8. Authentication and authorization

### Login

`POST /api/auth/login` accepts:

```json
{
  "email": "maya@queuewise.co",
  "password": "password"
}
```

A successful response contains:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "<uuid>",
    "name": "Maya Chen",
    "email": "maya@queuewise.co",
    "role": "supervisor"
  }
}
```

The token contains the user id, name, email, and role and expires after eight hours. The server does not trust a role supplied in a request body; it uses the verified token and database checks.

Send the token on protected calls:

```http
Authorization: Bearer <jwt>
```

### Supervisor permissions

Supervisors may see the entire queue, edit tickets, reassign any ticket, close eligible tickets, manage collaborators, reply, acknowledge only alerts assigned to them, and view dashboard/alert data.

### Agent permissions

Agents may act only when they are the ticket primary assignee or a collaborator. They may reply, update, change status, and manage collaborators for tickets they participate in. Agents cannot reassign a ticket away from themselves. The server returns `403` with an explicit reason when a policy rejects the request.

## 9. Error responses

Invalid request data returns HTTP `400`:

```json
{
  "error": {
    "reason": "Invalid request input.",
    "details": []
  }
}
```

Authentication and authorization failures return HTTP `403`:

```json
{
  "error": {
    "reason": "You may only view tickets assigned to you or shared with you."
  }
}
```

Missing records return `404`. Invalid credentials return `401`. Database connectivity or authentication failures return `503` with a database-specific reason. Unexpected failures return `500`.

## 10. Endpoint reference

### Health and authentication

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Public liveness check |
| `POST` | `/api/auth/login` | Verify credentials and issue JWT |
| `GET` | `/api/users` | List users for assignment controls |

### Tickets

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/tickets` | Filtered, sorted, paginated queue |
| `GET` | `/api/tickets/mine` | Tickets assigned to or shared with current user |
| `GET` | `/api/tickets/:id` | Ticket with replies, events, collaborators, and computed SLA |
| `POST` | `/api/tickets` | Create ticket |
| `PATCH` | `/api/tickets/:id` | Edit ticket fields |
| `POST` | `/api/tickets/:id/status` | Validate and perform one lifecycle transition |
| `POST` | `/api/tickets/:id/archive` | Archive while preserving history |
| `POST` | `/api/tickets/:id/restore` | Restore from archive |
| `POST` | `/api/tickets/:id/reassign` | Supervisor reassignment |

`GET /api/tickets` supports:

- `q`: subject and description search
- `status`
- `priority`
- `category`
- `assignee`
- `sort`: `created_at`, `priority`, or `updated_at`
- `direction`: `asc` or `desc`
- `page`
- `pageSize` from 1 through 100
- `includeArchived`, default `false`

The response is:

```json
{
  "results": [],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

Each ticket includes `sla.targetSeconds`, `sla.elapsedSeconds`, `sla.remainingSeconds`, `sla.breached`, and `sla.pendingSeconds`. Clients should display these values and should not independently calculate the response clock.

### Lifecycle

Only these transitions are valid:

```text
New -> Open
Open -> Pending or Resolved
Pending -> Open or Resolved
Resolved -> Closed or Open
Closed -> Open
```

A closed ticket can reopen only to `Open`, and only when `closed_at` is within `REOPEN_WINDOW_DAYS`. Every successful status change and every reply/reassignment writes an event in the same transaction as the business write.

The response clock runs during `New` and `Open`. It pauses in `Pending`. When leaving pending, the elapsed pending interval is added to `pending_seconds`. A public reply while pending changes the status back to `Open`; an internal reply does not. Because the schema has no customer identity, this implementation defines a public reply by an authenticated ticket participant as the customer reply signal.

### Replies and collaborators

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/tickets/:id/replies` | Chronological replies |
| `POST` | `/api/tickets/:id/replies` | Add reply or internal note as current user |
| `POST` | `/api/tickets/:id/collaborators` | Add user to ticket |
| `DELETE` | `/api/tickets/:id/collaborators/:userId` | Remove user from ticket |

Reply input:

```json
{
  "body": "We are investigating this now.",
  "is_internal": false
}
```

Every reply also creates a `reply` event. Internal notes are visible to authenticated support users through the ticket timeline; they are not customer messages.

### Bulk operations and export

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/tickets/bulk/reassign` | Independently attempt reassignment for each ticket |
| `POST` | `/api/tickets/bulk/close` | Independently attempt close for each ticket |
| `GET` | `/api/tickets/export` | CSV for the full filtered set |

Bulk results never fail the entire batch because of one ineligible ticket:

```json
[
  { "ticketId": "<uuid>", "success": true },
  { "ticketId": "<uuid>", "success": false, "reason": "Only Resolved tickets can be closed." }
]
```

Export accepts the same filtering and sorting query parameters as the queue, but returns all matching rows rather than only one page.

### Dashboard

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/dashboard/summary` | Open, pending, resolved-this-week, and breaching counts |
| `GET` | `/api/dashboard/by-status` | Database group-by status breakdown |
| `GET` | `/api/dashboard/by-agent` | Database group-by primary-assignee breakdown |
| `GET` | `/api/dashboard/resolved-per-week` | Eight weekly resolved counts |

These routes query PostgreSQL through Prisma; they do not count frontend or in-memory mock arrays.

### SLA alerts

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/alerts` | Active near-breach and breached alerts |
| `GET` | `/api/alerts/count` | Active alert count for navigation badges |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge alert as its primary assignee |

SLA target times are:

| Priority | Target |
| --- | --- |
| Urgent | 60 minutes |
| High | 240 minutes |
| Normal | 480 minutes |
| Low | 1440 minutes |

Alerts are active when the remaining time is negative or within `SLA_NEAR_BREACH_MINUTES`. An acknowledged alert is not returned as active. If the ticket is updated and later breaches again, the implementation creates a new alert row, so a previous acknowledgement cannot suppress a later breach.

## 11. Frontend connection

The frontend defaults to:

```text
http://localhost:4000/api
```

It can be overridden in `Frontend/.env`:

```env
VITE_API_URL="http://localhost:4000/api"
```

Start both applications in separate terminals:

```powershell
# Terminal 1
cd Backend
npm run dev
```

```powershell
# Terminal 2
cd Frontend
npm run dev
```

The frontend stores the JWT in local storage and attaches it to protected requests. CORS must allow the frontend origin through the backend `CORS_ORIGIN` setting.

## 12. Verification checklist

After PostgreSQL credentials are configured:

```powershell
npx prisma migrate status
npm run seed
npm run build
```

Then verify:

1. `GET /health` returns `{ "ok": true }`.
2. Demo login returns a JWT.
3. Invalid credentials return `401`.
4. Missing tokens return `403`.
5. Agent access is limited to primary/collaborator tickets.
6. Invalid status transitions return a specific reason.
7. Status changes create immutable events.
8. Pending time is excluded from SLA elapsed time.
9. Public pending replies reopen tickets.
10. Closed tickets cannot reopen after the configured window.
11. Bulk actions return one result per ticket.
12. Queue `total` remains the full filtered count.
13. Archived tickets are hidden by default.
14. Dashboard values come from database aggregates.
15. Only the primary assignee can acknowledge an alert.

## 13. Deployment

Use a Node-compatible host and managed PostgreSQL provider. Configure all variables in the host dashboard rather than committing `.env`. Use:

- Install command: `npm install`
- Migration/release command: `npm run prisma:deploy`
- Build command: `npm run build`
- Start command: `npm start`

Set `CORS_ORIGIN` to the deployed frontend URL. Use a strong unique `JWT_SECRET`, rotate demo credentials, and keep database credentials private.
