/**
 * Local ACF (ambulante Pauschalen) grouper.
 *
 * Replaces the Sumex/OAAT server grouper: given the LKAAT gesture codes of a
 * session plus the ICD-10 diagnosis (and optionally age/sex), it walks the
 * official grouping decision trees from the OAAT Definitionshandbuch and
 * returns the flat-rate code the case groups into — the same "server runs
 * code combinations and puts the right flat rate code on the invoice"
 * behaviour the clinic had before.
 *
 * Data: src/data/oaat/grouper.json, imported by scripts/import-oaat-grouper.ts
 * from the public OAAT Tarifbrowser (interactive Definitionshandbuch, version
 * ambP 1.1c). Each capitulum is a decision tree; internal nodes carry a
 * `logik` boolean expression, leaves carry the flat-rate code
 * (`kapitelPauschaleNummer`).
 *
 * Known gaps vs the licensed grouper:
 * - Drug/tariff-position inputs (tarpos, drugs — used by a few oncology and
 *   implant flat rates) are not collected by the app; paths depending on
 *   them come back as "tentative" rather than confirmed.
 * - `istWeiterleitung` (redirect) nodes are followed into the referenced
 *   subtree, whose own start-node logic is evaluated like the real grouper.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { acfData } from "./oaatCatalog";

// ── Data ────────────────────────────────────────────────────────────────────

type DhNode = {
  bezeichnung?: string;
  id: number;
  kapitelNummer?: string;
  kapitelPauschaleNummer?: string;
  istWeiterleitung?: boolean;
  logik?: string;
  children?: DhNode[];
};

type GrouperData = {
  version: string;
  trees: Record<string, DhNode>;
  tables: Record<string, { bezeichnung: string; text: string; codes: string[] }>;
};

let cached: GrouperData | null = null;
export function grouperData(): GrouperData {
  if (!cached) {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "oaat", "grouper.json"), "utf8"),
    ) as GrouperData;
  }
  return cached;
}

// ── Patient case ────────────────────────────────────────────────────────────

export type GrouperServiceInput = {
  code: string;
  /** 0 = none, 1 = left, 2 = right, 3 = both */
  side?: number | string | null;
  quantity?: number | null;
};

export type GrouperCaseInput = {
  services: GrouperServiceInput[];
  /** ICD-10 code of the main diagnosis ("" when unknown). */
  icdCode?: string;
  /** 0 = male, 1 = female (Sumex convention). */
  patientSex?: number | null;
  /** ISO birthdate; used for age_years checks. */
  patientBirthdate?: string | null;
};

type Side = "" | "L" | "R" | "B";
type ServiceEntry = { code: string; number: number; side: Side };

