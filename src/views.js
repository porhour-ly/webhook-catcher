// Server-rendered pages, string templates. Step 1 is deliberately bare: a feed with
// method, timestamp and raw body. Detail view is step 4, search is step 5.

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const BODY_PREVIEW_LIMIT = 2000;

// Indent a JSON string so it's readable instead of one long line. Returns the input unchanged
// if it isn't JSON — the cheap first-char check avoids a try/parse on plainly non-JSON bodies.
function prettyIfJson(text) {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text; // looked like JSON but wasn't — show it as-is
  }
}

function preview(bodyRaw) {
  if (!bodyRaw) return '<span class="empty">(no body)</span>';
  const text = prettyIfJson(bodyRaw);
  const truncated = text.length > BODY_PREVIEW_LIMIT;
  const shown = truncated ? text.slice(0, BODY_PREVIEW_LIMIT) : text;
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
  a.req pre { max-height: 20rem; overflow: auto; }
  h2 { font-size: .95rem; margin: 1.75rem 0 .25rem; opacity: .8; }
  .live { font-size: .6875rem; font-weight: 400; text-transform: uppercase; letter-spacing: .05em;
          opacity: .6; vertical-align: middle; margin-left: .375rem; }
  .dot { display: inline-block; width: .5rem; height: .5rem; border-radius: 50%;
         background: #22c55e; margin-right: .25rem; animation: pulse 2s ease-in-out infinite; }
  .dot.stale { background: #9ca3af; animation: none; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
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
  .section-head { display: flex; align-items: center; gap: .75rem; }
  .copy { font: inherit; font-size: .75rem; line-height: 1; padding: .25rem .5rem; border-radius: 5px;
          cursor: pointer; user-select: none; color: inherit; background: transparent;
          border: 1px solid color-mix(in srgb, currentColor 30%, transparent); }
  .copy:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
  .copy.copied { border-color: #22c55e; color: #22c55e; }
  .req-copy { margin-left: auto; }
  .back { margin: 0 0 .25rem; font-size: .8125rem; }
  .back a { color: inherit; opacity: .65; text-decoration: none; }
  .back a:hover { opacity: 1; text-decoration: underline; }
  .search { display: flex; gap: .5rem; align-items: center; margin: 0 0 .5rem; }
  .search input { flex: 1; font: inherit; padding: .5rem .625rem; border-radius: 6px;
                  background: transparent; color: inherit;
                  border: 1px solid color-mix(in srgb, currentColor 30%, transparent); }
  .search .clear { font-size: .8125rem; opacity: .7; color: inherit; }
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
<script>
// Delegated so it also covers feed rows added live after load. A copy control either names its
// source with data-copy="#id" (detail page) or copies the <pre> in its own feed row.
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.copy');
  if (!btn) return;
  e.preventDefault(); // feed copies live inside the row's link — don't navigate
  var src = btn.dataset.copy
    ? document.querySelector(btn.dataset.copy)
    : (btn.closest('.req') ? btn.closest('.req').querySelector('pre') : null);
  if (!src || !navigator.clipboard) return;
  navigator.clipboard.writeText(src.innerText).then(function () {
    var label = btn.getAttribute('data-copy-label') || btn.textContent;
    btn.setAttribute('data-copy-label', label);
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(function () { btn.textContent = label; btn.classList.remove('copied'); }, 1200);
  }).catch(function () {});
});
</script>
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

// One feed row. Shared by the server-rendered feed and the JSON poll endpoint so live-inserted
// rows are byte-identical to rendered ones. data-id is the cursor the poller advances past.
export function feedItem(project, r) {
  // A span, not a button: a <button> nested in the row's <a> is invalid and some parsers
  // relocate it. role/tabindex keep it operable; the delegated handler does the copy.
  const copy = r.body_raw
    ? '<span class="copy req-copy" role="button" tabindex="0">Copy</span>'
    : '';
  return `<a class="req" data-id="${r.id}" href="/projects/${encodeURIComponent(project.slug)}/requests/${r.id}">
  <div class="meta">
    <span class="method">${escapeHtml(r.method)}</span>
    <span class="time">${escapeHtml(new Date(r.received_at).toISOString())}</span>
    <span class="ip">from ${escapeHtml(r.source_ip)}</span>
    ${copy}
  </div>
  ${preview(r.body_raw)}
</a>`;
}

export function projectPage({ project, requests, hookUrl, query = '' }) {
  const searching = query.trim().length > 0;

  const emptyMessage = searching
    ? `No requests match <strong>${escapeHtml(query)}</strong>.`
    : `No requests yet. Send one to <code>${escapeHtml(hookUrl)}</code> and it appears here — no refresh needed.`;

  const rows = requests.map((r) => feedItem(project, r)).join('\n');
  const emptyState = `<p class="none" id="feed-empty">${emptyMessage}</p>`;
  // The cursor starts at the newest id on the page; the poller asks for anything greater.
  const lastId = requests[0]?.id ?? 0;

  const search = `<form class="search" method="get" action="/projects/${encodeURIComponent(project.slug)}">
  <input name="q" type="search" placeholder="Search request bodies…" value="${escapeHtml(query)}" autocomplete="off">
  <button type="submit">Search</button>
  ${searching ? `<a class="clear" href="/projects/${encodeURIComponent(project.slug)}">Clear</a>` : ''}
</form>
${searching ? `<p class="sub">${requests.length} match${requests.length === 1 ? '' : 'es'} for <strong>${escapeHtml(query)}</strong>.</p>` : ''}`;

  const feedBlock = `<div id="feed" data-slug="${escapeHtml(project.slug)}" data-q="${escapeHtml(query)}" data-last="${lastId}">
${rows}
${requests.length ? '' : emptyState}
</div>`;

  // Client-side polling — no build step, no framework. Asks the feed endpoint for rows newer
  // than the cursor every few seconds and prepends them, pausing while the tab is hidden.
  const pollScript = `<script>
(function () {
  var feed = document.getElementById('feed');
  if (!feed) return;
  var slug = feed.dataset.slug;
  var q = feed.dataset.q || '';
  var dot = document.getElementById('live-dot');
  async function poll() {
    var url = '/projects/' + encodeURIComponent(slug) + '/feed?since=' + (feed.dataset.last || 0) +
      (q ? '&q=' + encodeURIComponent(q) : '');
    try {
      var res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) { if (dot) dot.classList.add('stale'); return; }
      if (dot) dot.classList.remove('stale');
      var data = await res.json();
      if (data.html) {
        var empty = document.getElementById('feed-empty');
        if (empty) empty.remove();
        feed.insertAdjacentHTML('afterbegin', data.html);
        feed.dataset.last = data.lastId;
      }
    } catch (e) { if (dot) dot.classList.add('stale'); }
  }
  setInterval(function () { if (!document.hidden) poll(); }, 4000);
})();
</script>`;

  return layout(
    `${project.name} — Webhook Catcher`,
    `<div class="head">
  <div>
    <p class="back"><a href="/projects">← Projects</a></p>
    <h1>${escapeHtml(project.name)} <span class="live"><span id="live-dot" class="dot"></span>live</span></h1>
  </div>
  <form method="post" action="/logout"><button type="submit">Log out</button></form>
</div>
<p class="sub">Send anything to <code>${escapeHtml(hookUrl)}</code> — any method, any body.</p>
${search}
${feedBlock}
${pollScript}`,
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
  // No body_json (e.g. JSON sent without a JSON content-type) — still indent it if it parses.
  return `<pre>${escapeHtml(prettyIfJson(body_raw))}</pre>`;
}

export function requestPage({ project, request }) {
  const contentType = request.headers?.['content-type'] ?? null;
  const showRawToo = request.body_json !== null && request.body_json !== undefined && request.body_raw;
  const hasBody =
    (request.body_json !== null && request.body_json !== undefined) || Boolean(request.body_raw);

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

<div class="section-head"><h2>Body</h2>${hasBody ? '<button type="button" class="copy" data-copy="#body">Copy</button>' : ''}</div>
<div id="body">${bodyBlock(request)}</div>
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
