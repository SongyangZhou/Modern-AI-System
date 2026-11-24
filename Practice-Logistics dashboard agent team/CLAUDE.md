# Logistics Dashboard

Full-stack logistics dashboard built by a multi-agent team (see Team below).
Frontend: React + Vite. Backend: Node + Express. Storage: a JSON file.

## What "done" means

- KPI cards: total shipments, on-time rate, in-transit count, delayed count
- Shipments table: id, origin, destination, status (in transit / delivered / delayed), ETA, carrier
- Filters by status and carrier
- Bar chart: deliveries per day
- Backend API: GET /api/shipments, GET /api/stats, GET /api/carriers, POST /api/shipments, PATCH /api/shipments/:id
- Carrier performance section: per carrier, shipment count, delayed count and on-time rate, fed by GET /api/carriers; shows "No carrier data" when empty, has its own loading and error state, ignores the table filters, and refreshes after add / update
- JSON-file storage with ~20 seed shipments
- Frontend + backend run, and KPI / filter / add / update work in the browser
- Tests pass, lint clean

## API contract (decide before building)

- Shipment: { id, origin, destination, status, eta, carrier }
- Status is one of: in_transit, delivered, delayed
- GET /api/stats returns { total, onTimeRate, inTransit, delayed }
- Frontend and backend must agree on this shape before either side builds.
- Backend runs on port 3001.
- onTimeRate is a percent from 0 to 100 with one decimal, computed as (total - delayed) / total.
- id is a string like SH-1001, assigned by the server.
- eta is a YYYY-MM-DD string.
- GET /api/shipments returns a bare array of shipments.
- POST requires origin, destination, carrier and eta; status defaults to in_transit.
- PATCH accepts any of origin, destination, carrier, status, eta, but never id.
- The deliveries-per-day chart is derived from eta, there is no endpoint for it.
- GET /api/carriers takes no parameters and returns a bare array of { carrier, total, delayed, onTimeRate }, one row per carrier present in the shipments.
  - Grouping is by exact carrier string (case-sensitive; the server already trims carrier on write).
  - total is the shipment count for the carrier; delayed counts status delayed only.
  - onTimeRate uses the same rule and the same shared helper as /api/stats: a percent from 0 to 100 with one decimal, (total - delayed) / total.
  - Order is onTimeRate ascending (worst first), then carrier A-Z by code point. The client does not re-sort.
  - With no shipments it returns 200 with [].
  - It has no 400 or 404 path; an unexpected failure returns 500 with { errors: ["internal server error"] }.
  - It is computed live on every request, with no cache.
- The frontend renders every onTimeRate, including the carrier panel, with formatRate in frontend/src/lib/shipments.js, which treats the value as a strict 0-100 percent.
- Errors are returned as { errors: string[] } with status 400 (validation) or 404 (unknown id).

## Team

- L0 Main agent (this session): owns the plan, assigns work, reconciles results.
- L1 Implementer: builds frontend/backend code.
- L1 Debugging: fixes failing tests and bugs.
- L1 Code-reviewer: reviews code, checks the API contract.
- L2 Test-writer (under Implementer): writes tests for new code.
- L2 Verification (under Code-review): independently verifies claims by running checks.

## Rules

- Every level works in fresh context and returns only a short summary: what changed, files touched, how to verify, what is still open.
- No agent pastes large code blocks into its summary.
- An agent only touches files inside its assigned task.
- Run the relevant tests before handing work back.
- If the API contract needs to change, the change goes through the L0 lead first.
