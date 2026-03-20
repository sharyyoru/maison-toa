import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inflateSync, inflateRawSync } from "zlib";

// Force Node.js runtime and dynamic rendering
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET_NAME = "patient-docs";

type ParsedPdfDocument = {
  folderName: string;
  fileName: string;
  fileType: "ap" | "af" | "notes" | "consultation";
  content: string;
  firstName: string | null;
  lastName: string | null;
};

type DebugInfo = {
  bucket: string;
  searchFirstName: string | null;
  searchLastName: string | null;
  foldersFound: number;
  folderNames: string[];
  parsedFolders: Array<{ name: string; firstName: string | null; lastName: string | null; matched: boolean }>;
};

// Parse folder name pattern: axenita-id_firstname_lastname_dd-mm-yyyy
// Also try other patterns like firstname_lastname or lastname_firstname
function parseFolderName(folderName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  // Remove file extensions if any
  const cleanName = folderName.replace(/\.[^.]+$/, "");
  
  // Try splitting by underscore
  const underscoreParts = cleanName.split("_");
  
  // Pattern: axenita-id_firstname_lastname_dd-mm-yyyy (4+ parts)
  if (underscoreParts.length >= 4) {
    return {
      firstName: underscoreParts[1],
      lastName: underscoreParts[2],
    };
  }
  
  // Pattern: axenita-id_firstname_lastname (3 parts)
  if (underscoreParts.length === 3) {
    return {
      firstName: underscoreParts[1],
      lastName: underscoreParts[2],
    };
  }
  
  // Pattern: firstname_lastname (2 parts)
  if (underscoreParts.length === 2) {
    return {
      firstName: underscoreParts[0],
      lastName: underscoreParts[1],
    };
  }
  
  // Try splitting by hyphen
  const hyphenParts = cleanName.split("-");
  if (hyphenParts.length >= 2) {
    return {
      firstName: hyphenParts[0],
      lastName: hyphenParts[1],
    };
  }
  
  // Try splitting by space
  const spaceParts = cleanName.split(/\s+/);
  if (spaceParts.length >= 2) {
    return {
      firstName: spaceParts[0],
      lastName: spaceParts[spaceParts.length - 1],
    };
  }
  
  return { firstName: null, lastName: null };
}

// Determine file type from filename
function getFileType(fileName: string): "ap" | "af" | "notes" | "consultation" | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName === "ap.pdf") return "ap";
  if (lowerName === "af.pdf") return "af";
  if (lowerName === "notes.pdf") return "notes";
  if (lowerName.startsWith("consultation") && lowerName.endsWith(".pdf")) return "consultation";
  return null;
}

// Extract text from PDF text objects (BT...ET blocks)
function extractTextFromPdfContent(content: string): string[] {
  const textMatches: string[] = [];
  
  // Find all BT...ET blocks (text objects)
  const btEtRegex = /BT[\s\S]*?ET/g;
  const blocks = content.match(btEtRegex) || [];
  
  for (const block of blocks) {
    // Extract text from Tj operator: (text) Tj
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
    for (const tj of tjMatches) {
      const text = tj.match(/\(([^)]*)\)/)?.[1] || "";
      if (text && text.length > 0) textMatches.push(text);
    }
    
    // Extract text from TJ operator: [(text) num (text) ...] TJ
    const tjArrayMatches = block.match(/\[([^\]]*)\]\s*TJ/gi) || [];
    for (const tjArray of tjArrayMatches) {
      const innerTexts = tjArray.match(/\(([^)]*)\)/g) || [];
      for (const innerText of innerTexts) {
        const text = innerText.slice(1, -1); // Remove parentheses
        if (text && text.length > 0) textMatches.push(text);
      }
    }
  }
  
  return textMatches;
}

// Decode PDF escape sequences
function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\(.)/g, "$1");
}

