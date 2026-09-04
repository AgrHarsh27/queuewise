# Queuewise Support

A standalone support ticketing frontend built with Vite, React, TypeScript, React Router, Tailwind CSS, and Recharts. It connects to the Queuewise Express API for authentication, tickets, replies, dashboard aggregates, SLA alerts, bulk actions, and CSV export.

## Run with the backend

Start the backend first from the sibling `Backend` folder:

```powershell
cd ..\Backend
npm run dev
```

Then start the frontend in a second terminal:

```powershell
cd ..\Frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

The frontend sends API requests to `http://localhost:4000/api` by default. To use another backend URL, create `Frontend/.env` with:

```env
VITE_API_URL="http://localhost:4000/api"
```

## Login

Run the backend seed script first. Demo accounts all use password `password`:

- Supervisor: `maya@queuewise.co`
- Agents: `jordan@queuewise.co`, `sam@queuewise.co`, `priya@queuewise.co`

The frontend stores the returned JWT in local storage and sends it with protected API requests. Sign out to clear the local session.

## Troubleshooting

- If the page shows `Failed to fetch`, make sure the backend is running on port `4000` and that its CORS origin includes `http://localhost:5173`.
- If login shows `Database unavailable`, fix the backend PostgreSQL connection and run `npm run seed`.
- If old mock data appears, refresh the browser after confirming `Frontend/src/api/client.ts` is using the backend URL.
