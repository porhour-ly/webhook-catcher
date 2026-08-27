// Retention sweep (step 6). This tool holds staging/dev callbacks, not archives — anything
// past the window is noise, so delete it on a daily timer plus once at boot. Boot matters on
// Render's free tier: the service sleeps when idle and an incoming webhook wakes it, so a
// pure interval could go a long time between runs; sweeping on wake keeps the table bounded.

import { deleteRequestsOlderThan } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

// Env override, but never let a bad value silently disable or invert retention.
export function retentionDays() {
  const raw = process.env.RETENTION_DAYS;
  if (raw === undefined) return DEFAULT_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(`[retention] ignoring invalid RETENTION_DAYS="${raw}"; using ${DEFAULT_DAYS}`);
    return DEFAULT_DAYS;
  }
  return n;
}

export async function sweepOnce(days = retentionDays()) {
  const deleted = await deleteRequestsOlderThan(days);
  if (deleted > 0) {
    console.log(`[retention] deleted ${deleted} request(s) older than ${days} days`);
  }
  return deleted;
}

export function startRetention({ days = retentionDays(), intervalMs = DAY_MS } = {}) {
  const run = () =>
    sweepOnce(days).catch((err) => console.error('[retention] sweep failed:', err));

  run(); // on boot / wake
  const timer = setInterval(run, intervalMs);
  // Don't let the timer alone keep the process alive — the HTTP server owns the lifecycle.
  timer.unref?.();
  console.log(`[retention] active — deleting requests older than ${days} days, daily`);
  return timer;
}
