// Server-rendered pages, string templates. Step 1 is deliberately bare: a feed with
// method, timestamp and raw body. Detail view is step 4, search is step 5.

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const BODY_PREVIEW_LIMIT = 2000;

// Colour-coded HTTP method pill. Unknown methods fall back to the neutral base style.
const KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
function methodBadge(method) {
  const m = String(method ?? '').toUpperCase();
  const cls = KNOWN_METHODS.has(m) ? ` m-${m.toLowerCase()}` : '';
  return `<span class="method${cls}">${escapeHtml(m)}</span>`;
}

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
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9;
    --surface: #ffffff;
    --surface-2: #f1f2f4;
    --text: #17181b;
    --muted: #6a707c;
    --border: #e4e6ea;
    --border-strong: #d3d6dc;
    --accent: #4f46e5;
    --radius: 12px;
    --radius-sm: 8px;
    --shadow: 0 1px 2px rgba(17, 24, 39, .04), 0 2px 6px rgba(17, 24, 39, .05);
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0c0d10;
      --surface: #17181c;
      --surface-2: #202127;
      --text: #e8e9ec;
      --muted: #9096a1;
      --border: #26282e;
      --border-strong: #34363d;
      --accent: #818cf8;
      --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 2px 8px rgba(0, 0, 0, .25);
    }
  }
  * { box-sizing: border-box; }
  body { font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 0; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 62rem; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
  a { color: var(--accent); }

  h1 { font-size: 1.4rem; font-weight: 650; letter-spacing: -.01em; margin: 0; }
  h2 { font-size: .8rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
       color: var(--muted); margin: 0; }
  .sub { color: var(--muted); font-size: .875rem; margin: .35rem 0 1.75rem; }
  .sub code { color: var(--text); }
  code, pre { font-family: var(--mono); font-size: .8125rem; }
  code { background: var(--surface-2); padding: .1em .4em; border-radius: 5px; }
  pre { margin: 0; padding: .75rem .875rem; border-radius: var(--radius-sm);
        background: var(--surface-2); border: 1px solid var(--border);
        white-space: pre-wrap; word-break: break-word; overflow-x: auto; }
  pre code { background: none; padding: 0; }

  .head { display: flex; justify-content: space-between; align-items: start; gap: 1rem;
          margin-bottom: 1.5rem; }
  .back { margin: 0 0 .4rem; font-size: .8125rem; }
  .back a { color: var(--muted); text-decoration: none; }
  .back a:hover { color: var(--text); }

  /* HTTP method pills */
  .method { display: inline-flex; align-items: center; font-family: var(--mono); font-weight: 600;
            font-size: .6875rem; letter-spacing: .03em; padding: .2rem .45rem; border-radius: 6px;
            background: var(--surface-2); color: var(--muted); }
  .m-get    { color: #15803d; background: color-mix(in srgb, #22c55e 15%, transparent); }
  .m-post   { color: #1d4ed8; background: color-mix(in srgb, #3b82f6 15%, transparent); }
  .m-put,
  .m-patch  { color: #b45309; background: color-mix(in srgb, #f59e0b 18%, transparent); }
  .m-delete { color: #b91c1c; background: color-mix(in srgb, #ef4444 15%, transparent); }
  @media (prefers-color-scheme: dark) {
    .m-get { color: #4ade80; } .m-post { color: #93b4fd; }
    .m-put, .m-patch { color: #fbbf24; } .m-delete { color: #fca5a5; }
  }

  /* live indicator */
  .live { display: inline-flex; align-items: center; gap: .3rem; font-size: .625rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
          vertical-align: middle; margin-left: .5rem; }
  .dot { width: .45rem; height: .45rem; border-radius: 50%; background: #22c55e;
         box-shadow: 0 0 0 0 color-mix(in srgb, #22c55e 60%, transparent);
         animation: pulse 2s ease-in-out infinite; }
  .dot.stale { background: #9ca3af; animation: none; box-shadow: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, #22c55e 55%, transparent); }
                     70% { box-shadow: 0 0 0 .35rem transparent; }
                     100% { box-shadow: 0 0 0 0 transparent; } }

  /* feed cards */
  #feed { display: flex; flex-direction: column; gap: .75rem; }
  a.req { display: block; padding: .9rem 1rem; text-decoration: none; color: inherit;
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          box-shadow: var(--shadow); transition: border-color .15s ease, transform .08s ease; }
  a.req:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  a.req:active { transform: translateY(1px); }
  a.req pre { max-height: 20rem; overflow: auto; margin-top: .7rem; }
  .note { margin-top: .6rem; padding: .5rem .7rem; font-size: .8125rem;
          border-left: 3px solid color-mix(in srgb, var(--accent) 60%, transparent);
          background: color-mix(in srgb, var(--accent) 8%, transparent);
          border-radius: 0 6px 6px 0; white-space: pre-wrap; word-break: break-word; }
  .note::before { content: "📝 "; }
  .note-form { display: flex; flex-direction: column; gap: .5rem; align-items: start; margin-top: .5rem; }
  .note-form textarea { width: 100%; font: inherit; padding: .55rem .7rem; border-radius: var(--radius-sm);
          background: var(--surface); color: var(--text); border: 1px solid var(--border-strong);
          resize: vertical; }
  .meta { display: flex; flex-wrap: wrap; gap: .55rem; align-items: center; }
  .time { color: var(--muted); font-size: .8125rem; font-variant-numeric: tabular-nums; }
  .ip { color: var(--muted); font-size: .8125rem; }
  .empty { color: var(--muted); font-style: italic; }
  .none { padding: 2.5rem 1rem; text-align: center; color: var(--muted);
          background: var(--surface); border: 1px dashed var(--border-strong);
          border-radius: var(--radius); }
  details { margin-top: .6rem; }
  summary { cursor: pointer; font-size: .8125rem; color: var(--muted); }
  summary:hover { color: var(--text); }

  /* controls */
  button, .btn { font: inherit; font-weight: 500; padding: .5rem .85rem; border-radius: var(--radius-sm);
           cursor: pointer; border: 1px solid var(--border-strong); background: var(--surface);
           color: var(--text); transition: background .12s ease, border-color .12s ease; }
  button:hover, .btn:hover { background: var(--surface-2); border-color: var(--muted); }
  input { font: inherit; padding: .55rem .7rem; border-radius: var(--radius-sm); background: var(--surface);
          color: var(--text); border: 1px solid var(--border-strong); }
  input::placeholder { color: var(--muted); }
  input:focus-visible, button:focus-visible, .copy:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: 1px; }

  .section-head { display: flex; align-items: center; gap: .75rem; margin: 1.75rem 0 .5rem; }
  .copy, .del { font: inherit; font-size: .7rem; font-weight: 500; line-height: 1; padding: .3rem .55rem;
          border-radius: 6px; cursor: pointer; user-select: none; color: var(--muted);
          background: var(--surface); border: 1px solid var(--border-strong); }
  .copy:hover { color: var(--text); background: var(--surface-2); }
  .copy.copied { border-color: #22c55e; color: #16a34a; background: color-mix(in srgb, #22c55e 12%, transparent); }
  .del:hover { color: #dc2626; border-color: color-mix(in srgb, #ef4444 55%, var(--border-strong));
               background: color-mix(in srgb, #ef4444 8%, transparent); }
  @media (prefers-color-scheme: dark) { .del:hover { color: #fca5a5; } }
  .row-actions { margin-left: auto; display: inline-flex; gap: .4rem; }
  .danger { color: #dc2626; border-color: color-mix(in srgb, #ef4444 45%, var(--border-strong)); }
  .danger:hover { background: color-mix(in srgb, #ef4444 12%, transparent); border-color: #ef4444; }
  @media (prefers-color-scheme: dark) { .danger { color: #fca5a5; } }
  .head-actions { display: flex; gap: .5rem; align-items: start; }
  .menu { position: relative; }
  .menu > summary { display: inline-flex; align-items: center; gap: .4rem; list-style: none;
                    font: inherit; font-weight: 500; color: var(--text); cursor: pointer;
                    padding: .5rem .85rem; border-radius: var(--radius-sm);
                    border: 1px solid var(--border-strong); background: var(--surface); }
  .menu > summary::-webkit-details-marker { display: none; }
  .menu > summary:hover { background: var(--surface-2); border-color: var(--muted); }
  .menu-panel { position: absolute; right: 0; top: calc(100% + .45rem); z-index: 20; width: 20rem;
                display: flex; flex-direction: column; gap: .85rem; padding: 1rem;
                background: var(--surface); border: 1px solid var(--border);
                border-radius: var(--radius); box-shadow: 0 8px 28px rgba(17, 24, 39, .12); }
  @media (prefers-color-scheme: dark) { .menu-panel { box-shadow: 0 8px 28px rgba(0, 0, 0, .45); } }
  .menu-panel label { display: block; font-size: .75rem; font-weight: 500; color: var(--muted);
                      margin-bottom: .4rem; }
  .rename-row { display: flex; gap: .5rem; }
  .rename-row input { flex: 1; min-width: 0; }
  .menu-sep { height: 1px; background: var(--border); margin: .1rem -1rem; }
  .block { width: 100%; }

  .search { display: flex; gap: .5rem; align-items: center; margin: 0 0 1rem; }
  .search input { flex: 1; }
  .search .clear { font-size: .8125rem; color: var(--muted); text-decoration: none; }
  .search .clear:hover { color: var(--text); }
  .create { display: flex; gap: .5rem; margin: 0 0 1.5rem; }
  .create input { flex: 1; }

  /* project list */
  .projects { display: flex; flex-direction: column; gap: .625rem; }
  a.project { display: flex; flex-wrap: wrap; gap: .3rem .9rem; align-items: center;
              padding: 1rem 1.1rem; text-decoration: none; color: inherit; background: var(--surface);
              border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow);
              transition: border-color .15s ease; }
  a.project:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .project-name { font-weight: 600; font-size: 1.02rem; }
  .project-slug { color: var(--muted); }
  .project-stat { margin-left: auto; color: var(--muted); font-size: .8125rem; }

  /* login */
  .login { max-width: 22rem; margin: 12vh auto 0; background: var(--surface); padding: 2rem;
           border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
  .login h1 { font-size: 1.25rem; }
  .login .sub { margin: .35rem 0 1.5rem; }
  .login label { display: block; font-size: .8125rem; font-weight: 500; margin-bottom: .4rem; }
  .login input { width: 100%; }
  .login button { width: 100%; margin-top: .9rem; background: var(--accent); color: #fff;
                  border-color: var(--accent); font-weight: 600; }
  .login button:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
  .error { color: #dc2626; font-size: .8125rem; margin: .85rem 0 0; }
  @media (prefers-color-scheme: dark) { .error { color: #fca5a5; } }
</style>
</head>
<body>
<div class="wrap">
${body}
</div>
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
// Inline delete for a feed row: confirm, POST to the row's own URL + /delete, drop the card.
document.addEventListener('click', function (e) {
  var del = e.target.closest('.del');
  if (!del) return;
  e.preventDefault();
  var card = del.closest('.req');
  if (!card || !window.confirm('Delete this request? This cannot be undone.')) return;
  fetch(card.getAttribute('href') + '/delete', {
    method: 'POST', headers: { Accept: 'application/json' },
  }).then(function (res) { if (res.ok) card.remove(); });
});
// Close the settings dropdown when clicking outside it or pressing Escape.
document.addEventListener('click', function (e) {
  document.querySelectorAll('details.menu[open]').forEach(function (d) {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); });
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
  // Spans, not buttons: a <button> nested in the row's <a> is invalid and some parsers
  // relocate it. role/tabindex keep them operable; the delegated handler does the work.
  const copy = r.body_raw
    ? '<span class="copy" role="button" tabindex="0">Copy</span>'
    : '';
  const del = '<span class="del" role="button" tabindex="0">Delete</span>';
  const note = r.note ? `<div class="note">${escapeHtml(r.note)}</div>` : '';
  return `<a class="req" data-id="${r.id}" href="/projects/${encodeURIComponent(project.slug)}/requests/${r.id}">
  <div class="meta">
    ${methodBadge(r.method)}
    <span class="time">${escapeHtml(new Date(r.received_at).toISOString())}</span>
    <span class="ip">from ${escapeHtml(r.source_ip)}</span>
    <span class="row-actions">${copy}${del}</span>
  </div>
  ${note}
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
  <details class="menu">
    <summary>⚙ Project settings</summary>
    <div class="menu-panel">
      <form class="rename" method="post" action="/projects/${encodeURIComponent(project.slug)}/rename">
        <label for="rename-input">Project name</label>
        <div class="rename-row">
          <input id="rename-input" name="name" value="${escapeHtml(project.name)}" maxlength="120" autocomplete="off" required>
          <button type="submit">Save</button>
        </div>
      </form>
      <div class="menu-sep"></div>
      <form method="post" action="/projects/${encodeURIComponent(project.slug)}/delete"
            onsubmit="return confirm('Delete this project and all its requests? This cannot be undone.')">
        <button type="submit" class="danger block">Delete project</button>
      </form>
    </div>
  </details>
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
    <h1>${methodBadge(request.method)} request</h1>
  </div>
  <div class="head-actions">
    <form method="post" action="/projects/${encodeURIComponent(project.slug)}/requests/${request.id}/delete"
          onsubmit="return confirm('Delete this request? This cannot be undone.')">
      <button type="submit" class="danger">Delete</button>
    </form>
    <form method="post" action="/logout"><button type="submit">Log out</button></form>
  </div>
</div>
<p class="sub">
  ${escapeHtml(new Date(request.received_at).toISOString())}
  · from ${escapeHtml(request.source_ip)}
  ${contentType ? `· <code>${escapeHtml(contentType)}</code>` : ''}
</p>

<div class="section-head"><h2>Remark</h2></div>
<form class="note-form" method="post" action="/projects/${encodeURIComponent(project.slug)}/requests/${request.id}/note">
  <textarea name="note" rows="2" maxlength="1000" placeholder="Add a note about this request…">${escapeHtml(request.note ?? '')}</textarea>
  <button type="submit">Save remark</button>
</form>

<div class="section-head"><h2>Body</h2>${hasBody ? '<button type="button" class="copy" data-copy="#body">Copy</button>' : ''}</div>
<div id="body">${bodyBlock(request)}</div>
${showRawToo ? `<details><summary>Raw body</summary><pre>${escapeHtml(request.body_raw)}</pre></details>` : ''}

<div class="section-head"><h2>Query</h2></div>
${kvBlock(request.query)}

<div class="section-head"><h2>Headers</h2></div>
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
