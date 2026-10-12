/**
 * Edge/API log export.
 *
 * The log stream is queried with a BigQuery-flavoured dialect over nested
 * fields, and the exact shape of `metadata` has changed across Supabase
 * versions. We therefore try progressively simpler projections and use the
 * first that the backend accepts, recording which one worked.
 */
import { queryLogs } from './mgmt.mjs';

const VARIANTS = [
  {
    name: 'with-apikey-role',
    sql: `
      select t.timestamp, r.method, r.path, resp.status_code,
             h.cf_connecting_ip as ip, h.user_agent, k.role as apikey_role
        from edge_logs as t
        cross join unnest(t.metadata) as m
        cross join unnest(m.request) as r
        cross join unnest(m.response) as resp
        cross join unnest(r.headers) as h
        cross join unnest(r.sb) as sb
        cross join unnest(sb.apikey) as k
       where r.path like '/rest/v1/%'
       order by t.timestamp desc
       limit 1000`,
  },
  {
    name: 'headers-only',
    sql: `
      select t.timestamp, r.method, r.path, resp.status_code,
             h.cf_connecting_ip as ip, h.user_agent
        from edge_logs as t
        cross join unnest(t.metadata) as m
        cross join unnest(m.request) as r
        cross join unnest(m.response) as resp
        cross join unnest(r.headers) as h
       where r.path like '/rest/v1/%'
       order by t.timestamp desc
       limit 1000`,
  },
  {
    name: 'minimal',
    sql: `
      select t.timestamp, t.event_message
        from edge_logs as t
       order by t.timestamp desc
       limit 1000`,
  },
];

/**
 * Walk backwards one day at a time until the API stops returning data, which
 * is how we discover the project's actual (plan-dependent) retention window.
 */
export async function exportRestLogs(ref, { maxDays = 95, log = console.log } = {}) {
  const rows = [];
  let variant = null;
  let emptyStreak = 0;
  let oldest = null;
  let newest = null;
  const notes = [];

  for (let day = 0; day < maxDays; day++) {
    const end = new Date(Date.now() - day * 86400000);
    const start = new Date(end.getTime() - 86400000);
    const iso = [start.toISOString(), end.toISOString()];

    let got = null;
    for (const v of variant ? [VARIANTS.find((x) => x.name === variant)] : VARIANTS) {
      const { status, body } = await queryLogs(ref, v.sql, iso[0], iso[1]);
      if (status === 200) {
        // Shape varies by version: {result:[...]}, a bare array, or an object
        // on error. Coerce defensively — a non-array here used to throw.
        const payload = body?.result ?? body?.data ?? body;
        if (!Array.isArray(payload)) {
          notes.push(`unexpected log payload shape from ${v.name}: ${JSON.stringify(payload).slice(0, 200)}`);
          continue;
        }
        variant = v.name;
        got = payload;
        break;
      }
      if (status === 410) {
        notes.push('logs endpoint returned 410 Gone — API changed, update lib/logs.mjs');
        return { rows, variant, oldest, newest, notes, truncated: true };
      }
      // 400 => this projection is unsupported; try the next one.
    }

    if (got === null) {
      notes.push(`no supported log projection for window ${iso[0]}..${iso[1]}`);
      break;
    }

    if (got.length === 0) {
      if (++emptyStreak >= 3 && day > 2) {
        notes.push(`stopped after ${emptyStreak} consecutive empty days (retention boundary at ~${day} days)`);
        break;
      }
    } else {
      emptyStreak = 0;
      rows.push(...got);
      newest ??= iso[1];
      oldest = iso[0];
      if (got.length >= 1000) {
        notes.push(`window ${iso[0]} hit the 1000-row cap — counts for that day are a lower bound`);
      }
    }
    log(`    ${iso[0].slice(0, 10)}: ${got.length} rows`);
  }

  return { rows, variant, oldest, newest, notes, truncated: false };
}

/** Aggregate the raw rows into the summary the incident report needs. */
export function summarise(rows) {
  const tally = (fn) => {
    const m = new Map();
    for (const r of rows) {
      const k = fn(r);
      if (k === undefined || k === null || k === '') continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const table = (r) => {
    const p = r.path ?? '';
    const m = p.match(/^\/rest\/v1\/([^?/]+)/);
    return m ? m[1] : null;
  };

  return {
    total: rows.length,
    byTable: tally(table),
    byMethod: tally((r) => r.method),
    byIp: tally((r) => r.ip),
    byStatus: tally((r) => r.status_code),
    byApikeyRole: tally((r) => r.apikey_role),
    byDay: tally((r) => String(r.timestamp ?? '').slice(0, 10)),
    anonRows: rows.filter((r) => r.apikey_role === 'anon').length,
    roleDataAvailable: rows.some((r) => r.apikey_role !== undefined && r.apikey_role !== null),
  };
}
