// Server-rendered pages, string templates. Step 1 is deliberately bare: a feed with
// method, timestamp and raw body. Detail view is step 4, search is step 5.

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const BODY_PREVIEW_LIMIT = 2000;

function preview(bodyRaw) {
  if (!bodyRaw) return '<span class="empty">(no body)</span>';
  const truncated = bodyRaw.length > BODY_PREVIEW_LIMIT;
  const shown = truncated ? bodyRaw.slice(0, BODY_PREVIEW_LIMIT) : bodyRaw;
  return `<pre>${escapeHtml(shown)}${truncated ? '\n… truncated' : ''}</pre>`;
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 2rem 1.5rem; max-width: 60rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  .sub { opacity: .7; font-size: .875rem; margin: 0 0 1.5rem; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8125rem; }
  pre { margin: .5rem 0 0; padding: .625rem .75rem; border-radius: 6px;
        background: color-mix(in srgb, currentColor 7%, transparent);
        white-space: pre-wrap; word-break: break-word; overflow-x: auto; }
  h2 { font-size: .95rem; margin: 1.75rem 0 .25rem; opacity: .8; }
  a.req { display: block; padding: 1rem .25rem; text-decoration: none; color: inherit;
          border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  a.req:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
  details { margin-top: .5rem; }
  summary { cursor: pointer; font-size: .8125rem; opacity: .7; }
  .req { padding: 1rem 0; border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  .meta { display: flex; flex-wrap: wrap; gap: .625rem; align-items: baseline; }
  .method { font-weight: 600; font-family: ui-monospace, monospace; }
  .time, .ip { opacity: .65; font-size: .8125rem; }
  .empty { opacity: .55; font-style: italic; }
  .none { padding: 2rem 0; opacity: .65; }
  .head { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
  button { font: inherit; padding: .375rem .75rem; border-radius: 6px; cursor: pointer;
           border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
           background: transparent; color: inherit; }
  button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
  .back { margin: 0 0 .25rem; font-size: .8125rem; }
  .back a { color: inherit; opacity: .65; text-decoration: none; }
  .back a:hover { opacity: 1; text-decoration: underline; }
  .create { display: flex; gap: .5rem; margin: 0 0 1rem; }
  .create input { flex: 1; font: inherit; padding: .5rem .625rem; border-radius: 6px;
                  background: transparent; color: inherit;
                  border: 1px solid color-mix(in srgb, currentColor 30%, transparent); }
  .projects { display: flex; flex-direction: column; }
  a.project { display: flex; flex-wrap: wrap; gap: .375rem 1rem; align-items: baseline;
              padding: .875rem .25rem; text-decoration: none; color: inherit;
              border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  a.project:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
  .project-name { font-weight: 600; }
  .project-slug { opacity: .8; }
  .project-stat { margin-left: auto; opacity: .6; font-size: .8125rem; }
  .login { max-width: 20rem; margin: 4rem auto; }
  .login label { display: block; font-size: .875rem; margin-bottom: .375rem; }
  .login input { width: 100%; box-sizing: border-box; font: inherit; padding: .5rem .625rem;
                 border-radius: 6px; background: transparent; color: inherit;
                 border: 1px solid color-mix(in srgb, currentColor 30%, transparent); }
  .login button { width: 100%; margin-top: .75rem; }
  .error { color: #dc2626; font-size: .875rem; margin: .75rem 0 0; }
  @media (prefers-color-scheme: dark) { .error { color: #f87171; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function relativeTime(value) {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function projectsPage({ projects, error = null } = {}) {
  const list = projects.length
    ? projects
        .map(
          (p) => `<a class="project" href="/projects/${encodeURIComponent(p.slug)}">
  <span class="project-name">${escapeHtml(p.name)}</span>
  <code class="project-slug">/hooks/${escapeHtml(p.slug)}</code>
  <span class="project-stat">${p.request_count} request${p.request_count === 1 ? '' : 's'} · ${escapeHtml(relativeTime(p.last_received_at))}</span>
</a>`,
        )
        .join('\n')
    : `<p class="none">No projects yet. Create one to get a webhook URL.</p>`;

  return layout(
    'Projects — Webhook Catcher',
    `<div class="head">
  <h1>Projects</h1>
  <form method="post" action="/logout"><button type="submit">Log out</button></form>
</div>
<p class="sub">Each project gets its own webhook URL. Requests sent to it show up in its feed.</p>
<form class="create" method="post" action="/projects">
  <input name="name" type="text" placeholder="New project name" maxlength="120" autocomplete="off" required>
  <button type="submit">Create</button>
</form>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<div class="projects">
${list}
</div>`,
  );
}

export function projectPage({ project, requests, hookUrl }) {
  const feed = requests.length
    ? requests
        .map(
          (r) => `<a class="req" href="/projects/${encodeURIComponent(project.slug)}/requests/${r.id}">
  <div class="meta">
    <span class="method">${escapeHtml(r.method)}</span>
    <span class="time">${escapeHtml(new Date(r.received_at).toISOString())}</span>
    <span class="ip">from ${escapeHtml(r.source_ip)}</span>
  </div>
  ${preview(r.body_raw)}
</a>`,
        )
        .join('\n')
    : `<p class="none">No requests yet. Send one to the URL above.</p>`;

  return layout(
    `${project.name} — Webhook Catcher`,
    `<div class="head">
  <div>
    <p class="back"><a href="/projects">← Projects</a></p>
    <h1>${escapeHtml(project.name)}</h1>
  </div>
  <form method="post" action="/logout"><button type="submit">Log out</button></form>
</div>
<p class="sub">Send anything to <code>${escapeHtml(hookUrl)}</code> — any method, any body.</p>
${feed}`,
  );
}

// Render a flat object (headers, query string) as aligned "key: value" lines. Header values
// can be arrays (repeated headers) — join them the way they arrived on the wire.
function kvBlock(obj) {
  const entries = Object.entries(obj ?? {});
  if (!entries.length) return '<p class="empty">(none)</p>';
  const lines = entries
    .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}`)
    .join('\n');
  return `<pre>${lines}</pre>`;
}

function bodyBlock({ body_raw, body_json }) {
  if (body_json !== null && body_json !== undefined) {
    // Pretty-print the parsed JSON; keep the raw form below so nothing is hidden.
    return `<pre>${escapeHtml(JSON.stringify(body_json, null, 2))}</pre>`;
  }
  if (!body_raw) return '<p class="empty">(no body)</p>';
  return `<pre>${escapeHtml(body_raw)}</pre>`;
}

export function requestPage({ project, request }) {
  const contentType = request.headers?.['content-type'] ?? null;
  const showRawToo = request.body_json !== null && request.body_json !== undefined && request.body_raw;

  return layout(
    `${request.method} — ${project.name} — Webhook Catcher`,
    `<div class="head">
  <div>
    <p class="back"><a href="/projects/${encodeURIComponent(project.slug)}">← ${escapeHtml(project.name)}</a></p>
    <h1><span class="method">${escapeHtml(request.method)}</span> request</h1>
  </div>
  <form method="post" action="/logout"><button type="submit">Log out</button></form>
</div>
<p class="sub">
  ${escapeHtml(new Date(request.received_at).toISOString())}
  · from ${escapeHtml(request.source_ip)}
  ${contentType ? `· <code>${escapeHtml(contentType)}</code>` : ''}
</p>

<h2>Body</h2>
${bodyBlock(request)}
${showRawToo ? `<details><summary>Raw body</summary><pre>${escapeHtml(request.body_raw)}</pre></details>` : ''}

<h2>Query</h2>
${kvBlock(request.query)}

<h2>Headers</h2>
${kvBlock(request.headers)}`,
  );
}

export function notFoundPage(message) {
  return layout('Not found — Webhook Catcher', `<h1>Not found</h1><p class="sub">${escapeHtml(message)}</p>`);
}

export function loginPage({ next = '/', error = null } = {}) {
  return layout(
    'Log in — Webhook Catcher',
    `<form class="login" method="post" action="/login">
  <h1>Webhook Catcher</h1>
  <p class="sub">Shared team password.</p>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <button type="submit">Log in</button>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
</form>`,
  );
}
