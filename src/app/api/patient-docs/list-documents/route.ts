import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET_NAME = "patient-docs";
const PATIENT_DOCUMENTS_BUCKET = "patient-documents";

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

// Search the root by patient name instead of paging through every patient folder.
async function fetchMatchingFolders(firstName: string, lastName: string): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const terms = [...new Set([firstName, lastName].map((name) => name.trim()).filter(Boolean))];
  const results = await Promise.all(terms.map(async (search) => {
    const names: string[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list("", { search, limit: PAGE_SIZE, offset });
      if (error) throw error;
      const page = data ?? [];
      names.push(...page.filter((entry) => entry.id == null).map((entry) => entry.name));
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }
    return names;
  }));
  return [...new Set(results.flat())];
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
    
    const searchFirstNameLower = firstName.toLowerCase().trim();
    const searchLastNameLower = lastName.toLowerCase().trim();

    const folders = await fetchMatchingFolders(firstName, lastName);
    if (folders.length === 0) {
      return NextResponse.json({ files: [] });
    }

    const matchingFolders = folders.filter((folder) => {
      // Skip files at root level
      if (/\.(pdf|jpg|jpeg|png|gif|txt|doc|docx)$/i.test(folder)) return false;

      const folderInfo = parseFolderName(folder);
      const folderFirstName = folderInfo.firstName?.toLowerCase().trim() || "";
      const folderLastName = folderInfo.lastName?.toLowerCase().trim() || "";

      // Check if folder matches the patient name
      const directMatch = 
        (folderFirstName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderFirstName)) &&
        (folderLastName.includes(searchLastNameLower) || searchLastNameLower.includes(folderLastName));
      
      const reverseMatch = 
        (folderFirstName.includes(searchLastNameLower) || searchLastNameLower.includes(folderFirstName)) &&
        (folderLastName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderLastName));
      
      const folderNameLower = folder.toLowerCase();
      const containsBothNames = folderNameLower.includes(searchFirstNameLower) && folderNameLower.includes(searchLastNameLower);

      return directMatch || reverseMatch || containsBothNames;
    });

    const listedFiles = await Promise.all(matchingFolders.map(async (folder) => {

      // Found matching patient folder - now look for 5_Documents subfolder
      const documentsPath = `${folder}/5_Documents`;
      
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list(documentsPath, { limit: 200 });

      if (listError || !files) {
        // 5_Documents folder doesn't exist for this patient - that's OK
        return [];
      }

      return files
        .filter((file) => file.name !== ".keep" && file.name !== ".emptyFolderPlaceholder")
        .map((file) => ({ file, path: `${documentsPath}/${file.name}` }));
    }));

    const candidates = listedFiles.flat();
    if (candidates.length === 0) return NextResponse.json({ files: [] });

    const existingKeys = patientId
      ? await fetchAllPatientDocumentKeys(patientId)
      : new Set<string>();
    const uniqueFiles = candidates.filter(({ file }) =>
      !existingKeys.has(normalizeForMatch(file.name))
    );
    if (uniqueFiles.length === 0) return NextResponse.json({ files: [] });

    const { data: signedUrls, error: signedUrlError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrls(uniqueFiles.map(({ path }) => path), 3600);
    if (signedUrlError || !signedUrls) throw signedUrlError || new Error("Failed to sign legacy documents");
    const urlByPath = new Map(signedUrls.map((item) => [item.path, item.signedUrl]));

    const documentFiles: DocumentFile[] = uniqueFiles.flatMap(({ file, path }) => {
      const publicUrl = urlByPath.get(path);
      if (!publicUrl) return [];
      return [{
        name: file.name.replace(/_/g, "-"),
        path,
        size: (file as any).metadata?.size ?? null,
        mimeType: (file as any).metadata?.mimetype || null,
        createdAt: (file as any).created_at || null,
        updatedAt: (file as any).updated_at || null,
        publicUrl,
        source: "patient-docs" as const,
      }];
    });

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
