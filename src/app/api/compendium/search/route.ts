import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ products: [] });
  }

  try {
    const url = `https://compendium.ch/search/autocomplete?q=${encodeURIComponent(q.trim())}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ products: [] });
    }

    const data = await response.json();

    // Flatten brands → products into a single list of { label, productNumber }
    const products: { label: string; productNumber: number }[] = [];

    if (Array.isArray(data.brands)) {
      for (const brand of data.brands) {
        if (Array.isArray(brand.products)) {
          for (const p of brand.products) {
            products.push({
              label: p.description as string,
              productNumber: p.productNumber as number,
            });
          }
        }
      }
    }

    // Also include substance names at the top
    if (Array.isArray(data.substances)) {
      for (const s of data.substances) {
        if (s.description) {
          // Only add substance if not already present
          const exists = products.some(
            (p) => p.label.toLowerCase() === (s.description as string).toLowerCase(),
          );
          if (!exists) {
            products.unshift({
              label: s.description as string,
              productNumber: s.substanceNumber as number,
            });
          }
        }
      }
    }

    return NextResponse.json({ products: products.slice(0, 50) });
  } catch {
    return NextResponse.json({ products: [] });
  }
}
