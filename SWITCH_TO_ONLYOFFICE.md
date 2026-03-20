# Switch from Google Docs to ONLYOFFICE - Complete Guide

## Why ONLYOFFICE Solves Your Problems

### ✅ Problem 1: DOCX Template Fidelity
**Google Docs**: Poor DOCX rendering - loses formatting, images misaligned, pagination differs
**ONLYOFFICE**: 100% pixel-perfect DOCX fidelity - preserves all formatting, images, headers, footers, layouts exactly as in Microsoft Word

### ✅ Problem 2: Storage Quota Issues  
**Google Docs**: Service accounts have 0GB quota, requires complex domain-wide delegation
**ONLYOFFICE**: Self-hosted, no external storage, no quota limits, no authentication complexity

### ✅ Problem 3: Already Implemented
You already have `OnlyOfficeEditor.tsx` component ready to use - just need to enable it!

---

## Quick Start (5 minutes)

### Step 1: Start ONLYOFFICE Docker Container

```bash
docker run -i -t -d -p 8080:80 --name onlyoffice-ds onlyoffice/documentserver
```

**Wait 30-60 seconds** for the server to initialize.

### Step 2: Verify Installation

Open http://localhost:8080 in your browser. You should see the ONLYOFFICE welcome page.

### Step 3: Environment Variable (Already Done ✅)

The `.env.local` file has been updated with:
```env
NEXT_PUBLIC_ONLYOFFICE_URL=http://localhost:8080
```

### Step 4: Update Vercel Environment Variables

1. Go to your Vercel project settings
2. Environment Variables
3. Add: `NEXT_PUBLIC_ONLYOFFICE_URL` = `https://your-onlyoffice-server.com`
   - For production, you'll need to deploy ONLYOFFICE on a public server
   - See "Production Deployment" section below

### Step 5: Restart Development Server

```bash
npm run dev
```

---

## Code Changes Needed

Replace `GoogleDocsViewer` with `OnlyOfficeEditor` in your components.

### Example: Update DocumentTemplatesPanel.tsx

**Before (Google Docs):**
```typescript
import GoogleDocsViewer from "./GoogleDocsViewer";

// In render:
<GoogleDocsViewer
  documentId={currentDocument.id}
  onClose={() => setShowEditor(false)}
/>
```

**After (ONLYOFFICE):**
```typescript
import OnlyOfficeEditor from "./OnlyOfficeEditor";

// In render:
<OnlyOfficeEditor
  documentUrl={`${window.location.origin}/api/documents/patient/${currentDocument.id}/download`}
  documentKey={currentDocument.id}
  documentTitle={currentDocument.title}
  fileType="docx"
  mode="edit"
  userId="current-user-id"
  userName="Current User"
  onClose={() => setShowEditor(false)}
/>
```

---

## API Endpoint for Document URLs

ONLYOFFICE needs a publicly accessible URL to download the document. Create this endpoint:

