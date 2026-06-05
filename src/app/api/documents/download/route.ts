import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket") || "patient-documents";
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Path is required" },
        { status: 400 }
      );
    }

    console.log(`Downloading from bucket: ${bucket}, path: ${path}`);

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);

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
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
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
