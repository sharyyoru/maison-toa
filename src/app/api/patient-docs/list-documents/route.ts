import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET_NAME = "patient-docs";
const PATIENT_DOCUMENTS_BUCKET = "patient_document";

type DocumentFile = {
  name: string;
  path: string;
  size: number | null;
  mimeType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  publicUrl: string;
  source: "patient-docs"; // To distinguish from patient_document bucket
};

// Parse folder name pattern to extract first/last name
function parseFolderName(folderName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const cleanName = folderName.replace(/\.[^.]+$/, "");
  const underscoreParts = cleanName.split("_");
  
  if (underscoreParts.length >= 4) {
    return { firstName: underscoreParts[1], lastName: underscoreParts[2] };
  }
  if (underscoreParts.length === 3) {
    return { firstName: underscoreParts[1], lastName: underscoreParts[2] };
  }
  if (underscoreParts.length === 2) {
    return { firstName: underscoreParts[0], lastName: underscoreParts[1] };
  }
  
  const hyphenParts = cleanName.split("-");
  if (hyphenParts.length >= 2) {
    return { firstName: hyphenParts[0], lastName: hyphenParts[1] };
  }
  
  const spaceParts = cleanName.split(/\s+/);
  if (spaceParts.length >= 2) {
    return { firstName: spaceParts[0], lastName: spaceParts[spaceParts.length - 1] };
  }
  
  return { firstName: null, lastName: null };
}

// Helper to fetch all folders with pagination
async function fetchAllFolders(): Promise<{ name: string; id: string | null }[]> {
  const allFolders: { name: string; id: string | null }[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: folders, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .list("", { limit: PAGE_SIZE, offset });

    if (error) {
      console.error("Error listing folders at offset", offset, error);
      break;
    }

    if (!folders || folders.length === 0) {
      hasMore = false;
    } else {
      allFolders.push(...folders.map(f => ({ name: f.name, id: f.id })));
      offset += folders.length;
      hasMore = folders.length === PAGE_SIZE;
    }
  }

  return allFolders;
}

// Helper to fetch all file names from patient_document bucket recursively
async function fetchAllPatientDocumentKeys(patientId: string): Promise<Set<string>> {
  const keys = new Set<string>();

  async function listRecursive(prefix: string) {
    const { data, error } = await supabaseAdmin.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .list(prefix, { limit: 1000 });

    if (error || !data) return;

    for (const item of data as any[]) {
      if (item.name === ".keep") continue;

      // Folder detection: be safer than item.id === null
      const isFolder = item.id == null && item.metadata == null;

      if (isFolder) {
        const folderPath = prefix ? `${prefix}/${item.name}` : item.name;
        await listRecursive(folderPath);
        continue;
      }

      // ✅ Dedup key = normalized filename only
      const normalizedName = normalizeForMatch(item.name);
      keys.add(normalizedName);
    }
  }

  await listRecursive(patientId);
  return keys;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, patientId } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "firstName and lastName are required" }, { status: 400 });
    }
    
    // Fetch all file names from patient_document bucket for deduplication
    const existingKeys = patientId
      ? await fetchAllPatientDocumentKeys(patientId)
      : new Set<string>();

    console.log("Existing keys in patient_document:", Array.from(existingKeys));
    
    const searchFirstNameLower = firstName.toLowerCase().trim();
    const searchLastNameLower = lastName.toLowerCase().trim();

    // Fetch all folders from patient-docs bucket
    const folders = await fetchAllFolders();

    if (folders.length === 0) {
      return NextResponse.json({ files: [] });
    }

    const documentFiles: DocumentFile[] = [];

    for (const folder of folders) {
      // Skip files at root level
      if (/\.(pdf|jpg|jpeg|png|gif|txt|doc|docx)$/i.test(folder.name)) continue;

      const folderInfo = parseFolderName(folder.name);
      const folderFirstName = folderInfo.firstName?.toLowerCase().trim() || "";
      const folderLastName = folderInfo.lastName?.toLowerCase().trim() || "";

      // Check if folder matches the patient name
      const directMatch = 
        (folderFirstName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderFirstName)) &&
        (folderLastName.includes(searchLastNameLower) || searchLastNameLower.includes(folderLastName));
      
      const reverseMatch = 
        (folderFirstName.includes(searchLastNameLower) || searchLastNameLower.includes(folderFirstName)) &&
        (folderLastName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderLastName));
      
      const folderNameLower = folder.name.toLowerCase();
      const containsBothNames = folderNameLower.includes(searchFirstNameLower) && folderNameLower.includes(searchLastNameLower);

      if (!directMatch && !reverseMatch && !containsBothNames) continue;

      // Found matching patient folder - now look for 5_Documents subfolder
      const documentsPath = `${folder.name}/5_Documents`;
      
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list(documentsPath, { limit: 200 });

      if (listError || !files) {
        // 5_Documents folder doesn't exist for this patient - that's OK
        continue;
      }

      // Process each file in 5_Documents
      for (const file of files) {
        if (file.name === ".keep" || file.name === ".emptyFolderPlaceholder") continue;

        const filePath = `${documentsPath}/${file.name}`;

        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .createSignedUrl(filePath, 3600);

        if (signedUrlError || !signedUrlData?.signedUrl) continue;

        const legacyDisplayName = file.name.replace(/_/g, "-");
        const normalizedLegacyName = normalizeForMatch(legacyDisplayName);

        const legacySize = (file as any).metadata?.size ?? null;

        // ✅ Dedup by normalized filename only
        if (existingKeys.has(normalizedLegacyName)) {
          console.log("Skipping duplicate legacy file (name):", legacyDisplayName);
          continue;
        }

        documentFiles.push({
          name: legacyDisplayName,          // ✅ UI shows '-' instead of '_'
          path: filePath,                   // ✅ still points to the real storage object
          size: legacySize,
          mimeType: (file as any).metadata?.mimetype || null,
          createdAt: (file as any).created_at || null,
          updatedAt: (file as any).updated_at || null,
          publicUrl: signedUrlData.signedUrl,
          source: "patient-docs",
        });
      }
    }

    return NextResponse.json({ files: documentFiles });
  } catch (error: any) {
    console.error("Error in list-documents POST:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

function normalizeForMatch(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}
