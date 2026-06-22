import { NextResponse } from "next/server";

type NominatimResult = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    residential?: string;
    footway?: string;
    path?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country?: string;
    country_code?: string;
  };
};

function cityFromAddress(address: NominatimResult["address"]) {
  return address?.city || address?.town || address?.village || address?.municipality || "";
}

function streetFromAddress(address: NominatimResult["address"]) {
  return address?.road || address?.pedestrian || address?.residential || address?.footway || address?.path || "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  if (!query || query.length < 3 || query.length > 120) {
    return NextResponse.json({ suggestions: [] });
  }

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: "ch,fr,de,it,us",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "User-Agent": "MaisonTOA/1.0",
        Accept: "application/json",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!response.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const results = (await response.json()) as NominatimResult[];
    const seen = new Set<string>();

    const suggestions = results
      .map((result) => {
        const address = result.address || {};
        const street = streetFromAddress(address);
        const city = cityFromAddress(address);
        const label = result.display_name || [street, address.postcode, city, address.country].filter(Boolean).join(", ");

        return {
          label,
          street,
          number: address.house_number || "",
          postalCode: address.postcode || "",
          city,
          country: address.country || "",
          countryCode: address.country_code?.toUpperCase() || "",
        };
      })
      .filter((suggestion) => suggestion.street || suggestion.postalCode || suggestion.city)
      .filter((suggestion) => {
        const key = [
          suggestion.street,
          suggestion.number,
          suggestion.postalCode,
          suggestion.city,
          suggestion.country,
        ].join("|").toLowerCase();

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Address lookup failed:", error);
    return NextResponse.json({ suggestions: [] });
  }
}
