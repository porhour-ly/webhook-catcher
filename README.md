# Webhook Catcher

Internal, self-hosted alternative to webhook.site. Generates URLs, catches whatever gets
POSTed at them, and shows you what arrived.

See [webhook-catcher-build-brief.md](./webhook-catcher-build-brief.md) for the full plan.

## ⚠️ Read before using

- **Staging and dev only.** Nothing that sends real client production data should ever point
  at this. It stores full request bodies in plaintext with no per-user access control. If you
  are about to repurpose it for anything production-adjacent, re-check that assumption first.
- **Webhook URLs are secrets.** Anyone with `…/hooks/{slug}` can write into your feed, and
  anyone with the dashboard password can read it. Don't commit hook URLs to a public repo or
  paste them into wide-visibility channels.
- **Anyone with the shared password sees everything.** There are no per-user accounts and no
  record of who viewed what. Treat the password like the data behind it.

## Status: steps 1–2 of 7 complete

Core loop proven (receive → store → view) and the dashboard is behind a shared password.
One hardcoded project (`default`), a bare feed showing method, timestamp, source IP and body.

Not built yet: multi-project (3), request detail (4), search (5), 30-day retention (6),
auto-refresh polish (7).

## Running locally

```bash
npm install
cp .env.example .env      # then set DASHBOARD_PASSWORD
npm run dev
```

The server **refuses to boot without `DASHBOARD_PASSWORD`** — an unauthenticated dashboard
should not be reachable even for a moment, including by accident on a misconfigured deploy.

Then open http://localhost:3000 and send it something:

```bash
curl -X POST 'http://localhost:3000/hooks/default' \
  -H 'Content-Type: application/json' \
  -d '{"event":"document.verified","document-id":"DOC-99182"}'
```

With no `DATABASE_URL`, it runs on PGlite — Postgres compiled to WASM, stored in `.pgdata/`.
Same SQL and same JSONB behaviour as the deployed database, with nothing to install. Set
`DATABASE_URL` and it uses `pg` against real Postgres instead.

## Deploying (Render)

1. Create a Postgres instance, then a Web Service from this repo.
2. Build `npm install`, start `npm start`.
3. Set `DATABASE_URL` to the **internal** connection string and `DASHBOARD_PASSWORD` to the
   shared secret. `PORT` is provided by Render.
4. Tables and the `default` project are created on boot; no migration step to run.

Free tier sleeps when idle, so the first webhook after a quiet spell absorbs a cold start.
Fine for staging. If senders start timing out or giving up before the cold start finishes,
that's the signal to move to Railway or a paid instance.

## How it works

| Route | Does |
|---|---|
| `ANY /hooks/:slug` | **Open.** Answers `200 OK` immediately, *then* stores. Senders never wait on our database. |
| `GET /healthz` | **Open.** Liveness check for the host. |
| `GET/POST /login` | The password form. |
| `POST /logout` | Clears the session. |
| `GET /projects/:slug` | Gated. The feed, newest first. |
| `GET /` | Gated. Redirects to the default project. |

`/hooks` is deliberately outside the gate — senders can't log in, and requiring them to
would defeat the point of the tool. Everything else redirects to `/login` without a valid
session.

### The session cookie

`<issuedAt>.<HMAC-SHA256(issuedAt, password)>` — no identity, just proof someone typed the
password. Nothing is stored server-side, and rotating `DASHBOARD_PASSWORD` invalidates every
outstanding session automatically. Cookie is `httpOnly`, `sameSite=lax`, `secure` once behind
TLS, and expires after 30 days.

Ten failed logins from one IP within 15 minutes locks that IP out for the rest of the window.
The counter lives in memory, so a restart clears it — acceptable given the window is short.
Note this locks out the *correct* password too, which is the point, but it will also lock you
out of your own instance if you fat-finger it ten times.

Every content type is buffered as raw bytes and stored in `body_raw`. A JSON content-type
additionally gets parsed into the `body_json` JSONB column — but a parse failure only skips
that column, it never drops the request. Malformed payloads are exactly the ones you need to
see when debugging.

An unknown slug still gets a `200`: a typo'd URL shouldn't look like an outage to the sender.
It's logged as dropped on our side.
