// Single shared password, no user accounts — see the brief. The session cookie carries
// no identity, only proof that someone typed the password: `<issuedAt>.<hmac(issuedAt)>`,
// keyed by the password itself. Nothing to store server-side, and changing the password
// invalidates every outstanding session for free.

import crypto from 'node:crypto';

const COOKIE_NAME = 'wc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Brute-forcing one shared secret over the open internet is the obvious attack here,
// so keep a small per-IP budget. In-memory is fine: a restart clearing it is not a
// meaningful bypass when the window is this short.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

export function readPassword() {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    throw new Error(
      'DASHBOARD_PASSWORD is not set. The dashboard must never run unauthenticated —\n' +
        'set it in .env (local) or in the service environment (deployed) and restart.',
    );
  }
  return password;
}

// Compare digests rather than raw input so timingSafeEqual always gets equal lengths
// and the comparison itself leaks nothing about the password's length.
function matchesPassword(candidate, password) {
  const a = crypto.createHash('sha256').update(String(candidate ?? ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(password, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function sign(issuedAt, password) {
  return crypto.createHmac('sha256', password).update(String(issuedAt)).digest('hex');
}

function issueSession(password) {
  const issuedAt = Date.now();
  return `${issuedAt}.${sign(issuedAt, password)}`;
}

function isValidSession(value, password) {
  if (typeof value !== 'string') return false;

  const [issuedAt, mac] = value.split('.');
  if (!issuedAt || !mac || !/^\d+$/.test(issuedAt)) return false;

  const expected = sign(issuedAt, password);
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac, 'utf8'), Buffer.from(expected, 'utf8'))) return false;

  return Date.now() - Number(issuedAt) < SESSION_TTL_MS;
}

function parseCookies(header) {
  const jar = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    jar[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return jar;
}

function throttled(ip) {
  const record = attempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const record = attempts.get(ip);
  if (!record || Date.now() - record.first > ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
    return;
  }
  record.count += 1;
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure, // true once Render terminates TLS in front of us
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

// Only ever redirect to a path on this host — never to whatever ?next= happens to contain.
function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

export function requireAuth(password) {
  return (req, res, next) => {
    if (isValidSession(parseCookies(req.get('cookie'))[COOKIE_NAME], password)) {
      next();
      return;
    }
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
}

export function attachAuthRoutes(app, password, { loginPage }) {
  app.get('/login', (req, res) => {
    if (isValidSession(parseCookies(req.get('cookie'))[COOKIE_NAME], password)) {
      res.redirect(safeNext(req.query.next));
      return;
    }
    res.send(loginPage({ next: safeNext(req.query.next) }));
  });

  app.post('/login', (req, res) => {
    const next = safeNext(req.body?.next);

    if (throttled(req.ip)) {
      res
        .status(429)
        .send(loginPage({ next, error: 'Too many attempts. Wait a few minutes and try again.' }));
      return;
    }

    if (!matchesPassword(req.body?.password, password)) {
      recordFailure(req.ip);
      console.warn(`[auth] failed login from ${req.ip}`);
      res.status(401).send(loginPage({ next, error: 'Wrong password.' }));
      return;
    }

    attempts.delete(req.ip);
    res.cookie(COOKIE_NAME, issueSession(password), cookieOptions(req));
    res.redirect(next);
  });

  app.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(req), maxAge: undefined });
    res.redirect('/login');
  });
}
