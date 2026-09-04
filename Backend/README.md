# Queuewise backend

Node.js, Express, TypeScript, PostgreSQL, Prisma, JWT, bcrypt, and Zod API for the Queuewise shared support queue.

## Prerequisites

- Node.js 18.18 or newer
- PostgreSQL 14 or newer
- A PostgreSQL database named `queuewise`

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and a long random `JWT_SECRET`.
3. URL-encode special characters in the database password. For example, `@` becomes `%40`.
4. Install dependencies and generate Prisma Client:

	```powershell
	npm install
	npm run prisma:generate
	```

5. Apply migrations and seed the database:

	```powershell
	npm run prisma:deploy
	npm run seed
	```

6. Start the API:

	```powershell
	npm run dev
	```

The API listens on `http://localhost:4000` by default. Check it with `GET /health`, which should return `{ "ok": true }`.

The seed creates supervisor `maya@queuewise.co` and agents `jordan@queuewise.co`, `sam@queuewise.co`, and `priya@queuewise.co`; all use password `password`. Change these credentials before using a shared environment. The seed is destructive: it clears existing Queuewise users, tickets, replies, events, collaborators, and alerts before inserting demo data.

## API notes

All `/api/*` routes except `POST /api/auth/login` require `Authorization: Bearer <JWT>`. Protected failures consistently return `{ "error": { "reason": "..." } }` with HTTP 403. Invalid request data returns HTTP 400 with Zod issue details. `GET /health` is public.

Status transitions are exactly `New -> Open -> Pending -> Resolved -> Closed`; a closed ticket can only reopen to `Open`, and only within `REOPEN_WINDOW_DAYS` (default 7). Status events and reply/reassignment events are append-only: there are no event update or delete routes. Agents may act only on their primary or collaborator tickets and cannot reassign away from themselves. Supervisors can see and manage the whole queue.

SLA targets are Urgent 60 minutes, High 240, Normal 480, and Low 1440. The response clock runs from creation through New/Open, pauses in Pending, and excludes `pending_seconds`. A public reply by any authenticated ticket participant while Pending is treated as a customer reply and reopens the ticket; internal replies do not. This is the selected interpretation because the data model has no separate customer identity. Alerts are generated within `SLA_NEAR_BREACH_MINUTES` (default 60) of the target or after breach. An acknowledgement followed by a later breach creates a new `sla_alerts` row, so a new breach cannot be silently suppressed.

## Relations and rules

- User to primary tickets, replies, events, and acknowledged alerts are 1:many.
- Ticket to replies, events, and SLA alerts are 1:many.
- Ticket to User collaborators is many:many through `ticket_collaborators`, whose composite primary key prevents duplicates.
- PostgreSQL/Prisma constraints enforce required fields, UUID primary keys, unique user emails, enum values, foreign keys, cascade cleanup for ticket children, and collaborator uniqueness.
- Application rules enforce JWT authentication, roles, ticket participation, transition order, the reopen window, event immutability by omission of mutation routes, SLA timing, and the primary-assignee-only acknowledgement rule.
- `pending_seconds`, `pending_started_at`, and `closed_at` are denormalized lifecycle state used to compute SLA values efficiently. `sla_alerts` stores alert snapshots/acknowledgements while elapsed and remaining time are computed on reads.

## Troubleshooting

- `P1000` means PostgreSQL rejected the username or password. Confirm the PostgreSQL server, port, role, and `DATABASE_URL` are the same ones used by pgAdmin. Encode special password characters in the URL.
- `P1001` means PostgreSQL is not reachable. Start the PostgreSQL service and confirm the host and port.
- `Database unavailable` from the API means the server started but cannot authenticate or connect to PostgreSQL.
- If the frontend shows `Internal server error`, check the backend terminal first, then verify `npm run prisma:deploy` and `npm run seed` completed successfully.

## Deployment

Use any Node-compatible free host with a managed PostgreSQL URL. Set the environment variables from `.env.example`, run `npm run prisma:deploy` as the release/migration command, and use `npm run build` followed by `npm start` as the web command. Never commit `.env` or credentials.
