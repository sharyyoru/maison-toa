/**
 * Interpreter for the official OAAT patient classification systems (PCS)
 * shipped with the Tarifmatcher from tariff year 2027 on:
 * - system_ambP_12_lkaat.json: ambulatory flat-rate grouper (ambP 1.2).
 * - system_ambP_V12_cap_assignment.json: capitulum assignment (Casemaster).
 *
 * Behaviour follows Tarifmatcher 1.2.1 and is checked against it in
 * src/__tests__/pcsGrouper.test.ts (cases produced by the official jar):
 * children are tried in rank order, depth first with backtracking; a GOTO
 * node continues at the chapter entry with that chapter code; the first leaf
 * reached carries the group. Codes are compared without dots.
 */

import { readFileSync } from "fs";
import { join } from "path";

export type PcsNode = {
  id: string;
  classname: string;
  chapter_entry: boolean;
  chapter_code: string;
  logic: string;
  rank: number;
  is_goto: boolean;
  children: PcsNode[];
};

export type PcsSystem = {
  name: string;
  version: string;
  application_year: string;
  grouper_hash: string;
  class_variable_name: string;
  start_node: PcsNode;
  tables: { name: string; table_type: string; codes: string[] }[];
};

export type PcsService = { code: string; side?: string; number?: number };
export type PcsDrug = { code: string; dose?: number | null; unit?: string };
export type PcsCase = {
  services: PcsService[];
  /** First entry is the main diagnosis. */
  diagnoses?: string[];
  drugs?: PcsDrug[];
  /** "M" or "W" (2026 PCS has sex-specific chapter rules). */
  sex?: string | null;
  /** Mapped TARDOC positions / drug positions (2026 "tarpos" variable). */
  tarpos?: string[];
  ageYears?: number | null;
};

export type PcsResult = {
  group: string | null;
  /** Ids of the nodes whose logic matched, in evaluation order. */
  path: string[];
  /** Chapter entries passed on the way to the group. */
  chapters: string[];
  errors: string[];
};

const cache = new Map<string, PcsSystem>();
export function loadPcs(year: string, file: "grouper" | "cap_assignment"): PcsSystem {
  const key = `${year}/${file}`;
  if (!cache.has(key)) {
    cache.set(key, JSON.parse(readFileSync(join(process.cwd(), "src", "data", "oaat", year, `${file}.json`), "utf8")));
  }
  return cache.get(key)!;
}

export const cleanCode = (code: string) => String(code ?? "").toUpperCase().replace(/[\s.]/g, "");

// ── Expression parsing ──────────────────────────────────────────────────────

type Cmp = "=" | "<" | ">" | "<=" | ">=" | "!=";
type Ast =
  | { t: "and" | "or"; items: Ast[] }
  | { t: "not"; item: Ast }
  | { t: "cmp"; left: string; op: Cmp; right: string }
  | { t: "in"; subject: string; kind: "table" | "list"; items: string[]; where: Ast | null; op: Cmp | null; num: number | null };

const TOKEN_RE = /\s*(>=|<=|!=|<>|\(|\)|,|'[^']*'|"[^"]*"|[<>=]|[A-Za-z0-9_.\/:*+-]+)/gy;
const CMP_RE = /^(=|<|>|<=|>=|!=|<>)$/;

function tokenize(raw: string): string[] {
  const src = raw.trim();
  const tokens: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN_RE.lastIndex < src.length && (m = TOKEN_RE.exec(src))) tokens.push(m[1]);
  if (src.slice(TOKEN_RE.lastIndex).trim()) throw new Error(`Cannot parse logic near "${src.slice(TOKEN_RE.lastIndex, TOKEN_RE.lastIndex + 30)}"`);
  return tokens;
}

