// One query surface over two Postgres backends:
//   - DATABASE_URL set  -> node-postgres against a real Postgres (what we deploy on)
//   - DATABASE_URL unset -> PGlite, embedded Postgres in .pgdata/ (local dev, no install)
// Both speak the same SQL and $1 placeholders, so nothing above this file cares which is live.

import crypto from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;

// A create-project form is untrusted input, so surface the "this is your fault, not ours"
// cases (blank name, no unique slug) as a distinct type the route can show back to the user
// rather than turning into a 500.
export class ProjectError extends Error {}

// The one project step 1 uses. Multi-project + slug generation is step 3.
export const DEFAULT_PROJECT = { name: 'Default', slug: 'default' };

let query;

if (DATABASE_URL) {
  const { default: pg } = await import('pg');
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    // Render's managed Postgres requires TLS but serves a cert we can't chain-verify.
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  query = (text, params) => pool.query(text, params);
  console.log('[db] using node-postgres');
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const pglite = new PGlite('.pgdata');
  query = (text, params) => pglite.query(text, params);
  console.log('[db] using embedded PGlite (.pgdata) — set DATABASE_URL for real Postgres');
}

export { query };

// Full data model from the brief. Step 1 only reads/writes a slice of it, but there's
// no cost to creating the whole shape now.
export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS requests (
      id          SERIAL PRIMARY KEY,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      method      TEXT NOT NULL,
      headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
      query       JSONB NOT NULL DEFAULT '{}'::jsonb,
      body_raw    TEXT,
      body_json   JSONB,
      source_ip   TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // The feed is always "this project, newest first"; retention (step 6) sweeps by received_at.
  await query(`
    CREATE INDEX IF NOT EXISTS requests_project_received_idx
      ON requests (project_id, received_at DESC)
  `);

  await query(
    `INSERT INTO projects (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
    [DEFAULT_PROJECT.name, DEFAULT_PROJECT.slug],
  );
}

export async function findProjectBySlug(slug) {
  const { rows } = await query(`SELECT id, name, slug FROM projects WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

// Projects index: newest first so a just-created project lands at the top, with the request
// count and latest activity the list needs so it doesn't have to N+1 per project.
export async function listProjects() {
  const { rows } = await query(`
    SELECT p.id, p.name, p.slug, p.created_at,
           count(r.id)::int      AS request_count,
           max(r.received_at)    AS last_received_at
      FROM projects p
      LEFT JOIN requests r ON r.project_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC, p.id DESC
  `);
  return rows;
}

// Slugs live in webhook URLs, so keep them URL-safe and lowercase. This is intentionally
// lossy (accents/punctuation collapse to hyphens) — the name keeps the human-readable form.
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, ''); // slice(60) may have left a trailing hyphen
}

async function tryInsertProject(name, slug) {
  const { rows } = await query(
    `INSERT INTO projects (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id, name, slug`,
    [name, slug],
  );
  return rows[0] ?? null;
}

export async function createProject(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new ProjectError('Project name is required.');

  const base = slugify(trimmed) || 'project'; // e.g. a name that's all punctuation

  // Try the clean slug first, then base-2, base-3… so collisions read predictably.
  for (let n = 1; n <= 5; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const created = await tryInsertProject(trimmed, slug);
    if (created) return created;
  }

  // Still colliding after a handful of tries — fall back to a random suffix so a burst of
  // same-named projects can't wedge creation.
  for (let n = 0; n < 5; n++) {
    const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
    const created = await tryInsertProject(trimmed, slug);
    if (created) return created;
  }

  throw new ProjectError('Could not generate a unique URL for that name. Try a different one.');
}

export async function insertRequest(r) {
  await query(
    `INSERT INTO requests (project_id, method, headers, query, body_raw, body_json, source_ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      r.projectId,
      r.method,
      JSON.stringify(r.headers ?? {}),
      JSON.stringify(r.query ?? {}),
      r.bodyRaw,
      r.bodyJson === null ? null : JSON.stringify(r.bodyJson),
      r.sourceIp,
    ],
  );
}

// Retention (step 6): drop requests past the window. Interval is built from a bound param
// rather than interpolated, and days is coerced to an integer by the caller. Returns the
// number of rows removed — rowCount on node-postgres, affectedRows on PGlite.
export async function deleteRequestsOlderThan(days) {
  const result = await query(
    `DELETE FROM requests WHERE received_at < now() - ($1 || ' days')::interval`,
    [String(days)],
  );
  return result.rowCount ?? result.affectedRows ?? 0;
}

// Detail view (step 4). Scoped by project_id as well as id so a request can only be
// reached through the project that owns it — no cross-project id guessing.
export async function getRequest(projectId, id) {
  const { rows } = await query(
    `SELECT id, method, headers, query, body_raw, body_json, source_ip, received_at
       FROM requests
      WHERE project_id = $1 AND id = $2`,
    [projectId, id],
  );
  return rows[0] ?? null;
}

export async function listRequests(projectId, limit = 100) {
  const { rows } = await query(
    `SELECT id, method, body_raw, source_ip, received_at
       FROM requests
      WHERE project_id = $1
      ORDER BY received_at DESC, id DESC
      LIMIT $2`,
    [projectId, limit],
  );
  return rows;
}

// The term is literal text, so neutralise LIKE's own wildcards (% _ \) before wrapping it.
function bodyLike(term) {
  return `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Freeform search (step 5): match the term anywhere in the raw body or the JSONB cast to
// text — no predefined fields, per the brief. body_json::text lets a value be found even
// when a JSON payload arrived minified with no whitespace in body_raw.
export async function searchRequests(projectId, term, limit = 100) {
  const { rows } = await query(
    `SELECT id, method, body_raw, source_ip, received_at
       FROM requests
      WHERE project_id = $1
        AND (body_raw ILIKE $2 OR body_json::text ILIKE $2)
      ORDER BY received_at DESC, id DESC
      LIMIT $3`,
    [projectId, bodyLike(term), limit],
  );
  return rows;
}

// Live feed (step 7): rows newer than the cursor the client last saw, optionally filtered by
// the same search term so polling respects an active search. Newest first, like the feed.
export async function requestsSince(projectId, sinceId, term = null, limit = 100) {
  const params = [projectId, sinceId];
  let filter = '';
  if (term) {
    params.push(bodyLike(term));
    filter = `AND (body_raw ILIKE $${params.length} OR body_json::text ILIKE $${params.length})`;
  }
  params.push(limit);
  const { rows } = await query(
    `SELECT id, method, body_raw, source_ip, received_at
       FROM requests
      WHERE project_id = $1 AND id > $2 ${filter}
      ORDER BY received_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}
