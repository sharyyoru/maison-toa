import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MediDataClient } from "@/lib/medidataClient";

type MediDataConfigRow = {
  clinic_gln: string;
  clinic_zsr: string;
  clinic_name: string;
  medidata_endpoint_url: string | null;
  medidata_client_id: string | null;
  medidata_username: string | null;
  medidata_password_encrypted: string | null;
  is_test_mode: boolean;
};

/**
 * GET /api/medidata/test-connection
 * Test connectivity to MediData Box
 */
export async function GET() {
  try {
    // Get MediData config
    const { data: configData, error: configError } = await supabaseAdmin
      .from("medidata_config")
      .select("*")
      .limit(1)
      .single();

    if (configError || !configData) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: "MediData configuration not found in database",
        details: {
          hasEndpoint: false,
          hasClientId: false,
          hasCredentials: false,
        },
      });
    }

    const config = configData as MediDataConfigRow;

    // Check configuration completeness
    const configDetails = {
      hasEndpoint: Boolean(config.medidata_endpoint_url),
      hasClientId: Boolean(config.medidata_client_id),
      hasCredentials: Boolean(config.medidata_username && config.medidata_password_encrypted),
      isTestMode: config.is_test_mode,
      clinicGln: config.clinic_gln,
      clinicName: config.clinic_name,
    };

    if (!configDetails.hasEndpoint || !configDetails.hasClientId || !configDetails.hasCredentials) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: "MediData configuration incomplete",
        details: configDetails,
      });
    }

    // Create MediData client and test connection
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url!,
      clientId: config.medidata_client_id!,
      username: config.medidata_username!,
      password: config.medidata_password_encrypted!,
      isTestMode: config.is_test_mode,
    });

    const testResult = await medidataClient.testConnection();

    return NextResponse.json({
      success: testResult.success,
      configured: true,
      message: testResult.message,
      details: configDetails,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error testing MediData connection:", error);
    return NextResponse.json({
      success: false,
      configured: false,
      message: error instanceof Error ? error.message : "Unknown error",
      details: null,
    });
  }
}

/**
 * POST /api/medidata/test-connection
 * Test connection with custom credentials (for settings page)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpointUrl, clientId, username, password } = body;

    if (!endpointUrl || !clientId || !username || !password) {
      return NextResponse.json({
        success: false,
        message: "All credentials are required: endpointUrl, clientId, username, password",
      });
    }

    // Create MediData client with provided credentials
    const medidataClient = new MediDataClient({
      baseUrl: endpointUrl,
      clientId,
      username,
      password,
      isTestMode: true,
    });

    const testResult = await medidataClient.testConnection();

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error testing MediData connection:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
