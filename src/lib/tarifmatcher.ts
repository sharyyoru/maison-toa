/**
 * Client for the official OAAT TarifMatcher service (tarifmatcher-server/,
 * deployed on Google Cloud Run). The grouper is a Java library and Vercel's
 * Node runtime has no JVM, so it runs as its own service.
 *
 * Without TARIFMATCHER_URL the app groups with the built-in PCS evaluator
 * (acfGrouper), which reads the same official PCS files.
 */
import { runLocalGrouper, priceGroup, type GrouperResponse } from "@/lib/acfGrouper";
import { tariffYearFor } from "@/lib/tariffYear";

export type TarifmatcherService = { code: string; side?: "" | "L" | "R" | "B"; number?: number };

export type GrouperCase = {
  services: TarifmatcherService[];
  diagnoses: string[];
  ageYears?: number | null;
  sex?: "M" | "W" | null;
  caseId?: string;
  /** Treatment date (YYYY-MM-DD); the service groups with that year's tariff. */
  serviceDate: string;
  applicationYear: number;
};

export type GrouperResult = {
  flatRate: string | null;
  costWeight: number | null;
  mappedTardocs: string[];
  applicationYear: number;
  warnings: string[];
};

export function tarifmatcherConfigured(): boolean {
  return !!process.env.TARIFMATCHER_URL;
}

export async function runTarifmatcher(input: GrouperCase): Promise<GrouperResult> {
  const base = process.env.TARIFMATCHER_URL;
  if (!base) throw new Error("TARIFMATCHER_URL is not set");

  const secret = process.env.TARIFMATCHER_SECRET?.trim();
  const response = await fetch(`${base.replace(/\/$/, "")}/group`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-tarifmatcher-secret": secret } : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let json: {
    ok?: boolean;
    error?: string;
    applicationYear?: number;
    warnings?: string[];
    results?: Array<{ flatRate?: string | null; costWeight?: number | null; mappedTardocs?: string[] }>;
  } = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`TarifMatcher returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `TarifMatcher failed (HTTP ${response.status})`);
  }
  if (json.applicationYear !== input.applicationYear) {
    throw new Error(`TarifMatcher grouped with ${json.applicationYear} tariffs, expected ${input.applicationYear}`);
  }

  const first = json.results?.[0];
  return {
    flatRate: first?.flatRate ?? null,
    costWeight: first?.costWeight ?? null,
    mappedTardocs: first?.mappedTardocs ?? [],
    applicationYear: json.applicationYear,
    warnings: json.warnings ?? [],
  };
}

const SIDE: Record<string, TarifmatcherService["side"]> = { "1": "L", "2": "R", "3": "B", L: "L", R: "R", B: "B" };

/**
 * Groups a case with the official Java TarifMatcher when the service is
 * configured, else with the built-in evaluator. The official result wins on
 * a disagreement; if the service is down the built-in result is returned
 * with a warning, so billing keeps working.
 */
export async function groupFlatRate(input: Parameters<typeof runLocalGrouper>[0]): Promise<GrouperResponse> {
  const local = runLocalGrouper(input);
  if (!tarifmatcherConfigured() || !input.icdCode) return local;

  const year = Number(tariffYearFor(input.date));
  const serviceDate = input.date?.slice(0, 10) || `${year}-01-01`;
  try {
    const official = await runTarifmatcher({
      services: input.services.map((s) => ({
        code: s.code.trim().toUpperCase(),
        side: SIDE[String(s.side ?? "").toUpperCase()] ?? "",
        number: Number(s.quantity) || 1,
      })),
      diagnoses: [input.icdCode.trim().toUpperCase()],
      ageYears: local.ageYears,
      sex: input.patientSex === 1 ? "W" : input.patientSex === 0 ? "M" : null,
      serviceDate,
      applicationYear: year,
    });
    const warnings = [...local.warnings, ...official.warnings];
    if (official.flatRate === local.groupingStatusList || (!official.flatRate && !local.success)) {
      return { ...local, grouperSource: "tarifmatcher", warnings };
    }
    const priced = priceGroup(official.flatRate, serviceDate);
    return {
      ...local,
      success: !!official.flatRate,
      groupingStatusList: official.flatRate || "no-group",
      numACF: priced.acfCodes.length,
      acfCodes: priced.acfCodes,
      errors: priced.errors,
      decisionPath: [],
      chapters: [],
      capAssignment: null,
      grouperSource: "tarifmatcher",
      warnings: [...warnings, `Official TarifMatcher grouped ${official.flatRate ?? "nothing"}; built-in grouper said ${local.groupingStatusList}.`],
    };
  } catch (e) {
    return {
      ...local,
      warnings: [...local.warnings, `TarifMatcher service unavailable, built-in grouper used: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}
