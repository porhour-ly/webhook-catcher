import express from 'express';
import {
  ProjectError,
  createProject,
  findProjectBySlug,
  getRequest,
  insertRequest,
  listProjects,
  listRequests,
  migrate,
  searchRequests,
} from './db.js';
import { attachAuthRoutes, readPassword, requireAuth } from './auth.js';
import { loginPage, notFoundPage, projectPage, projectsPage, requestPage } from './views.js';

const PORT = process.env.PORT || 3000;
const MAX_BODY = '5mb';

// Read before the server binds: refusing to boot is the only way to guarantee the
// dashboard is never briefly reachable without a password.
let PASSWORD;
try {
  PASSWORD = readPassword();
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(1);
}

const app = express();
// Render/Railway terminate TLS in front of us, so the real sender IP is in X-Forwarded-For.
app.set('trust proxy', true);

// --- Receive -----------------------------------------------------------------
// Buffer every content type identically; we store the raw bytes and only *attempt*
// a JSON parse afterwards, so a malformed JSON payload is still captured, not dropped.
const rawBody = express.raw({ type: () => true, limit: MAX_BODY });

app.all('/hooks/:slug', rawBody, (req, res) => {
  // Answer before doing anything else — the brief is explicit that senders shouldn't
  // wait on our storage, and a slow 200 invites needless retries.
  res.status(200).type('text/plain').send('OK');

  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const bodyRaw = buf.toString('utf8');

  let bodyJson = null;
  if (/\bjson\b/i.test(req.get('content-type') ?? '') && bodyRaw.trim()) {
    try {
      const parsed = JSON.parse(bodyRaw);
      // A jsonb column takes any JSON value, but a top-level scalar is almost always
      // a mis-labelled content-type rather than a payload worth indexing as JSON.
      if (parsed !== null && typeof parsed === 'object') bodyJson = parsed;
    } catch {
      // Not valid JSON despite the header — body_raw already has the truth.
    }
  }

  store(req, { bodyRaw, bodyJson }).catch((err) => {
    console.error(`[hooks] failed to store request for "${req.params.slug}":`, err);
  });
});

async function store(req, { bodyRaw, bodyJson }) {
  const project = await findProjectBySlug(req.params.slug);
  if (!project) {
    // Still a 200 to the sender — we don't want an unknown slug to look like an outage
    // on their side — but there's nowhere to file it.
    console.warn(`[hooks] dropped request for unknown project slug "${req.params.slug}"`);
    return;
  }

  await insertRequest({
    projectId: project.id,
    method: req.method,
    headers: req.headers,
    query: req.query,
    bodyRaw,
    bodyJson,
    sourceIp: req.ip,
  });

  console.log(`[hooks] stored ${req.method} for "${project.slug}" (${bodyRaw.length} bytes)`);
}

// --- Auth --------------------------------------------------------------------
// Everything from here down is gated. /hooks above is deliberately not: senders can't
// log in, and requiring them to would defeat the point of the tool.

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

app.use(express.urlencoded({ extended: false, limit: '10kb' }));
attachAuthRoutes(app, PASSWORD, { loginPage });
app.use(requireAuth(PASSWORD));

// --- View --------------------------------------------------------------------

app.get('/', (_req, res) => res.redirect('/projects'));

app.get('/projects', async (_req, res, next) => {
  try {
    res.send(projectsPage({ projects: await listProjects() }));
  } catch (err) {
    next(err);
  }
});

app.post('/projects', async (req, res, next) => {
  try {
    const project = await createProject(req.body?.name);
    res.redirect(`/projects/${encodeURIComponent(project.slug)}`);
  } catch (err) {
    if (err instanceof ProjectError) {
      // Bad input, not a server fault: re-render the list with the message inline.
      res.status(400).send(projectsPage({ projects: await listProjects(), error: err.message }));
      return;
    }
    next(err);
  }
});

app.get('/projects/:slug', async (req, res, next) => {
  try {
    const project = await findProjectBySlug(req.params.slug);
    if (!project) {
      res.status(404).send(notFoundPage(`No project with slug "${req.params.slug}".`));
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const requests = q.trim()
      ? await searchRequests(project.id, q.trim())
      : await listRequests(project.id);
    res.send(
      projectPage({
        project,
        requests,
        query: q,
        hookUrl: `${req.protocol}://${req.get('host')}/hooks/${project.slug}`,
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.get('/projects/:slug/requests/:id', async (req, res, next) => {
  try {
    const project = await findProjectBySlug(req.params.slug);
    if (!project) {
      res.status(404).send(notFoundPage(`No project with slug "${req.params.slug}".`));
      return;
    }

    // Ids are serial integers; a non-numeric param is a 404, not a DB error.
    const id = Number(req.params.id);
    const request = Number.isInteger(id) ? await getRequest(project.id, id) : null;
    if (!request) {
      res.status(404).send(notFoundPage(`No request #${req.params.id} in "${project.slug}".`));
      return;
    }

    res.send(requestPage({ project, request }));
  } catch (err) {
    next(err);
  }
});

app.use((_req, res) => res.status(404).send(notFoundPage('Unknown page.')));

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).type('text/plain').send('Internal error');
});

await migrate();
app.listen(PORT, () => {
  console.log(`Webhook Catcher listening on http://localhost:${PORT}`);
});