type CaseData = {
  services: ServiceEntry[];
  mainDiagnosis: string | null;
  diagnoses: string[];
  sex: "M" | "W" | null;
  ageYears: number | null;
  missingInputs: string[];
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toCase(input: GrouperCaseInput): CaseData {
  const sideOf = (s: GrouperServiceInput): Side => {
    if (s.side === 3 || s.side === "3" || s.side === "B") return "B";
    if (s.side === 1 || s.side === "1" || s.side === "L") return "L";
    if (s.side === 2 || s.side === "2" || s.side === "R") return "R";
    return "";
  };
  // Duplicate codes (same code + side) are summed before grouping — same rule
  // as the licensed grouper.
  const byKey = new Map<string, ServiceEntry>();
  for (const s of input.services) {
    const code = normalizeCode(s.code || "");
    if (!code) continue;
    const side = sideOf(s);
    const key = `${code}|${side}`;
    const qty = Math.max(0, Number(s.quantity) || 1);
    const existing = byKey.get(key);
    if (existing) existing.number += qty;
    else byKey.set(key, { code, number: qty, side });
  }

  const icd = normalizeCode(input.icdCode || "");
  const missingInputs: string[] = [];

  let ageYears: number | null = null;
  if (input.patientBirthdate) {
    const dob = new Date(input.patientBirthdate);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      ageYears = Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
  }
  if (ageYears === null) missingInputs.push("age_years");

  const sex = input.patientSex === 1 ? "W" : input.patientSex === 0 ? "M" : null;
  if (!sex) missingInputs.push("sex");
  if (!icd) missingInputs.push("main_diagnosis");

  return {
    services: [...byKey.values()],
    mainDiagnosis: icd || null,
    diagnoses: icd ? [icd] : [],
    sex,
    ageYears,
    missingInputs,
  };
}

// ── logik expression parser ─────────────────────────────────────────────────
//
// Grammar (observed across all 519 nodes of the Definitionshandbuch):
//   expr  := andExpr ("or" andExpr)*
//   and   := unary ("and" unary)*
//   unary := "not" unary | "(" expr ")" | atom
//   atom  := SUBJECT "in" ("table"|"list") "(" items ")" ["where" "(" cond ")"] [CMP NUM]
//         | OPERAND CMP OPERAND          (e.g. age_years <16, side = 'B', 1=1)
//   cond  := expr   (evaluated per entry; entry attrs: number, side, code,
//                    case attrs still available)
//
type Cmp = "=" | "<" | ">" | "<=" | ">=" | "!=";

type Ast =
  | { type: "and" | "or"; items: Ast[] }
  | { type: "not"; item: Ast }
  | { type: "cmp"; left: string; op: Cmp; right: string }
  | {
      type: "in";
      subject: string;
      kind: "table" | "list";
      items: string[];
      where: Ast | null;
      countOp: Cmp | null;
      countNum: number | null;
    };

const TOKEN_RE = /\s*(>=|<=|!=|\(|\)|,|and\b|or\b|not\b|where\b|in\b|table\b|list\b|'[^']*'|"[^"]*"|[<>=]|[A-Za-z0-9_.\/:*+-]+)/g;

function tokenize(logik: string): string[] {
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = TOKEN_RE.exec(logik))) {
    if (m.index !== lastEnd) {
      throw new Error(`logik tokenizer gap "${logik.slice(lastEnd, m.index)}" in "${logik}"`);
    }
    lastEnd = m.index + m[0].length;
    tokens.push(m[1]);
  }
  if (logik.slice(lastEnd).trim()) throw new Error(`logik tokenizer tail in "${logik}"`);
  return tokens;
}