export function parseLogic(src: string): Ast | null {
  const tokens = tokenize(src);
  if (!tokens.length) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const kw = (k: string) => tokens[pos]?.toLowerCase() === k;
  const next = () => tokens[pos++];
  const expect = (tok: string) => {
    if (next() !== tok) throw new Error(`Expected "${tok}" in logic: ${src}`);
  };
  const unquote = (s: string) => s.replace(/^['"]|['"]$/g, "");

  function expr(): Ast {
    const items = [and()];
    while (kw("or")) { next(); items.push(and()); }
    return items.length === 1 ? items[0] : { t: "or", items };
  }
  function and(): Ast {
    const items = [unary()];
    while (kw("and")) { next(); items.push(unary()); }
    return items.length === 1 ? items[0] : { t: "and", items };
  }
  function unary(): Ast {
    if (kw("not")) { next(); return { t: "not", item: unary() }; }
    if (peek() === "(") {
      next();
      const e = expr();
      expect(")");
      // "(services in table (X)) < 2" counts like "services in table (X) < 2".
      if (e.t === "in" && !e.op && peek() && CMP_RE.test(peek()!)) {
        e.op = normOp(next()!);
        e.num = Number(next());
      }
      return e;
    }
    return atom();
  }
  function atom(): Ast {
    const first = next();
    if (first === undefined) throw new Error(`Unexpected end of logic: ${src}`);
    if (kw("in")) {
      next();
      const kind = next()?.toLowerCase();
      if (kind !== "table" && kind !== "list") throw new Error(`Expected table/list in logic: ${src}`);
      expect("(");
      const items: string[] = [];
      while (peek() !== ")") {
        const tok = next();
        if (tok === undefined) throw new Error(`Unclosed ( in logic: ${src}`);
        if (tok !== ",") items.push(unquote(tok));
      }
      next();
      let where: Ast | null = null;
      if (kw("where")) { next(); expect("("); where = expr(); expect(")"); }
      let op: Cmp | null = null;
      let num: number | null = null;
      if (peek() && CMP_RE.test(peek()!)) {
        op = normOp(next()!);
        num = Number(next());
      }
      return { t: "in", subject: first.toLowerCase(), kind, items, where, op, num };
    }
    const op = next();
    const right = next();
    if (!op || !CMP_RE.test(op) || right === undefined) throw new Error(`Bad comparison in logic: ${src}`);
    return { t: "cmp", left: unquote(first), op: normOp(op), right: unquote(right) };
  }
  const normOp = (op: string): Cmp => (op === "<>" ? "!=" : (op as Cmp));

  const ast = expr();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in logic: ${src}`);
  return ast;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

type Item = { code: string; number: number; side: string; dose: number | null };
type Ctx = {
  services: Item[];
  diagnoses: Item[];
  mainDiagnosis: Item[];
  drugs: Item[];
  sex: Item[];
  tarpos: Item[];
  ageYears: number | null;
  tables: Map<string, Set<string>>;
};

function cmp(op: Cmp, a: number, b: number): boolean {
  switch (op) {
    case "=": return a === b;
    case "!=": return a !== b;
    case "<": return a < b;
    case ">": return a > b;
    case "<=": return a <= b;
    case ">=": return a >= b;
  }
}

function operand(name: string, item: Item | null, ctx: Ctx): number | string | null {
  const n = name.toLowerCase();
  if (n === "age_years") return ctx.ageYears;
  if (item) {
    if (n === "number") return item.number;
    if (n === "side") return item.side;
    if (n === "dose") return item.dose;
    if (n === "code") return item.code;
  }
  const num = Number(name);
  return Number.isNaN(num) ? name : num;
}

function evaluate(ast: Ast, ctx: Ctx, item: Item | null): boolean {
  switch (ast.t) {
    case "and": return ast.items.every((i) => evaluate(i, ctx, item));
    case "or": return ast.items.some((i) => evaluate(i, ctx, item));
    case "not": return !evaluate(ast.item, ctx, item);
    case "cmp": {
      const l = operand(ast.left, item, ctx);
      const r = operand(ast.right, item, ctx);
      if (l === null || r === null) return false;
      if (typeof l === "number" && typeof r === "number") return cmp(ast.op, l, r);
      const eq = String(l).toUpperCase() === String(r).toUpperCase();
      return ast.op === "=" ? eq : ast.op === "!=" ? !eq : false;
    }
    case "in": {
      const pool =
        ast.subject === "services" ? ctx.services
        : ast.subject === "diagnoses" ? ctx.diagnoses
        : ast.subject === "main_diagnosis" ? ctx.mainDiagnosis
        : ast.subject === "drugs" ? ctx.drugs
        : ast.subject === "sex" ? ctx.sex
        : ast.subject === "tarpos" ? ctx.tarpos
        : [];
      const wanted = new Set<string>();
      for (const name of ast.items) {
        if (ast.kind === "list") wanted.add(cleanCode(name));
        else ctx.tables.get(name)?.forEach((c) => wanted.add(c));
      }
      // "C11.*" in a list matches every code with that prefix.
      const prefixes = [...wanted].filter((c) => c.endsWith("*")).map((c) => c.slice(0, -1));
      let matches = pool.filter((p) => wanted.has(p.code) || prefixes.some((x) => p.code.startsWith(x)));
      if (ast.where) matches = matches.filter((p) => evaluate(ast.where!, ctx, p));
      // The Tarifmatcher counts distinct matching codes here, not quantities.
      if (ast.op && ast.num !== null) return cmp(ast.op, new Set(matches.map((p) => p.code)).size, ast.num);
      return matches.length > 0;
    }
  }
}

type Prepared = { sys: PcsSystem; tables: Map<string, Set<string>>; chapters: Map<string, PcsNode>; asts: Map<string, Ast | null> };
const prepared = new WeakMap<PcsSystem, Prepared>();
function prepare(sys: PcsSystem): Prepared {
  let p = prepared.get(sys);
  if (p) return p;
  const tables = new Map(sys.tables.map((t) => [t.name, new Set(t.codes.map(cleanCode))]));
  const chapters = new Map<string, PcsNode>();
  const asts = new Map<string, Ast | null>();
  const walk = (n: PcsNode) => {
    if (n.chapter_entry && n.chapter_code && !chapters.has(n.chapter_code)) chapters.set(n.chapter_code, n);
    asts.set(n.id, parseLogic(n.logic || ""));
    [...n.children].sort((a, b) => a.rank - b.rank).forEach(walk);
  };
  walk(sys.start_node);
  p = { sys, tables, chapters, asts };
  prepared.set(sys, p);
  return p;
}

export function evaluatePcs(sys: PcsSystem, input: PcsCase): PcsResult {
  const p = prepare(sys);
  const toItems = (codes: string[]) => codes.filter(Boolean).map((c) => ({ code: cleanCode(c), number: 1, side: "", dose: null }));
  // Same code and side are summed, as in the Tarifmatcher.
  const merged = new Map<string, Item>();
  for (const s of input.services) {
    const code = cleanCode(s.code);
    if (!code) continue;
    const side = (s.side || "").toUpperCase();
    const key = `${code}|${side}`;
    const number = Math.max(1, Math.round(Number(s.number) || 1));
    const prev = merged.get(key);
    if (prev) prev.number += number;
    else merged.set(key, { code, number, side, dose: null });
  }
  const diagnoses = toItems(input.diagnoses || []);
  const ctx: Ctx = {
    services: [...merged.values()],
    diagnoses,
    mainDiagnosis: diagnoses.slice(0, 1),
    drugs: (input.drugs || []).map((d) => ({ code: cleanCode(d.code), number: 1, side: "", dose: d.dose ?? null })),
    sex: input.sex ? toItems([input.sex]) : [],
    tarpos: toItems(input.tarpos || []),
    ageYears: input.ageYears ?? null,
    tables: p.tables,
  };

  const path: string[] = [];
  const chapters: string[] = [];
  const errors: string[] = [];
  const gotoStack = new Set<string>();

  const visit = (node: PcsNode): string | null => {
    for (const child of [...node.children].sort((a, b) => a.rank - b.rank)) {
      const ast = p.asts.get(child.id);
      if (ast && !evaluate(ast, ctx, null)) continue;
      path.push(child.id);
      if (child.is_goto) {
        const target = p.chapters.get(child.classname.replace(/^GOTO\s+/i, "").trim());
        if (!target) { errors.push(`Unknown GOTO target ${child.classname}`); continue; }
        if (gotoStack.has(target.id)) { errors.push(`GOTO cycle at ${child.classname}`); continue; }
        gotoStack.add(target.id);
        path.push(target.id);
        const r = visit(target);
        gotoStack.delete(target.id);
        if (r) return r;
        continue;
      }
      if (child.chapter_entry && child.chapter_code) chapters.push(child.chapter_code);
      if (!child.children.length) {
        if (child.classname) return child.classname;
        continue;
      }
      const r = visit(child);
      if (r) return r;
      if (child.chapter_entry && child.chapter_code) chapters.pop();
    }
    return null;
  };

  path.push(sys.start_node.id);
  const group = visit(sys.start_node);
  if (!group) errors.push("No group reached");
  return { group, path, chapters, errors };
}
