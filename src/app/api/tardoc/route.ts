import { NextRequest, NextResponse } from "next/server";
import {
  TARDOC_TARIFF_ITEMS,
  TARDOC_MEDICINES,
  CANTON_TAX_POINT_VALUES,
  DEFAULT_CANTON,
  COST_NEUTRALITY_FACTOR,
  calculateTardocPrice,
  getTardocTariffItem,
  searchTardocTariffs,
  searchTardocMedicines,
  type SwissCanton,
  type TardocTariffItem,
  type TardocMedicine,
} from "@/lib/tardoc";

export const runtime = "nodejs";

type TardocApiResponse = {
  success: boolean;
  data?: {
    tariffs?: TardocTariffItem[];
    medicines?: TardocMedicine[];
    cantons?: { code: SwissCanton; taxPointValue: number }[];
    calculatedPrice?: number;
    tariff?: TardocTariffItem | null;
    medicine?: TardocMedicine | null;
  };
  error?: string;
  meta?: {
    canton: SwissCanton;
    taxPointValue: number;
    costNeutralityFactor: number;
    totalCount: number;
  };
};

/**
 * GET /api/tardoc
 * Query params:
 * - action: "tariffs" | "medicines" | "cantons" | "calculate" | "tariff" | "medicine"
 * - search: search query for tariffs or medicines
 * - code: TARDOC code for single tariff lookup
 * - medicineId: medicine ID for single medicine lookup
 * - canton: Swiss canton code for price calculation
 * - taxPoints: number of tax points for calculation
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action") || "tariffs";
    const search = searchParams.get("search") || "";
    const code = searchParams.get("code") || "";
    const medicineId = searchParams.get("medicineId") || "";
    const canton = (searchParams.get("canton") || DEFAULT_CANTON) as SwissCanton;
    const taxPointsStr = searchParams.get("taxPoints") || "";

    // Validate canton
    if (!CANTON_TAX_POINT_VALUES[canton]) {
      return NextResponse.json(
        { success: false, error: "Invalid canton code" } as TardocApiResponse,
        { status: 400 }
      );
    }

    const taxPointValue = CANTON_TAX_POINT_VALUES[canton];

    switch (action) {
      case "tariffs": {
        const tariffs = search
          ? searchTardocTariffs(search)
          : TARDOC_TARIFF_ITEMS.filter((t) => t.isActive);

        // Enrich with calculated prices
        const enrichedTariffs = tariffs.map((tariff) => ({
          ...tariff,
          calculatedPrice: calculateTardocPrice(tariff.taxPoints, canton),
        }));

        return NextResponse.json({
          success: true,
          data: { tariffs: enrichedTariffs },
          meta: {
            canton,
            taxPointValue,
            costNeutralityFactor: COST_NEUTRALITY_FACTOR,
            totalCount: enrichedTariffs.length,
          },
        } as TardocApiResponse);
      }

      case "medicines": {
        const medicines = search
          ? searchTardocMedicines(search)
          : TARDOC_MEDICINES.filter((m) => m.isActive);

        return NextResponse.json({
          success: true,
          data: { medicines },
          meta: {
            canton,
            taxPointValue,
            costNeutralityFactor: COST_NEUTRALITY_FACTOR,
            totalCount: medicines.length,
          },
        } as TardocApiResponse);
      }

      case "cantons": {
        const cantons = Object.entries(CANTON_TAX_POINT_VALUES).map(
          ([code, value]) => ({
            code: code as SwissCanton,
            taxPointValue: value,
          })
        );

        return NextResponse.json({
          success: true,
          data: { cantons },
          meta: {
            canton: DEFAULT_CANTON,
            taxPointValue: CANTON_TAX_POINT_VALUES[DEFAULT_CANTON],
            costNeutralityFactor: COST_NEUTRALITY_FACTOR,
            totalCount: cantons.length,
          },
        } as TardocApiResponse);
      }

      case "calculate": {
        if (!taxPointsStr) {
          return NextResponse.json(
            { success: false, error: "taxPoints parameter is required" } as TardocApiResponse,
            { status: 400 }
          );
        }

        const taxPoints = parseFloat(taxPointsStr);
        if (isNaN(taxPoints) || taxPoints < 0) {
          return NextResponse.json(
            { success: false, error: "Invalid taxPoints value" } as TardocApiResponse,
            { status: 400 }
          );
        }

        const calculatedPrice = calculateTardocPrice(taxPoints, canton);

        return NextResponse.json({
          success: true,
          data: { calculatedPrice },
          meta: {
            canton,
            taxPointValue,
            costNeutralityFactor: COST_NEUTRALITY_FACTOR,
            totalCount: 1,
          },
        } as TardocApiResponse);
      }

      case "tariff": {
        if (!code) {
          return NextResponse.json(
            { success: false, error: "code parameter is required" } as TardocApiResponse,
            { status: 400 }
          );
        }

        const tariff = getTardocTariffItem(code);

        if (tariff) {
          const enrichedTariff = {
            ...tariff,
            calculatedPrice: calculateTardocPrice(tariff.taxPoints, canton),
          };

          return NextResponse.json({
            success: true,
            data: { tariff: enrichedTariff },
            meta: {
              canton,
              taxPointValue,
              costNeutralityFactor: COST_NEUTRALITY_FACTOR,
              totalCount: 1,
            },
          } as TardocApiResponse);
        }

        return NextResponse.json({
          success: true,
          data: { tariff: null },
          meta: {
            canton,
            taxPointValue,
            costNeutralityFactor: COST_NEUTRALITY_FACTOR,
            totalCount: 0,
          },
        } as TardocApiResponse);
      }

      case "medicine": {
        if (!medicineId) {
          return NextResponse.json(
            { success: false, error: "medicineId parameter is required" } as TardocApiResponse,
            { status: 400 }
          );
        }

        const medicine = TARDOC_MEDICINES.find((m) => m.id === medicineId && m.isActive);

        return NextResponse.json({
          success: true,
          data: { medicine: medicine || null },
          meta: {
            canton,
            taxPointValue,
            costNeutralityFactor: COST_NEUTRALITY_FACTOR,
            totalCount: medicine ? 1 : 0,
          },
        } as TardocApiResponse);
      }

      default:
        return NextResponse.json(
          { success: false, error: "Invalid action parameter" } as TardocApiResponse,
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error in /api/tardoc", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" } as TardocApiResponse,
      { status: 500 }
    );
  }
}
