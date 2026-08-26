# Webhook Catcher — Build Brief

## What this is
An internal, self-hosted alternative to webhook.site: a tool that generates unique URLs, receives incoming HTTP requests (webhooks) sent to those URLs, stores them, and lets the team browse and search them. Used for debugging staging/dev callbacks (e.g. VerifyIQ) — **not** for production data.

## Who it's for
Internal team use only. No per-user accounts, no roles/permissions — just a single shared password gating the dashboard.

## Non-goals (explicitly out of scope for now)
- Production traffic / production data of any kind
- Multi-user auth, roles, or audit trails of who viewed what
- Replaying or forwarding captured requests
- Alerting/notifications on incoming requests
- Structured per-project schemas — search is freeform text search over the stored payload, not field-typed queries

## Guardrails (non-negotiable, build these in from the start)
1. **Password-gate the dashboard.** One shared secret (env var), checked before any project or request data renders. No dashboard route should be reachable unauthenticated.
2. **Treat webhook URLs as secrets.** Never commit them to a public repo or post in a public/wide-visibility channel. The app doesn't need to enforce this, but it should be called out in the README so it isn't forgotten later.
3. **Staging/dev only.** This tool is not to be pointed at by anything sending real client production data. Worth a one-line comment in the README so a future person doesn't repurpose it without re-checking that assumption.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Simple, fast to stand up, good webhook handling |
| Database | Postgres, JSONB body column | Need to search inside payloads (e.g. by document-id) — JSONB + text search covers this without a rigid schema |
| Frontend | Simple server-rendered pages or a lightweight React/Vite dashboard | Just needs to list projects, show a live-ish feed, and show request detail — no need for anything fancier |
| Hosting | Render free tier (or Railway if cold-starts become annoying) | Staging data, so occasional cold-start delay is acceptable; upgrade only if it's actually causing missed requests in practice |
| Auth | Single shared password via env var, simple session cookie | No user management needed |

## URL scheme
- Each project gets a slug: `https://<app-domain>/hooks/{project-slug}`
- Any HTTP method to that path is accepted and logged
- Respond `200 OK` **immediately** on receipt, before any processing — don't make senders wait or retry unnecessarily

## Data model

**projects**
- `id`
- `name`
- `slug` (used in the URL, unique)
- `created_at`

**requests**
- `id`
- `project_id` (FK)
- `method`
- `headers` (jsonb)
- `query` (jsonb)
- `body_raw` (text)
- `body_json` (jsonb, nullable — populated when content-type is JSON)
- `source_ip`
- `received_at`

## Search
One search box per project. Matches against the stringified body (raw text or JSONB cast to text) — this covers "find the request containing document-id X" without needing to predefine which field to search. Upgrade to field-specific filtering later only if freeform search proves too noisy in practice.

## Build order (prove the core loop before adding anything else)
1. **Core loop end-to-end:** create one hardcoded project → send it a test request (curl/Postman) → see it appear in a bare-bones list with method, timestamp, and raw body. No auth, no search, no multi-project yet — just prove receive → store → view works.
2. **Add the password gate.** Do this before anything else touches real staging data.
3. **Multi-project support:** create-project UI, generate slug, list of projects.
4. **Request detail view:** click into a request, see pretty-printed headers/body/query.
5. **Search:** freeform text search within a project's requests.
6. **Retention cleanup:** scheduled job (daily) that deletes requests older than 30 days.
7. **Polish:** auto-refresh/live feed (polling is fine — no need for websockets), basic empty states.

Resist adding search or multi-project before step 1 is proven working with a real request hitting a real deployed URL — that's the part most likely to surprise you (hosting quirks, cold starts, payload parsing edge cases).

## Decisions
- **Password:** static shared secret, no rotation needed.
- **Retention:** 30 days. Requests older than 30 days should be deleted — either a scheduled cleanup job (simplest: a cron-triggered endpoint or a daily task) or a `received_at` check on read that filters out expired rows plus a periodic delete. Add this as part of step 3 (multi-project) or step 6 (polish), not step 1 — don't let it block proving the core loop.
