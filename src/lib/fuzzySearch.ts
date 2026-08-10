import Fuse from "fuse.js";

export type FuzzyPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dob?: string | null;
  [key: string]: unknown;
};

export type FuzzySearchOptions = {
  threshold?: number;
  includeScore?: boolean;
  keys?: string[];
};

const DEFAULT_KEYS = [
  { name: "first_name", weight: 2 },
  { name: "last_name", weight: 2 },
  { name: "fullName", weight: 2.5 },
  { name: "fullNameNoSpace", weight: 2 },
  { name: "email", weight: 2 },
  { name: "emailUsername", weight: 2 },
  { name: "phone", weight: 1 },
];

export function fuzzySearchPatients<T extends FuzzyPatient>(
  patients: T[],
  query: string,
  options: FuzzySearchOptions = {}
): T[] {
  if (!query.trim() || patients.length === 0) {
    return patients;
  }

  const { threshold = 0.4, keys = DEFAULT_KEYS } = options;

  const preparedData = patients.map((p) => ({
    ...p,
    fullName: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
    fullNameNoSpace: `${p.first_name ?? ""}${p.last_name ?? ""}`.toLowerCase(),
    emailUsername: (p.email ?? "").split("@")[0].toLowerCase(),
    phoneNormalized: (p.phone ?? "").replace(/\D/g, ""),
  }));

  const fuse = new Fuse(preparedData, {
    keys: [
      ...keys,
      { name: "phoneNormalized", weight: 1 },
    ],
    threshold,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true,
    findAllMatches: true,
  });

  const results = fuse.search(query);

  return results.map((r) => {
    const { fullName, fullNameNoSpace, emailUsername, phoneNormalized, ...original } = r.item;
    return original as unknown as T;
  });
}

export function generateLooseSearchPatterns(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const patterns: string[] = [];
  const isEmailQuery = trimmed.includes("@");

  patterns.push(`%${trimmed}%`);

  if (isEmailQuery) {
    const username = trimmed.split("@")[0];
    if (username.length >= 2) {
      patterns.push(`%${username}%`);
      const usernameParts = username.split(/[._-]/).filter((p) => p.length >= 2);
      for (const part of usernameParts) {
        patterns.push(`%${part}%`);
      }
    }
  } else {
    const words = trimmed.split(/\s+/).filter((w) => w.length >= 2);
    for (const word of words) {
      patterns.push(`%${word}%`);
      if (word.length >= 4) {
        patterns.push(`%${word.slice(0, -1)}%`);
      }
    }
  }

  return [...new Set(patterns)];
}

export function buildFuzzyOrConditions(query: string, fields: string[]): string {
  const patterns = generateLooseSearchPatterns(query);
  const conditions: string[] = [];
  for (const pattern of patterns) {
    for (const field of fields) {
      conditions.push(`${field}.ilike.${pattern}`);
    }
  }
  return conditions.join(",");
}
