/**
 * Group ref-code autofill — derives `ref_code` for `tardoc_group_items` per
 * the official Sumex1 catalog rules so a saved group can be expanded into an
 * invoice without further per-line ref editing.
 *
 * Rules (from acfvalidator100.chm and tardocvalidator100.chm):
 *
 *   • TARDOC item (`tardoc_code` has no prefix), per
 *     tardocvalidator100.chm → ISearch::MasterCode and ::SearchAdditionalService:
 *       1. Catalog lookup → if MasterCode is non-empty, ref = MasterCode
 *          (slave service).
 *       2. Else walk earlier (lower sort_order) TARDOC items most-recent-first,
 *          calling ISearch::SearchAdditionalService(prior). If our code shows
 *          up in the result list, ref = AdditionalServiceReferenceCode of
 *          that result row (Zuschlag).
 *       3. Else leave ref empty (standalone main service).
 *
 *   • TMA gesture item (`tma:` prefix), per
 *     acfvalidator100.chm → IValidateTMA::AddService::bstrReferenceCode:
 *       Only services whose ServiceProperties has the
 *       `enServicePropertyIsNeedsRefCode` bit (32) require a ref. For those,
 *       the ref must be a master TMA code that is supplied prior to this one.
 *       We use ISearchTMA::Search4Slaves(master) over earlier TMA items in the
 *       group to find a candidate master.
 *
 *   • ACF flat-rate item (`acf:` prefix), per
 *     acfvalidator100.chm → IValidate005::AddService::bstrReferenceCode:
 *       The ref is an ICD-10 code. Cannot be auto-derived from the catalog
 *       (the catalog explicitly defines no ref codes for ACF). Leave existing
 *       value untouched; if empty, the user must supply it (typically via the
 *       grouper UI which writes the chosen ICD into ref_code at run-time).
 *
 * Critical guarantee: this autofill **never overwrites** a non-empty ref_code.
 * User-set values always win.
 */

import {
  searchByCode,
  searchAdditionalServices,
  type TardocServiceRecord,
  type SumexLanguage,
} from "@/lib/sumexTardoc";
import {
  searchTma,
  searchTmaSlaves,
  SERVICE_PROPERTY,
  type TmaServiceRecord,
  type AcfLanguage,
} from "@/lib/sumexAcf";

export type AutofillItemInput = {
  tardoc_code: string;       // prefixed: 'acf:' / 'tma:' / (none)
  ref_code: string | null;   // existing ref_code (will be preserved if set)
  sort_order: number;
};

export type AutofillItemResult = AutofillItemInput & {
  ref_code: string | null;
  filledBy:
    | "kept"           // user-set value preserved
    | "masterCode"     // TARDOC slave → ref = MasterCode
    | "additionalService" // TARDOC Zuschlag → ref = AdditionalServiceReferenceCode
    | "tmaSlave"       // TMA slave → ref = master TMA in group
    | "standalone"     // standalone main service, no ref needed
    | "needsManual"    // ref required but couldn't be auto-derived
    | "skipAcf"        // ACF item — only the user/grouper can supply the ICD
    | "unknown";       // catalog lookup failed
  baseCode?: string;   // when filledBy === "additionalService" or "tmaSlave"
};

export type AutofillSummary = {
  items: AutofillItemResult[];
  filled: number;
  kept: number;
  standalone: number;
  needsManual: number;
  skipAcf: number;
  unknown: number;
};

// Strip the prefix to get the bare code used in catalog lookups
function bareCode(prefixed: string): { type: "tardoc" | "acf" | "tma"; code: string } {
  if (prefixed.startsWith("acf:")) return { type: "acf", code: prefixed.slice(4) };
  if (prefixed.startsWith("tma:")) return { type: "tma", code: prefixed.slice(4) };
  return { type: "tardoc", code: prefixed };
}

/**
 * Run the autofill pass over an ordered list of group items. Returns the
 * decision for every item plus a summary. The caller is responsible for
 * persisting results.
 *
 * The function is robust: any catalog lookup failure for a single code is
 * isolated (the item is reported as "unknown") and never aborts the whole
 * pass.
 */