**File**: `src/app/api/documents/patient/[id]/download/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id;

    // Get document metadata
    const { data: document, error: docError } = await supabaseAdmin
      .from("patient_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return new NextResponse("Document not found", { status: 404 });
    }

    // Download from Supabase storage
    const filePath = `${document.patient_id}/${documentId}.docx`;
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("patient-docs")
      .download(filePath);

    if (downloadError || !fileData) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Return the file
    return new NextResponse(fileData, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${document.title}.docx"`,
      },
    });
  } catch (error) {
    console.error("Error downloading document:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
```

---

## Production Deployment

For production, deploy ONLYOFFICE on a public server:

### Option 1: Docker on VPS (DigitalOcean, AWS, etc.)

```bash
docker run -i -t -d -p 443:443 \
  -e JWT_ENABLED=true \
  -e JWT_SECRET=your-secret-key-here \
  -v /app/onlyoffice/data:/var/www/onlyoffice/Data \
  -v /app/onlyoffice/logs:/var/log/onlyoffice \
  --name onlyoffice-ds \
  onlyoffice/documentserver
```

Then set in Vercel:
```env
NEXT_PUBLIC_ONLYOFFICE_URL=https://docs.yourdomain.com
```

### Option 2: ONLYOFFICE Cloud (Managed)

Use ONLYOFFICE's managed cloud service:
- Sign up at https://www.onlyoffice.com/
- Get your server URL
- Set `NEXT_PUBLIC_ONLYOFFICE_URL` to your cloud URL

---

## Docker Commands Reference

### Start/Stop Container
```bash
# Start
docker start onlyoffice-ds

# Stop
docker stop onlyoffice-ds

# Restart
docker restart onlyoffice-ds

# View logs
docker logs onlyoffice-ds

# Check status
docker ps | grep onlyoffice
```

### Remove and Reinstall
```bash
# Remove container
docker rm -f onlyoffice-ds

# Pull latest version
docker pull onlyoffice/documentserver

# Run again
docker run -i -t -d -p 8080:80 --name onlyoffice-ds onlyoffice/documentserver
```

---

## Comparison: Google Docs vs ONLYOFFICE

| Feature | Google Docs | ONLYOFFICE |
|---------|-------------|------------|
| **DOCX Fidelity** | ❌ Poor - loses formatting | ✅ 100% pixel-perfect |
| **Images** | ❌ Misaligned, resized | ✅ Exact positioning |
| **Headers/Footers** | ❌ Often broken | ✅ Perfect rendering |
| **Complex Layouts** | ❌ Simplified | ✅ Preserved exactly |
| **Storage Quota** | ❌ 0GB for service accounts | ✅ No limits (self-hosted) |
| **Authentication** | ❌ Complex domain delegation | ✅ Simple or none needed |
| **Setup Complexity** | ❌ High (service accounts, OAuth) | ✅ Low (one Docker command) |
| **Cost** | ❌ Quota issues, potential upgrades | ✅ Free (self-hosted) |
| **Offline** | ❌ Requires internet | ✅ Works on local network |
| **Data Privacy** | ❌ Files on Google servers | ✅ Your infrastructure |

---

## Troubleshooting

### "ONLYOFFICE Server Not Available"

1. Check Docker is running: `docker ps`
2. Check container status: `docker ps -a | grep onlyoffice`
3. View logs: `docker logs onlyoffice-ds`
4. Ensure port 8080 is not in use: `netstat -ano | findstr :8080` (Windows)
5. Restart container: `docker restart onlyoffice-ds`

### Document Not Loading

1. Ensure document URL is publicly accessible from ONLYOFFICE container
2. For local dev, ONLYOFFICE container must be able to reach your Next.js server
3. Check browser console for errors
4. Verify document exists in Supabase storage

### CORS Errors

Add CORS headers to your document download endpoint:
```typescript
headers: {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
}
```

---

## Migration Checklist

- [x] Add `NEXT_PUBLIC_ONLYOFFICE_URL` to `.env.local`
- [ ] Start ONLYOFFICE Docker container
- [ ] Verify http://localhost:8080 is accessible
- [ ] Create document download API endpoint
- [ ] Replace `GoogleDocsViewer` with `OnlyOfficeEditor` in components
- [ ] Test document opening with DOCX template
- [ ] Verify formatting, images, layouts are preserved
- [ ] Deploy ONLYOFFICE to production server
- [ ] Update Vercel environment variables
- [ ] Remove Google Docs API code (optional cleanup)

---

## Benefits Summary

✅ **100% DOCX fidelity** - Templates render exactly as designed
✅ **No quota issues** - Self-hosted, unlimited storage
✅ **No authentication complexity** - No service accounts, no domain delegation
✅ **Better performance** - No external API calls to Google
✅ **Data privacy** - Documents stay on your infrastructure
✅ **Cost effective** - Free and open source
✅ **Already implemented** - Component ready to use

---

## Next Steps

1. **Start ONLYOFFICE**: Run the Docker command above
2. **Test locally**: Open a document and verify DOCX fidelity
3. **Deploy to production**: Set up ONLYOFFICE on a public server
4. **Update Vercel**: Add environment variable
5. **Enjoy**: No more quota issues, perfect DOCX rendering!

---

## Resources

- [ONLYOFFICE Documentation](https://api.onlyoffice.com/editors/basic)
- [Docker Hub - ONLYOFFICE](https://hub.docker.com/r/onlyoffice/documentserver)
- [GitHub - ONLYOFFICE](https://github.com/ONLYOFFICE/DocumentServer)
- [Your Setup Guide](./docs/ONLYOFFICE_SETUP.md)
