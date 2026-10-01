import { supabaseClient } from "@/lib/supabaseClient";

type StorageListResult = Awaited<ReturnType<ReturnType<typeof supabaseClient.storage.from>["list"]>>;
export type PatientStorageEntry = NonNullable<StorageListResult["data"]>[number];

type LegacyDocument = {
  name: string;
  path: string;
  size: number | null;
  mimeType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  publicUrl: string;
};

const primaryCache = new Map<string, { result: StorageListResult; loadedAt: number }>();
const primaryPending = new Map<string, Promise<StorageListResult>>();
const legacyCache = new Map<string, { files: LegacyDocument[]; loadedAt: number }>();
const legacyPending = new Map<string, Promise<LegacyDocument[]>>();
const CACHE_MS = 2 * 60 * 1000;
let cacheEpoch = 0;

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    cacheEpoch += 1;
    primaryCache.clear();
    primaryPending.clear();
    legacyCache.clear();
    legacyPending.clear();
  }
});

function primaryKey(patientId: string, prefix: string) {
  return `${patientId}/${prefix}`;
}

export function cachedPatientDocuments(patientId: string, prefix: string) {
  const entry = primaryCache.get(primaryKey(patientId, prefix));
  return entry && Date.now() - entry.loadedAt < CACHE_MS ? entry.result : null;
}

export function seedPatientDocuments(patientId: string, prefix: string, data: PatientStorageEntry[]) {
  primaryCache.set(primaryKey(patientId, prefix), {
    result: { data, error: null } as StorageListResult,
    loadedAt: Date.now(),
  });
}

export async function listPatientDocuments(patientId: string, prefix = "", force = false) {
  const key = primaryKey(patientId, prefix);
  if (!force) {
    const cached = cachedPatientDocuments(patientId, prefix);
    if (cached) return cached;
    const pending = primaryPending.get(key);
    if (pending) return pending;
  } else {
    await primaryPending.get(key)?.catch(() => undefined);
  }

  const startedAt = Date.now();
  const epoch = cacheEpoch;
  const request = supabaseClient.storage.from("patient-documents").list(
    [patientId, prefix].filter(Boolean).join("/"),
    { limit: 200, offset: 0, sortBy: { column: "name", order: "asc" } },
  ).then((result) => {
    if (epoch === cacheEpoch && !result.error && (!primaryCache.has(key) || primaryCache.get(key)!.loadedAt <= startedAt)) {
      primaryCache.set(key, { result, loadedAt: Date.now() });
    }
    return result;
  }).finally(() => { if (primaryPending.get(key) === request) primaryPending.delete(key); });
  primaryPending.set(key, request);
  return request;
}

function legacyKey(patientId: string, patientName: string) {
  return `${patientId}:${patientName}`;
}

export function cachedLegacyDocuments(patientId: string, patientName: string) {
  const entry = legacyCache.get(legacyKey(patientId, patientName));
  return entry && Date.now() - entry.loadedAt < CACHE_MS ? entry.files : null;
}

export async function listLegacyDocuments(patientId: string, patientName: string, force = false) {
  const key = legacyKey(patientId, patientName);
  if (!force) {
    const cached = cachedLegacyDocuments(patientId, patientName);
    if (cached) return cached;
    const pending = legacyPending.get(key);
    if (pending) return pending;
  } else {
    await legacyPending.get(key)?.catch(() => undefined);
  }

  const [firstName, ...lastNameParts] = patientName.trim().split(/\s+/);
  if (!firstName || lastNameParts.length === 0) return [];

  const epoch = cacheEpoch;
  const request = fetch("/api/patient-docs/list-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstName, lastName: lastNameParts.join(" "), patientId }),
  }).then(async (response) => {
    if (!response.ok) throw new Error("Failed to load archived documents");
    const payload = await response.json();
    const files: LegacyDocument[] = payload.files || [];
    if (epoch === cacheEpoch) legacyCache.set(key, { files, loadedAt: Date.now() });
    return files;
  }).finally(() => { if (legacyPending.get(key) === request) legacyPending.delete(key); });
  legacyPending.set(key, request);
  return request;
}

export function prefetchPatientDocuments(patientId: string, patientName: string) {
  void listPatientDocuments(patientId).catch(() => undefined);
  void listLegacyDocuments(patientId, patientName).catch(() => undefined);
}
