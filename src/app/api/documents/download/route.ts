import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket") || "patient-documents";
    const path = searchParams.get("path");
    const patientId = searchParams.get("patientId");

    if (!path) {
      return NextResponse.json(
        { error: "Path is required" },
        { status: 400 }
      );
    }

    console.log(`Downloading from bucket: ${bucket}, path: ${path}`);

    let downloadPath = path;
    let { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .download(downloadPath);

    if (
      (error || !data) &&
      bucket === "patient-documents" &&
      patientId &&
      !path.startsWith(`${patientId}/`)
    ) {
      downloadPath = [patientId, path].filter(Boolean).join("/");
      const retry = await supabaseAdmin.storage
        .from(bucket)
        .download(downloadPath);
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      console.error("Download error:", error);
      return NextResponse.json(
        { error: `Failed to download: ${error?.message || 'File not found'}` },
        { status: 404 }
      );
    }

    // Return the file as a blob
    const arrayBuffer = await data.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': data.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${downloadPath.split('/').pop()}"`,
      },
    });
  } catch (error) {
    console.error("Error downloading document:", error);
    return NextResponse.json(
      { error: "Failed to download document" },
      { status: 500 }
    );
  }
}
