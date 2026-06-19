import { NextResponse } from "next/server";

type PostalLookupResponse = {
  country?: string;
  "country abbreviation"?: string;
  places?: Array<{
    "place name"?: string;
    state?: string;
    "state abbreviation"?: string;
  }>;
};

const COUNTRY_LABELS: Record<string, string> = {
  ch: "Switzerland",
  fr: "France",
  de: "Germany",
  it: "Italy",
  us: "United States",
};

function normalizePlaceName(placeName: string, countryCode: string) {
  const trimmed = placeName.trim();

  if (countryCode === "ch") {
    return trimmed.replace(/\s+\d+.*$/, "").trim();
  }

  return trimmed;
}

function orderedCountryCandidates(postalCode: string, requestedCountry: string | null) {
  const normalizedRequested = requestedCountry?.trim().toLowerCase();
  const requestedCode = Object.entries(COUNTRY_LABELS).find(
    ([code, label]) =>
      normalizedRequested === code ||
      normalizedRequested === label.toLowerCase(),
  )?.[0];

  const candidates = postalCode.length === 4
    ? ["ch", "fr", "de", "it", "us"]
    : ["fr", "de", "it", "us", "ch"];

  return requestedCode
    ? [requestedCode, ...candidates.filter((code) => code !== requestedCode)]
    : candidates;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postalCode = searchParams.get("postalCode")?.trim();
  const requestedCountry = searchParams.get("country");

  if (!postalCode || !/^[A-Za-z0-9 -]{3,10}$/.test(postalCode)) {
    return NextResponse.json({ error: "Invalid postal code" }, { status: 400 });
  }

  for (const countryCode of orderedCountryCandidates(postalCode, requestedCountry)) {
    try {
      const response = await fetch(
        `https://api.zippopotam.us/${countryCode}/${encodeURIComponent(postalCode)}`,
        { next: { revalidate: 60 * 60 * 24 * 30 } },
      );

      if (!response.ok) continue;

      const data = (await response.json()) as PostalLookupResponse;
      const cities = Array.from(
        new Set(
          (data.places || [])
            .map((place) => {
              const placeName = place["place name"];
              return placeName ? normalizePlaceName(placeName, countryCode) : null;
            })
            .filter((placeName): placeName is string => Boolean(placeName)),
        ),
      ).sort((a, b) => a.localeCompare(b));

      if (cities.length > 0) {
        return NextResponse.json({
          postalCode,
          city: cities[0],
          cities,
          country: data.country || COUNTRY_LABELS[countryCode] || countryCode.toUpperCase(),
          countryCode: (data["country abbreviation"] || countryCode).toUpperCase(),
        });
      }
    } catch (error) {
      console.error("Postal code lookup failed:", error);
    }
  }

  return NextResponse.json({ error: "Postal code not found" }, { status: 404 });
}
