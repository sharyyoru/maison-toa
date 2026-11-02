// One-off codemod for the maison-toa repo: inject server-side auth guards.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src", "app", "api");
const DRY = process.argv.includes("--dry-run");

const PUBLIC_PREFIXES = ["public/", "webhooks/", "cron/"];
const PUBLIC_EXACT = new Set([
  "settings/booking-categories",
  "settings/booking-doctor-assignments",
  "settings/booking-doctors",
  "settings/booking-treatments",
  "settings/booking-landing-custom",
  "settings/booking-links",
  "online-bookings",
  "laura/bookings",
  "laura/bookings/filters",
  "payments/payrexx-webhook",
  "payments/stripe/webhook",
  "payments/stripe/create-booking-deposit-session",
  "invoices/public/[token]",
  "invoices/get-by-token",
  "invoices/generate-payment-token",
  "forms/submit",
  "onboarding/validate-token",
  "onboarding/save",
  "appointments/check-availability",
  "emails/webhook",
  "emails/inbound/mailgun",
  "crisalix/oauth/callback",
  "whatsapp/webhook",
  "me",
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

function matchGroup(src, i, open, close) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return j; }
    else if (c === '"' || c === "'" || c === "`") {
      const q = c; j++;
      while (j < src.length && src[j] !== q) { if (src[j] === "\\") j++; j++; }
    }
  }
  return -1;
}

function injectGuards(src, guardFor) {
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/g;
  const inserts = [];
  const manual = [];
  let m;
  while ((m = re.exec(src))) {
    const parenStart = m.index + m[0].length - 1;
    const parenEnd = matchGroup(src, parenStart, "(", ")");
    if (parenEnd === -1) { manual.push(m[1]); continue; }
    const params = src.slice(parenStart + 1, parenEnd).trim();
    const nameMatch = params.split(",")[0].trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
    const reqName = nameMatch ? nameMatch[1] : null;
    let k = parenEnd + 1;
    while (k < src.length && src[k] !== "{") { if (src[k] === ";") break; k++; }
    if (k >= src.length || src[k] !== "{") { manual.push(m[1]); continue; }
    inserts.push({ pos: k + 1, text: guardFor(reqName) });
  }
  inserts.sort((a, b) => b.pos - a.pos);
  for (const ins of inserts) src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos);
  return { src, count: inserts.length, manual };
}

function addImport(src, importLine) {
  if (src.includes(importLine)) return src;
  const matches = [...src.matchAll(/^import[^;]*;[ \t]*$/gm)];
  if (matches.length) {
    const last = matches[matches.length - 1];
    const pos = last.index + last[0].length;
    return src.slice(0, pos) + "\n" + importLine + src.slice(pos);
  }
  return importLine + "\n" + src;
}

const results = { public: [], guarded: [], manual: [], skipped: [] };

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  const isPublic =
    PUBLIC_EXACT.has(rel) || PUBLIC_PREFIXES.some((p) => rel.startsWith(p));
  if (isPublic) { results.public.push(rel); continue; }
  if (src.includes("requireStaff") || src.includes("requireRole")) {
    results.skipped.push(rel); continue;
  }

  const needsAdminRole =
    rel.startsWith("admin/") || rel.startsWith("users/") ||
    rel.startsWith("debug/") || rel.startsWith("migrations/");

  const r = injectGuards(src, (reqName) => {
    const arg = reqName || "(await headers())";
    const call = needsAdminRole ? `requireRole(${arg}, ["owner","admin"])` : `requireStaff(${arg})`;
    return `\n    try {\n      await ${call};\n    } catch (err) {\n      return authErrorResponse(err);\n    }`;
  });
  src = r.src;
  if (r.count > 0) {
    src = addImport(src, 'import { requireStaff, requireRole, authErrorResponse } from "@/lib/serverAuth";');
    if (src.includes("(await headers())")) {
      src = addImport(src, 'import { headers } from "next/headers";');
    }
    if (!DRY) fs.writeFileSync(file, src);
    results.guarded.push(`${rel} (${r.count})`);
  }
  if (r.manual.length) results.manual.push(`${rel}: ${r.manual.join(",")}`);
}

console.log(`PUBLIC ${results.public.length} | GUARDED ${results.guarded.length} | SKIPPED ${results.skipped.length} | MANUAL ${results.manual.length}`);
results.manual.forEach((x) => console.log("MANUAL", x));
results.guarded.forEach((x) => console.log("G", x));
