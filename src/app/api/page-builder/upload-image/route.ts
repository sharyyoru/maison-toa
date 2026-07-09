import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET_NAME = "page-builder-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function sanitizeBaseName(name: string) {
  return name
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function ensureBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw listError;

  if (buckets?.some((bucket) => bucket.name === BUCKET_NAME)) {
    return;
  }

  const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  });

  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please upload an image file." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Image must be 10MB or smaller." }, { status: 400 });
    }

    await ensureBucket();

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const safeBaseName = sanitizeBaseName(file.name) || "image";
    const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeBaseName}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(path);

    return NextResponse.json({
      path,
      url: data.publicUrl,
    });
  } catch (error) {
    console.error("Page builder image upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image." },
      { status: 500 }
    );
  }
}