// PDF text extraction with FlateDecode decompression
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const allText: string[] = [];
    
    // Find all stream...endstream sections
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    
    // Also check for FlateDecode filter before streams
    const pdfContent = buffer.toString("binary");
    
    while ((match = streamRegex.exec(pdfContent)) !== null) {
      const streamData = match[1];
      
      // Check if this stream is FlateDecode compressed
      // Look backwards for /Filter /FlateDecode
      const beforeStream = pdfContent.substring(Math.max(0, match.index - 500), match.index);
      const isFlateEncoded = /\/Filter\s*\/FlateDecode/i.test(beforeStream) || 
                             /\/Filter\s*\[\s*\/FlateDecode\s*\]/i.test(beforeStream);
      
      try {
        let decompressed: string;
        
        if (isFlateEncoded) {
          // Convert binary string to buffer and decompress
          const streamBuffer = Buffer.from(streamData, "binary");
          try {
            // Try raw deflate first (most common in PDFs)
            const inflated = inflateRawSync(streamBuffer);
            decompressed = inflated.toString("latin1");
          } catch {
            try {
              // Try with zlib header
              const inflated = inflateSync(streamBuffer);
              decompressed = inflated.toString("latin1");
            } catch {
              continue; // Skip this stream if decompression fails
            }
          }
        } else {
          decompressed = streamData;
        }
        
        // Extract text from the decompressed content
        const texts = extractTextFromPdfContent(decompressed);
        for (const text of texts) {
          const decoded = decodePdfString(text);
          if (decoded.trim().length > 0) {
            allText.push(decoded);
          }
        }
      } catch {
        // Skip streams that can't be processed
        continue;
      }
    }
    
    // If we found text, return it
    if (allText.length > 0) {
      const result = allText.join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return result.substring(0, 2000) || "[Document content extracted]";
    }
    
    // Fallback: try to find any readable text in uncompressed parts
    const readableText = pdfContent.match(/[\x20-\x7E]{20,}/g) || [];
    const filtered = readableText
      .filter(t => !t.includes("/Filter") && !t.includes("/Length") && !t.includes("endobj"))
      .slice(0, 10)
      .join(" ");
    
    return filtered.substring(0, 500) || "[PDF document - text extraction limited]";
  } catch (err) {
    console.error("PDF extraction error:", err);
    return "[PDF content - unable to extract text]";
  }
}

