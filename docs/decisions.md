# Architecture & Design Decisions

Below are key architectural and technical decisions made during the design, implementation, and Python Flask migration of Queuewise.

---

## Decision 1: Backend Framework Migration to Python Flask

- **Chose:** Rebuilding the backend using Python 3, Flask, SQLAlchemy, PyJWT, and bcrypt (`Backend/app.py`).
- **Rejected:** Continuing with Node.js/Express.
- **Why:** The project brief allows any stack choice. Migrating to Python Flask demonstrated framework flexibility while preserving 100% REST API compatibility with the React frontend and underlying PostgreSQL database schema.

---

## Decision 2: Transactional State Machine & Audit Logging in SQLAlchemy

- **Chose:** Executing status changes, pending-time clock updates, and event logging within atomic database sessions (`db.session.commit()`).
- **Rejected:** Using asynchronous event emitters or separate non-transactional database calls.
- **Why:** Requirement 9 mandates an immutable timeline where every status change and reply MUST accurately reflect historical ticket state. If a status update succeeded but a separate event write failed, the audit log would become corrupt. Wrapping both in a single database commit guarantees all-or-nothing data integrity.

---

## Decision 3: Synchronous Local Storage Token Persistence During Auth Flow

- **Chose:** Saving the returned JWT (`qw-token`) into `localStorage` immediately inside `api.login()` before making secondary API requests (such as fetching user team lists).
- **Rejected:** Deferred token persistence where `localStorage.setItem` was called only after `api.login()` promise resolved back in the React Auth Provider component.
- **Why:** When `api.login()` attempted to fetch `/api/users` right after authenticating, the API client helper read `localStorage.getItem('qw-token')`. If the token was not saved synchronously before that call, requests failed with `403 Forbidden: Authentication required`.
- **Later reversed:** Initially, token storage was handled exclusively inside `AuthProvider` state callbacks. After observing runtime 403 errors during frontend testing, this decision was reversed to persist the token to `localStorage` immediately inside the API client response handler before executing subsequent protected endpoints.

---

## Decision 4: Server-Side SLA Calculation & Pending Clock Pausing

- **Chose:** Computing SLA target time, elapsed time, remaining seconds, and breach flags on the backend server (`present_ticket` helper) and returning them pre-calculated to clients.
- **Rejected:** Offloading SLA calculation to the browser client by passing raw timestamps and priority rules.
- **Why:** Client system clocks can be wrong or out of sync. Furthermore, calculating cumulative pending paused duration (`pending_seconds`) requires precise server-side timestamp delta math. Centralizing SLA logic on the server guarantees consistent clock metrics across all users and API clients.

---

## Decision 5: Immutable Audit Event Timeline (`ticket_events`)

- **Chose:** Enforcing append-only event logging by providing zero HTTP update or delete endpoints for the `ticket_events` table.
- **Rejected:** Giving supervisors administrative permissions to edit or delete timeline logs.
- **Why:** Requirement 9 specifies a timeline showing status changes, reassignments, and replies that cannot be edited or deleted after the fact, even by supervisors. Excluding update/delete routes at the framework level guarantees history immutability.
