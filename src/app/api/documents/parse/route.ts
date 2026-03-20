import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseDocxToSlate } from '@/lib/docx/parser';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Parse a .docx file from Supabase storage to Slate.js format
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bucket, path } = body;

    if (!bucket || !path) {
      return NextResponse.json(
        { error: 'Bucket and path are required' },
        { status: 400 }
      );
    }

    // Download file from Supabase
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download file from storage' },
        { status: 404 }
      );
    }

    // Convert to ArrayBuffer
    const buffer = await fileData.arrayBuffer();

    // Parse to Slate format
    const slateNodes = await parseDocxToSlate(buffer);

    return NextResponse.json({
      success: true,
      nodes: slateNodes,
    });
  } catch (error) {
    console.error('Error parsing document:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse document',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