export async function autofillGroupRefs(
  rawItems: AutofillItemInput[],
  language: SumexLanguage = 2,
): Promise<AutofillSummary> {
  // Sort by sort_order ascending so the prior-walk has the right "earlier" set
  const items = [...rawItems].sort((a, b) => a.sort_order - b.sort_order);

  // ----- TARDOC catalog caches ---------------------------------------------
  const tardocExactCache = new Map<string, TardocServiceRecord | null>();
  async function lookupTardocExact(code: string): Promise<TardocServiceRecord | null> {
    if (tardocExactCache.has(code)) return tardocExactCache.get(code) ?? null;
    try {
      const res = await searchByCode(code, false, language);
      const exact = res.services.find((s) => s.code === code) ?? null;
      tardocExactCache.set(code, exact);
      return exact;
    } catch (err) {
      console.error(`[autofillGroupRefs] TARDOC SearchCode failed for ${code}:`, err);
      tardocExactCache.set(code, null);
      return null;
    }
  }

  const tardocAdditionalsCache = new Map<string, Map<string, string>>();
  async function getTardocAdditionals(baseCode: string): Promise<Map<string, string>> {
    const cached = tardocAdditionalsCache.get(baseCode);
    if (cached) return cached;
    const m = new Map<string, string>();
    try {
      const res = await searchAdditionalServices(baseCode, language);
      for (const svc of res.services) {
        // Per CHM: AdditionalServiceReferenceCode is the proper ref for this
        // additional service when used with `baseCode`.
        m.set(svc.code, svc.additionalServiceReferenceCode || baseCode);
      }
    } catch (err) {
      console.error(
        `[autofillGroupRefs] TARDOC SearchAdditionalService failed for ${baseCode}:`,
        err,
      );
    }
    tardocAdditionalsCache.set(baseCode, m);
    return m;
  }

  // ----- TMA catalog caches -------------------------------------------------
  // We need (a) the ServiceProperties of each TMA item to check IsNeedsRefCode,
  // and (b) for each potential master TMA, the set of slaves it accepts.
  const tmaExactCache = new Map<string, TmaServiceRecord | null>();
  async function lookupTmaExact(code: string): Promise<TmaServiceRecord | null> {
    if (tmaExactCache.has(code)) return tmaExactCache.get(code) ?? null;
    try {
      const res = await searchTma(code, "", "", 0, false, undefined, language as AcfLanguage);
      const exact = res.services.find((s) => s.code === code) ?? null;
      tmaExactCache.set(code, exact);
      return exact;
    } catch (err) {
      console.error(`[autofillGroupRefs] TMA SearchGeneral failed for ${code}:`, err);
      tmaExactCache.set(code, null);
      return null;
    }
  }

  const tmaSlavesCache = new Map<string, Set<string>>();
  async function getTmaSlaves(masterCode: string): Promise<Set<string>> {
    const cached = tmaSlavesCache.get(masterCode);
    if (cached) return cached;
    const set = new Set<string>();
    try {
      const res = await searchTmaSlaves(masterCode, undefined, language as AcfLanguage);
      for (const svc of res.services) set.add(svc.code);
    } catch (err) {
      console.error(
        `[autofillGroupRefs] TMA Search4Slaves failed for ${masterCode}:`,
        err,
      );
    }
    tmaSlavesCache.set(masterCode, set);
    return set;
  }

  // ----- Resolution loop ----------------------------------------------------
  const out: AutofillItemResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const existing = (item.ref_code ?? "").trim();
    const { type, code } = bareCode(item.tardoc_code);

    // 0. Preserve any user-set value
    if (existing !== "") {
      out.push({ ...item, filledBy: "kept" });
      continue;
    }

    // ACF items: cannot be auto-derived from the catalog. Leave as-is.
    if (type === "acf") {
      out.push({ ...item, filledBy: "skipAcf" });
      continue;
    }

    // TMA items: only auto-derive when IsNeedsRefCode bit is set
    if (type === "tma") {
      const exact = await lookupTmaExact(code);
      if (!exact) {
        out.push({ ...item, filledBy: "unknown" });
        continue;
      }
      const needsRef = (exact.serviceProperties & SERVICE_PROPERTY.IsNeedsRefCode) !== 0;
      if (!needsRef) {
        out.push({ ...item, filledBy: "standalone" });
        continue;
      }
      // Walk earlier TMA items most-recent-first looking for a master that
      // accepts this code as a slave.
      let matched: { ref: string; base: string } | null = null;
      for (let j = i - 1; j >= 0 && !matched; j--) {
        const prior = items[j];
        if (prior === item) continue;
        const priorBare = bareCode(prior.tardoc_code);
        if (priorBare.type !== "tma") continue;
        const slaves = await getTmaSlaves(priorBare.code);
        if (slaves.has(code)) matched = { ref: priorBare.code, base: priorBare.code };
      }
      if (matched) {
        out.push({ ...item, ref_code: matched.ref, filledBy: "tmaSlave", baseCode: matched.base });
      } else {
        out.push({ ...item, filledBy: "needsManual" });
      }
      continue;
    }

    // TARDOC items: MasterCode → SearchAdditionalService → standalone
    const exact = await lookupTardocExact(code);
    if (!exact) {
      out.push({ ...item, filledBy: "unknown" });
      continue;
    }
    if (exact.masterCode && exact.masterCode.trim() !== "") {
      out.push({
        ...item,
        ref_code: exact.masterCode,
        filledBy: "masterCode",
      });
      continue;
    }
    // Walk earlier TARDOC items most-recent-first
    let matched: { ref: string; base: string } | null = null;
    for (let j = i - 1; j >= 0 && !matched; j--) {
      const prior = items[j];
      if (prior === item) continue;
      const priorBare = bareCode(prior.tardoc_code);
      if (priorBare.type !== "tardoc") continue;
      if (priorBare.code === code) continue;
      const map = await getTardocAdditionals(priorBare.code);
      if (map.has(code)) matched = { ref: map.get(code) || priorBare.code, base: priorBare.code };
    }
    if (matched) {
      out.push({
        ...item,
        ref_code: matched.ref,
        filledBy: "additionalService",
        baseCode: matched.base,
      });
    } else {
      out.push({ ...item, filledBy: "standalone" });
    }
  }

  // Build summary
  const summary: AutofillSummary = {
    items: out,
    filled: 0,
    kept: 0,
    standalone: 0,
    needsManual: 0,
    skipAcf: 0,
    unknown: 0,
  };
  for (const r of out) {
    switch (r.filledBy) {
      case "kept": summary.kept++; break;
      case "masterCode":
      case "additionalService":
      case "tmaSlave":
        summary.filled++;
        break;
      case "standalone": summary.standalone++; break;
      case "needsManual": summary.needsManual++; break;
      case "skipAcf": summary.skipAcf++; break;
      case "unknown": summary.unknown++; break;
    }
  }
  return summary;
}
