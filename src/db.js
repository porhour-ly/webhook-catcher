// One query surface over two Postgres backends:
//   - DATABASE_URL set  -> node-postgres against a real Postgres (what we deploy on)
//   - DATABASE_URL unset -> PGlite, embedded Postgres in .pgdata/ (local dev, no install)
// Both speak the same SQL and $1 placeholders, so nothing above this file cares which is live.

const DATABASE_URL = process.env.DATABASE_URL;

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
