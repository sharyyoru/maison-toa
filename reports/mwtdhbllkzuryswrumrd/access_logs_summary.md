# Access log summary — `mwtdhbllkzuryswrumrd`

Projection used: `none`
Window covered: n/a .. n/a
Total `/rest/v1/` rows retrieved: **0**

### Notes
- unexpected log payload shape from with-apikey-role: {"error":"Table \"edge_logs\" does not exist."}
- unexpected log payload shape from headers-only: {"error":"Table \"edge_logs\" does not exist."}
- unexpected log payload shape from minimal: {"error":"Table \"edge_logs\" does not exist."}
- no supported log projection for window 2026-10-08T04:22:27.967Z..2026-10-09T04:22:27.967Z

> **Retention caveat.** Supabase log retention is plan-capped (roughly 1 day Free,
> 7 days Pro, 28 days Team). The exposure window for the leaked credentials is far
> longer, so these logs cannot confirm or rule out access across most of it.
> Absence of evidence here is **not** evidence of absence.

## Requests by API key role

_The log schema did not expose the API key role, so anon vs service_role cannot be distinguished from these logs._

## By table
_none_

## By method
_none_

## By status
_none_

## By client IP
_none_

## By day
_none_
