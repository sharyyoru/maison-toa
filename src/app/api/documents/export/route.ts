import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { slateToDocx } from '@/lib/docx/serializer';
import { SlateNode } from '@/lib/docx/parser';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Export Slate.js nodes to .docx and upload to Supabase storage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodes, bucket, path, filename } = body;

    if (!nodes || !bucket || !path) {
      return NextResponse.json(
        { error: 'Nodes, bucket, and path are required' },
        { status: 400 }
      );
    }

    // Convert Slate nodes to .docx blob
    const docxBlob = await slateToDocx(nodes as SlateNode[], filename);

    // Convert blob to buffer
    const buffer = await docxBlob.arrayBuffer();

    // Upload to Supabase storage
    const { data, error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      path: data.path,
    });
  } catch (error) {
    console.error('Error exporting document:', error);
    return NextResponse.json(
      {
        error: 'Failed to export document',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