function parseLogik(logik: string): Ast {
  const tokens = tokenize(logik);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): Ast {
    let left = parseAnd();
    while (peek() === "or") {
      next();
      const right = parseAnd();
      left = { type: "or", items: left.type === "or" ? [...left.items, right] : [left, right] };
    }
    return left;
  }
  function parseAnd(): Ast {
    let left = parseUnary();
    while (peek() === "and") {
      next();
      const right = parseUnary();
      left = { type: "and", items: left.type === "and" ? [...left.items, right] : [left, right] };
    }
    return left;
  }
  function parseUnary(): Ast {
    if (peek() === "not") {
      next();
      return { type: "not", item: parseUnary() };
    }
    if (peek() === "(") {
      next();
      const inner = parseExpr();
      if (next() !== ")") throw new Error(`expected ) in "${logik}"`);
      return inner;
    }
    return parseAtom();
  }
  function unquote(tok: string): string {
    return tok.replace(/^['"]|['"]$/g, "");
  }
  function parseAtom(): Ast {
    const first = next();
    if (first === undefined) throw new Error(`unexpected end of "${logik}"`);
    if (peek() === "in") {
      next();
      const kind = next();
      if (kind !== "table" && kind !== "list") throw new Error(`expected table/list in "${logik}"`);
      if (next() !== "(") throw new Error(`expected ( in "${logik}"`);
      const items: string[] = [];
      while (peek() !== ")") {
        const t = next();
        if (t === undefined) throw new Error(`unclosed ( in "${logik}"`);
        if (t !== ",") items.push(unquote(t).trim());
      }
      next(); // )
      let where: Ast | null = null;
      if (peek() === "where") {
        next();
        if (next() !== "(") throw new Error(`expected ( after where in "${logik}"`);
        where = parseExpr();
        if (next() !== ")") throw new Error(`expected ) after where in "${logik}"`);
      }
      let countOp: Cmp | null = null;
      let countNum: number | null = null;
      if (peek() && /^([<>=]|<=|>=|!=)$/.test(peek()!)) {
        countOp = next() as Cmp;
        countNum = Number(next());
      }
      return { type: "in", subject: first, kind, items, where, countOp, countNum };
    }
    // OPERAND CMP OPERAND
    const op = next();
    const right = next();
    if (!op || !/^(=|<|>|<=|>=|!=)$/.test(op) || right === undefined) {
      throw new Error(`bad atom "${first} ${op} ${right}" in "${logik}"`);
    }
    return { type: "cmp", left: unquote(first), op: op as Cmp, right: unquote(right) };
  }

  const ast = parseExpr();
  if (pos !== tokens.length) throw new Error(`trailing tokens in "${logik}"`);
  return ast;
}

// ── Tri-state evaluation ────────────────────────────────────────────────────

type Tri = true | false | "unknown";
const triAnd = (a: Tri, b: Tri): Tri => (a === false || b === false ? false : a === true && b === true ? true : "unknown");
const triOr = (a: Tri, b: Tri): Tri => (a === true || b === true ? true : a === false && b === false ? false : "unknown");

function applyCmp(op: Cmp, value: number, target: number): boolean {
  switch (op) {
    case "=": return value === target;
    case "!=": return value !== target;
    case "<": return value < target;
    case ">": return value > target;
    case "<=": return value <= target;
    case ">=": return value >= target;
  }
}

function operandValue(name: string, entry: ServiceEntry | null, data: CaseData): number | string | null {
  switch (name) {
    case "age_years": return data.ageYears;
    case "number": return entry ? entry.number : null;
    case "side": return entry ? entry.side || null : null;
    case "sex": return data.sex;
    case "code": return entry ? entry.code : null;
    default: return null;
  }
}

function icdMatch(entryCode: string, tableCode: string): boolean {
  const e = normalizeCode(entryCode);
  const t = normalizeCode(tableCode);
  return e === t || e.startsWith(t + ".") || t.startsWith(e + ".") || e.startsWith(t) || t.startsWith(e);
}

function evalAst(ast: Ast, data: CaseData, tables: GrouperData["tables"], entry: ServiceEntry | null): Tri {
  switch (ast.type) {
    case "and": return ast.items.reduce<Tri>((acc, i) => triAnd(acc, evalAst(i, data, tables, entry)), true);
    case "or": return ast.items.reduce<Tri>((acc, i) => triOr(acc, evalAst(i, data, tables, entry)), false);
    case "not": {
      const v = evalAst(ast.item, data, tables, entry);
      return v === "unknown" ? "unknown" : !v;
    }
    case "cmp": {
      const lNum = Number(ast.left);
      const rNum = Number(ast.right);
      // Both literal (e.g. 1=1)?
      if (!Number.isNaN(lNum) && !Number.isNaN(rNum)) return applyCmp(ast.op, lNum, rNum);
      const lv = operandValue(ast.left, entry, data);
      if (lv === null || lv === undefined) return "unknown";
      if (typeof lv === "number" && !Number.isNaN(rNum)) return applyCmp(ast.op, lv, rNum);
      const eq = String(lv).toUpperCase() === String(ast.right).toUpperCase();
      return ast.op === "=" ? eq : ast.op === "!=" ? !eq : false;
    }
    case "in": {
      const matchEntry = (code: string): boolean =>
        ast.kind === "list"
          ? ast.items.some((i) => normalizeCode(i) === code)
          : ast.items.some((name) => (tables[name]?.codes || []).some((c) => icdMatch(code, c)));

      let pool: { code: string; entry: ServiceEntry | null }[] = [];
      if (ast.subject === "services") pool = data.services.map((s) => ({ code: s.code, entry: s }));
      else if (ast.subject === "diagnoses") pool = data.diagnoses.map((d) => ({ code: d, entry: null }));
      else if (ast.subject === "main_diagnosis") pool = data.mainDiagnosis ? [{ code: data.mainDiagnosis, entry: null }] : [];
      else if (ast.subject === "tarpos" || ast.subject === "drugs") return "unknown"; // not collected
      else if (ast.subject === "sex") {
        if (!data.sex) return "unknown";
        return ast.items.some((i) => i.toUpperCase() === data.sex) ? true : false;
      }

      const isDiagnosis = ast.subject === "diagnoses" || ast.subject === "main_diagnosis";
      let matching = pool.filter((p) =>
        isDiagnosis
          ? ast.kind === "list"
            ? ast.items.some((i) => icdMatch(p.code, i))
            : ast.items.some((name) => (tables[name]?.codes || []).some((c) => icdMatch(p.code, c)))
          : matchEntry(p.code),
      );
      if (ast.where) {
        matching = matching.filter((p) => {
          const scope: ServiceEntry = p.entry ?? { code: p.code, number: 1, side: "" };
          return evalAst(ast.where!, data, tables, scope) === true;
        });
      }
      if (ast.countOp && ast.countNum !== null) {
        const count = matching.reduce((sum, p) => sum + (p.entry?.number || 1), 0);
        return applyCmp(ast.countOp, count, ast.countNum);
      }
      return matching.length > 0;
    }
  }
}

// ── Tree walk ───────────────────────────────────────────────────────────────

type LeafHit = {
  code: string;
  capitulum: string;
  tentative: boolean;
  path: string[];
};

function buildLabelIndex(trees: Record<string, DhNode>): Map<string, DhNode> {
  const index = new Map<string, DhNode>();
  const walk = (n: DhNode) => {
    if (n.kapitelNummer && (n.children?.length || 0) > 0 && !index.has(n.kapitelNummer)) {
      index.set(n.kapitelNummer, n);
    }
    (n.children || []).forEach(walk);
  };
  Object.values(trees).forEach(walk);
  return index;
}

function walkTree(
  node: DhNode,
  data: CaseData,
  tables: GrouperData["tables"],
  labelIndex: Map<string, DhNode>,
  capitulum: string,
  path: string[],
  visitedLabels: Set<string>,
  hits: LeafHit[],
  depth: number,
  tentative: boolean,
) {
  if (depth > 40) return;

  const verdict = node.logik ? evalAst(compile(node.logik), data, tables, null) : true;
  if (verdict === false) return;
  const nextTentative = tentative || verdict === "unknown";
  const newPath = node.logik ? [...path, node.logik.replace(/\s+/g, " ").trim()] : path;

  if (node.kapitelPauschaleNummer) {
    hits.push({ code: node.kapitelPauschaleNummer, capitulum, tentative: nextTentative, path: newPath });
    return;
  }

  for (const child of node.children || []) {
    if (child.istWeiterleitung && child.kapitelNummer) {
      const target = labelIndex.get(child.kapitelNummer);
      if (!target || visitedLabels.has(child.kapitelNummer)) continue;
      visitedLabels.add(child.kapitelNummer);
      walkTree(target, data, tables, labelIndex, capitulum, newPath, visitedLabels, hits, depth + 1, nextTentative);
      visitedLabels.delete(child.kapitelNummer);
      continue;
    }
    walkTree(child, data, tables, labelIndex, capitulum, newPath, visitedLabels, hits, depth + 1, nextTentative);
  }
}

// AST cache — 519 nodes, parsed once.
const astCache = new Map<string, Ast>();
function compile(logik: string): Ast {
  let ast = astCache.get(logik);
  if (!ast) {
    ast = parseLogik(logik);
    astCache.set(logik, ast);
  }
  return ast;
}

// ── Public API ──────────────────────────────────────────────────────────────

export type LocalGrouperResult = {
  /** The flat rate the case groups into, or "NO.ambP" for per-service billing. */
  group: string | null;
  tentative: boolean;
  capitulum: string | null;
  decisionPath: string[];
  alternatives: string[];
  missingInputs: string[];
  warnings: string[];
};

export function groupCase(input: GrouperCaseInput): LocalGrouperResult {
  const data = grouperData();
  const caseData = toCase(input);
  const labelIndex = buildLabelIndex(data.trees);
  const warnings: string[] = [];

  const definite: LeafHit[] = [];
  const tentative: LeafHit[] = [];

  for (const cap of Object.keys(data.trees)) {
    const root = data.trees[cap];
    const hits: LeafHit[] = [];
    walkTree(root, caseData, data.tables, labelIndex, cap, [], new Set(), hits, 0, false);
    for (const h of hits) (h.tentative ? tentative : definite).push(h);
  }

  const chosen = definite[0] || tentative[0] || null;
  if (!chosen) {
    return {
      group: null,
      tentative: false,
      capitulum: null,
      decisionPath: [],
      alternatives: [],
      missingInputs: caseData.missingInputs,
      warnings: ["No flat-rate path matched — bill the individual services (NO.ambP)."],
    };
  }

  const alternatives = [...new Set([...definite, ...tentative].map((h) => h.code))].filter(
    (c) => c !== chosen.code && c !== "NO.ambP",
  );
  const realDefinite = definite.filter((h) => h.code !== "NO.ambP");
  if (realDefinite.length > 1 && chosen.code !== "NO.ambP") {
    warnings.push(`Several flat rates matched; the first (${chosen.code}) was selected.`);
  }
  if (chosen.tentative) {
    warnings.push(
      `Grouping could not be fully confirmed (missing: ${caseData.missingInputs.join(", ") || "tarpos/drugs"}). Verify ${chosen.code} manually.`,
    );
  }
  if (chosen.code === "NO.ambP") {
    warnings.push("Case groups into NO.ambP — bill the individual services, no flat rate.");
  }

  return {
    group: chosen.code,
    tentative: chosen.tentative,
    capitulum: chosen.capitulum,
    decisionPath: chosen.path,
    alternatives,
    missingInputs: caseData.missingInputs,
    warnings,
  };
}

/** Shape compatible with the Sumex runTmaGrouper response consumed by the UI. */
export function runLocalGrouper(input: {
  icdCode?: string;
  patientSex?: number;
  patientBirthdate?: string;
  services: GrouperServiceInput[];
}) {
  const result = groupCase({
    services: input.services,
    icdCode: input.icdCode,
    patientSex: input.patientSex,
    patientBirthdate: input.patientBirthdate,
  });

  const acfCodes: Array<{ code: string; name: string; tp: number; chapterCode: string; chapterName: string }> = [];
  if (result.group && result.group !== "NO.ambP") {
    const rate = acfData().services.find((s) => s.code === result.group);
    if (rate) {
      acfCodes.push({
        code: rate.code,
        name: rate.name,
        tp: rate.tp ?? 0,
        chapterCode: rate.chapterCode,
        chapterName: rate.chapterName,
      });
    } else {
      result.warnings.push(`Flat rate ${result.group} is not in the ACF 1.1c catalogue.`);
    }
  }

  return {
    success: !!result.group,
    groupingStatusList: result.group || "no-group",
    numACF: acfCodes.length,
    acfBases: [],
    services: [],
    acfCodes,
    errors: result.warnings,
    grouperVersion: grouperData().version,
    tentative: result.tentative,
    alternatives: result.alternatives,
    missingInputs: result.missingInputs,
  };
}