async function processPdfFile(
  folderPath: string,
  fileName: string,
  folderInfo: ReturnType<typeof parseFolderName>,
  parsedDocuments: ParsedPdfDocument[]
) {
  const fileType = getFileType(fileName);
  if (!fileType) return;

  const filePath = `${folderPath}/${fileName}`;

  try {
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error(`Error downloading ${filePath}:`, downloadError);
      return;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const content = await extractPdfText(buffer);

    const singleLineContent = content
      .replace(/\r\n/g, " ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const fileTypeLabels: Record<string, string> = {
      ap: "Medical Notes (AP)",
      af: "Medical Notes (AF)",
      notes: "Notes",
      consultation: "Consultation",
    };
    
    parsedDocuments.push({
      folderName: folderPath.split("/")[0],
      fileName,
      fileType,
      content: singleLineContent || `[${fileTypeLabels[fileType] || "Document"} document]`,
      firstName: folderInfo.firstName,
      lastName: folderInfo.lastName,
    });
  } catch (parseError: any) {
    console.error(`Error processing PDF ${filePath}:`, parseError.message);
    const fileTypeLabels: Record<string, string> = {
      ap: "Medical Notes (AP)",
      af: "Medical Notes (AF)",
      notes: "Notes",
      consultation: "Consultation",
    };
    // Still add the document with placeholder content
    parsedDocuments.push({
      folderName: folderPath.split("/")[0],
      fileName,
      fileType,
      content: `[${fileTypeLabels[fileType] || "Document"} document]`,
      firstName: folderInfo.firstName,
      lastName: folderInfo.lastName,
    });
  }
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const firstName = searchParams.get("firstName");
    const lastName = searchParams.get("lastName");

    console.log("DEBUG GET - Bucket:", BUCKET_NAME);

    // Fetch ALL folders with pagination
    const folders = await fetchAllFolders();

    console.log("DEBUG GET - Total folders found:", folders.length);

    if (folders.length === 0) {
      return NextResponse.json({ documents: [], debug: { bucket: BUCKET_NAME, foldersFound: 0 } });
    }

    const parsedDocuments: ParsedPdfDocument[] = [];

    for (const folder of folders) {
      // Skip files at root level (folders typically don't have common file extensions)
      if (/\.(pdf|jpg|jpeg|png|gif|txt|doc|docx)$/i.test(folder.name)) continue;

      const folderInfo = parseFolderName(folder.name);

      if (firstName && lastName) {
        const folderFirstName = folderInfo.firstName?.toLowerCase().trim() || "";
        const folderLastName = folderInfo.lastName?.toLowerCase().trim() || "";
        const searchFirstNameLower = firstName.toLowerCase().trim();
        const searchLastNameLower = lastName.toLowerCase().trim();

        // More flexible matching - check if names match in either order
        const directMatch = 
          (folderFirstName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderFirstName)) &&
          (folderLastName.includes(searchLastNameLower) || searchLastNameLower.includes(folderLastName));
        
        const reverseMatch = 
          (folderFirstName.includes(searchLastNameLower) || searchLastNameLower.includes(folderFirstName)) &&
          (folderLastName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderLastName));
        
        // Also check if the full folder name contains both names
        const folderNameLower = folder.name.toLowerCase();
        const containsBothNames = folderNameLower.includes(searchFirstNameLower) && folderNameLower.includes(searchLastNameLower);

        if (!directMatch && !reverseMatch && !containsBothNames) continue;
      }

      const { data: subItems, error: subError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list(folder.name, { limit: 100 });

      if (subError || !subItems) continue;

      for (const item of subItems) {
        if (item.name.endsWith(".pdf")) {
          await processPdfFile(folder.name, item.name, folderInfo, parsedDocuments);
        } else if (!item.name.includes(".")) {
          const subfolderPath = `${folder.name}/${item.name}`;
          const { data: subfolderFiles } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .list(subfolderPath, { limit: 100 });

          if (subfolderFiles) {
            for (const file of subfolderFiles) {
              if (file.name.endsWith(".pdf")) {
                await processPdfFile(subfolderPath, file.name, folderInfo, parsedDocuments);
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ documents: parsedDocuments });
  } catch (error: any) {
    console.error("Error in parse-pdfs GET:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "firstName and lastName are required" }, { status: 400 });
    }

    console.log("DEBUG POST - Searching for:", { firstName, lastName });

    // Fetch ALL folders with pagination
    const folders = await fetchAllFolders();

    console.log("DEBUG POST - Bucket:", BUCKET_NAME);
    console.log("DEBUG POST - Total folders found:", folders.length);

    const debugInfo: DebugInfo = {
      bucket: BUCKET_NAME,
      searchFirstName: firstName,
      searchLastName: lastName,
      foldersFound: folders.length,
      folderNames: [], // Don't include all folder names in debug to avoid huge response
      parsedFolders: [],
    };

    if (folders.length === 0) {
      return NextResponse.json({ documents: [], debug: debugInfo });
    }

    const parsedDocuments: ParsedPdfDocument[] = [];
    const searchFirstNameLower = firstName.toLowerCase().trim();
    const searchLastNameLower = lastName.toLowerCase().trim();

    for (const folder of folders) {
      // Skip files at root level (folders typically don't have common file extensions)
      if (/\.(pdf|jpg|jpeg|png|gif|txt|doc|docx)$/i.test(folder.name)) continue;

      const folderInfo = parseFolderName(folder.name);
      const folderFirstName = folderInfo.firstName?.toLowerCase().trim() || "";
      const folderLastName = folderInfo.lastName?.toLowerCase().trim() || "";

      // More flexible matching - check if names match in either order
      const directMatch = 
        (folderFirstName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderFirstName)) &&
        (folderLastName.includes(searchLastNameLower) || searchLastNameLower.includes(folderLastName));
      
      const reverseMatch = 
        (folderFirstName.includes(searchLastNameLower) || searchLastNameLower.includes(folderFirstName)) &&
        (folderLastName.includes(searchFirstNameLower) || searchFirstNameLower.includes(folderLastName));
      
      // Also check if the full folder name contains both names
      const folderNameLower = folder.name.toLowerCase();
      const containsBothNames = folderNameLower.includes(searchFirstNameLower) && folderNameLower.includes(searchLastNameLower);

      const matched = directMatch || reverseMatch || containsBothNames;

      debugInfo.parsedFolders.push({
        name: folder.name,
        firstName: folderInfo.firstName,
        lastName: folderInfo.lastName,
        matched,
      });

      console.log("DEBUG POST - Folder:", folder.name, "Parsed:", folderInfo, "Matched:", matched);

      if (!matched) continue;

      const { data: subItems, error: subError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list(folder.name, { limit: 100 });

      if (subError || !subItems) continue;

      for (const item of subItems) {
        if (item.name.endsWith(".pdf")) {
          await processPdfFile(folder.name, item.name, folderInfo, parsedDocuments);
        } else if (!item.name.includes(".")) {
          const subfolderPath = `${folder.name}/${item.name}`;
          const { data: subfolderFiles } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .list(subfolderPath, { limit: 100 });

          if (subfolderFiles) {
            for (const file of subfolderFiles) {
              if (file.name.endsWith(".pdf")) {
                await processPdfFile(subfolderPath, file.name, folderInfo, parsedDocuments);
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ documents: parsedDocuments, debug: debugInfo });
  } catch (error: any) {
    console.error("Error in parse-pdfs POST:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
