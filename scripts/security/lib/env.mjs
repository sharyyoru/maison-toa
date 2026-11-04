/**
 * Loads credentials for the security remediation tooling.
 *
 * Reads `.env.security` (gitignored via `.env*`) and falls back to `.env.local`
 * and the real process environment. Never logs a value.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');

function parseDotenv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return out;
}

const fromFiles = {
  ...parseDotenv(path.join(ROOT, '.env.local')),
  ...parseDotenv(path.join(ROOT, '.env.security')), // takes precedence
};

export const env = { ...fromFiles, ...process.env };
export const repoRoot = ROOT;

/** Fetch a required variable, or exit with an actionable message. */
export function require_(name, hint) {
  const v = env[name];
  if (!v) {
    console.error(`\nMissing ${name}.`);
    if (hint) console.error(hint);
    console.error(`Add it to .env.security (gitignored) as ${name}=...\n`);
    process.exit(2);
  }
  return v;
}

export function optional(name) {
  return env[name] || null;
}

/** Per-project database URL, e.g. SUPABASE_DB_URL_abcdefghijklmnopqrst. */
export function dbUrlFor(ref) {
  return env[`SUPABASE_DB_URL_${ref}`] || env.SUPABASE_DB_URL || null;
}

/**
 * Redact anything that looks like a credential before it reaches a log or a
 * report file. Defence in depth — we also avoid passing secrets in by design.
 */
export function redact(text) {
  return String(text)
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '<REDACTED_JWT>')
    .replace(/sbp_[a-f0-9]{40,}/g, '<REDACTED_PAT>')
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/g, '<REDACTED_API_KEY>')
    .replace(/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/g, 'postgresql://<user>:<REDACTED>@');
}
