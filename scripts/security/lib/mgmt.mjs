/**
 * Minimal client for the Supabase Management API (https://api.supabase.com).
 *
 * Only the endpoints this remediation needs. Throttled to stay inside the
 * documented ~60 requests/minute budget, with retry on 429/5xx.
 */
import { require_, redact } from './env.mjs';

const BASE = 'https://api.supabase.com';
const MIN_INTERVAL_MS = 1100; // ~55 req/min
let lastCall = 0;

function token() {
  return require_(
    'SUPABASE_ACCESS_TOKEN',
    'Create a fine-grained token at https://supabase.com/dashboard/account/tokens\n' +
      'Scopes: database read+write, secrets read+write, analytics read, projects read.'
  );
}

async function throttle() {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/** Raw request. Returns { status, body }. Never throws on HTTP status. */
export async function api(method, path, { body, query } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (attempt === 4) throw new Error(`network error calling ${method} ${path}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const backoff = Number(res.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    return { status: res.status, body: parsed };
  }
  throw new Error(`exhausted retries for ${method} ${path}`);
}

/** Request that throws a readable error unless the call succeeded. */
export async function apiOk(method, path, opts) {
  const { status, body } = await api(method, path, opts);
  if (status < 200 || status >= 300) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${method} ${path} -> ${status}: ${redact(detail).slice(0, 500)}`);
  }
  return body;
}

// ---------------------------------------------------------------------------

/** Every project the token can see. */
export async function listProjects() {
  return apiOk('GET', '/v1/projects');
}

/**
 * Execute SQL. `readOnly` routes to the read-only endpoint, which runs as
 * supabase_read_only_user and cannot mutate anything — use it for all of
 * Step 0 so evidence gathering physically cannot alter the database.
 */
export async function runSql(ref, query, { readOnly = false } = {}) {
  const path = readOnly
    ? `/v1/projects/${ref}/database/query/read-only`
    : `/v1/projects/${ref}/database/query`;
  return apiOk('POST', path, { body: { query } });
}

export async function advisors(ref, kind /* 'security' | 'performance' */) {
  return apiOk('GET', `/v1/projects/${ref}/advisors/${kind}`);
}

/** Query the unified log stream. `sql` uses the logflare/BigQuery dialect. */
export async function queryLogs(ref, sql, isoStart, isoEnd) {
  return api('GET', `/v1/projects/${ref}/analytics/endpoints/logs`, {
    query: { sql, iso_timestamp_start: isoStart, iso_timestamp_end: isoEnd },
  });
}

/**
 * Project API keys. `reveal` returns the secret values — callers must keep
 * these in memory only and never write them to disk or logs.
 */
export async function apiKeys(ref, { reveal = false } = {}) {
  return apiOk('GET', `/v1/projects/${ref}/api-keys`, { query: { reveal } });
}

export async function legacyKeysEnabled(ref) {
  const { status, body } = await api('GET', `/v1/projects/${ref}/api-keys/legacy`);
  if (status === 404) return { removed: true, enabled: null };
  return { removed: false, enabled: body?.enabled ?? null, raw: body };
}

export async function setLegacyKeysEnabled(ref, enabled) {
  return apiOk('PUT', `/v1/projects/${ref}/api-keys/legacy`, { query: { enabled } });
}

export async function createRestorePoint(ref, name) {
  return apiOk('POST', `/v1/projects/${ref}/database/backups/restore-point`, { body: { name } });
}

export async function listBackups(ref) {
  return apiOk('GET', `/v1/projects/${ref}/database/backups`);
}

export async function getAuthConfig(ref) {
  return apiOk('GET', `/v1/projects/${ref}/config/auth`);
}

export async function patchAuthConfig(ref, patch) {
  return apiOk('PATCH', `/v1/projects/${ref}/config/auth`, { body: patch });
}

export async function projectUrl(ref) {
  return `https://${ref}.supabase.co`;
}
