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

export function projectPage({ project, requests, hookUrl }) {
  const feed = requests.length
    ? requests
        .map(
          (r) => `<div class="req">
  <div class="meta">
    <span class="method">${escapeHtml(r.method)}</span>
    <span class="time">${escapeHtml(new Date(r.received_at).toISOString())}</span>
    <span class="ip">from ${escapeHtml(r.source_ip)}</span>
  </div>
  ${preview(r.body_raw)}
</div>`,
        )
        .join('\n')
    : `<p class="none">No requests yet. Send one to the URL above.</p>`;

  return layout(
    `${project.name} — Webhook Catcher`,
    `<div class="head">
  <h1>${escapeHtml(project.name)}</h1>
  <form method="post" action="/logout"><button type="submit">Log out</button></form>
</div>
<p class="sub">Send anything to <code>${escapeHtml(hookUrl)}</code> — any method, any body.</p>
${feed}`,
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
