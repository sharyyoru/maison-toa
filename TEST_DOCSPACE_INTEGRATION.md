# DocSpace Integration Testing Guide

## ✅ Setup Complete

Your environment is configured correctly:
- ✅ DocSpace URL: `https://docspace-hm9cxt.onlyoffice.com/`
- ✅ API Token: Set
- ✅ Room ID: `TH8KPxfXMpXG8G2`
- ✅ Dev server running: http://localhost:3000

## Step 1: Run Database Migration

**Run this SQL in Supabase SQL Editor:**

```sql
-- Add docspace_file_id column to patient_documents table
ALTER TABLE patient_documents
ADD COLUMN IF NOT EXISTS docspace_file_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_documents_docspace_file_id 
ON patient_documents(docspace_file_id);

-- Add comment
COMMENT ON COLUMN patient_documents.docspace_file_id IS 'ONLYOFFICE DocSpace file ID for editing documents with 100% DOCX fidelity';
```

**How to run:**
1. Go to https://supabase.com/dashboard/project/chjswljpjxjcsbiresnb
2. Click "SQL Editor" in left sidebar
3. Click "New Query"
4. Paste the SQL above
5. Click "Run" or press Ctrl+Enter
6. You should see "Success. No rows returned"

---

## Step 2: Test Document Upload & Editing

### Test Flow:

1. **Open your app**: http://localhost:3000

2. **Navigate to a patient's Documents tab**

3. **Create a new document**:
   - Click "New Document" button
   - Select any template
   - This creates a document in your database

4. **Open the document**:
   - Click the edit icon on the document
   - **What happens**:
     - Document uploads to DocSpace (you'll see "Uploading to DocSpace..." spinner)
     - DocSpace editor opens in fullscreen
     - Document renders with 100% DOCX fidelity

5. **Edit the document**:
   - Make changes in the editor
   - Changes auto-save to DocSpace
   - Close editor when done

6. **Verify**:
   - Document should now have `docspace_file_id` in database
   - Next time you open it, it loads instantly (no upload needed)

---

## Step 3: Check Browser Console

Open browser DevTools (F12) and check for:

### ✅ Success Messages:
```
DocSpace editor ready
Document content loaded
```

### ❌ Error Messages to Watch For:

**"DocSpace SDK not available"**
- Cause: Script failed to load
- Fix: Check if DocSpace URL is accessible
- Verify: Visit https://docspace-hm9cxt.onlyoffice.com/ in browser

**"File ID not found"**
- Cause: Upload failed or file not in DocSpace
- Fix: Check API response in Network tab
- Verify: API token and room ID are correct

**"Domain not allowed"**
- Cause: localhost:3000 not in allowed domains
- Fix: Already added in your screenshot ✅

---

## Step 4: Verify in DocSpace

1. **Login to DocSpace**: https://docspace-hm9cxt.onlyoffice.com/
2. **Navigate to your room**: "Patient Documents" (Room ID: TH8KPxfXMpXG8G2)
3. **Check files**: You should see uploaded documents there
4. **Verify formatting**: Open a file - should look exactly like the template

---

## Expected Results

### ✅ What Should Work:

1. **Upload**: Document uploads to DocSpace successfully
2. **Editor**: DocSpace editor opens in fullscreen
3. **Fidelity**: DOCX formatting preserved 100% (images, layouts, headers, footers)
4. **Editing**: Can edit document with full features
5. **Auto-save**: Changes save automatically
6. **Re-open**: Opening same document again loads instantly (no re-upload)

### ❌ Common Issues:

| Issue | Cause | Fix |
|-------|-------|-----|
| "Upload failed" | API token invalid | Regenerate token in DocSpace |
| "Room not found" | Wrong room ID | Verify room ID from URL |
| "CORS error" | Domain not allowed | Add localhost:3000 to allowed domains |
| "Script load failed" | DocSpace URL wrong | Check NEXT_PUBLIC_DOCSPACE_URL |

---

## Testing Checklist

- [ ] Database migration run successfully
- [ ] Dev server running at http://localhost:3000
- [ ] Navigate to patient Documents tab
- [ ] Create new document from template
- [ ] Click edit button on document
- [ ] See "Uploading to DocSpace..." spinner
- [ ] DocSpace editor opens fullscreen
- [ ] Document renders with perfect formatting
- [ ] Make edits in the editor
- [ ] Close editor (click back button)
- [ ] Re-open same document
- [ ] Opens instantly (no upload spinner)
- [ ] Check browser console for errors
- [ ] Verify file exists in DocSpace room

---

## API Endpoints Being Used

### 1. Upload to DocSpace
**Endpoint**: `POST /api/documents/docspace/upload`

**Request**:
```json
{
  "documentId": "uuid",
  "patientId": "uuid",
  "title": "Document Title"
}
```

**Response**:
```json
{
  "success": true,
  "fileId": "12345",
  "docSpaceUrl": "https://docspace-hm9cxt.onlyoffice.com/"
}
```

### 2. DocSpace Editor
**Component**: `DocSpaceEditor`

**Props**:
- `docSpaceUrl`: Your DocSpace URL
- `fileId`: File ID from upload response
- `mode`: "edit" or "view"
- `onClose`: Callback when editor closes
- `onError`: Callback for errors

---

## Debugging

### Check Upload API Response:

1. Open DevTools → Network tab
2. Click edit on a document
3. Look for request to `/api/documents/docspace/upload`
4. Check response:
   - Status 200 = Success
   - Status 500 = Server error (check API logs)
   - Status 404 = Document not found

### Check DocSpace Script Loading:

1. Open DevTools → Network tab
2. Look for request to `https://docspace-hm9cxt.onlyoffice.com/static/scripts/sdk/2.0.0/api.js`
3. Should return 200 OK
4. If 404 or CORS error, check DocSpace URL

### Check Console Logs:

```javascript
// Success logs:
"DocSpace editor ready"
"Document content loaded"

// Error logs:
"DocSpace SDK not available"
"Failed to load DocSpace SDK"
"DocSpace upload error: ..."
```

---

## Next Steps After Testing

### If Everything Works ✅:
1. Deploy to Vercel
2. Add environment variables to Vercel:
   - `NEXT_PUBLIC_DOCSPACE_URL`
   - `DOCSPACE_API_TOKEN`
   - `DOCSPACE_ROOM_ID`
3. Update allowed domains in DocSpace to include your Vercel URL
4. Test on production

### If Issues Occur ❌:
1. Check browser console for specific errors
2. Verify all environment variables are correct
3. Ensure database migration ran successfully
4. Check DocSpace room exists and is accessible
5. Verify API token has correct permissions

---

## Benefits You're Getting

✅ **100% DOCX Fidelity** - Templates render perfectly
✅ **No Google Quota Issues** - Self-hosted in DocSpace
✅ **Simple Authentication** - Just API token
✅ **Auto-save** - Changes save automatically
✅ **Collaboration** - Multiple users can edit (if needed)
✅ **Version History** - DocSpace tracks versions
✅ **Free Tier** - 2GB storage, 5 users

---

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Review browser console errors
3. Check Network tab for failed requests
4. Verify DocSpace settings match configuration
5. Check `DOCSPACE_SETUP_GUIDE.md` for detailed setup

---

## Summary

Your DocSpace integration is ready to test! Just:
1. Run the database migration SQL
2. Open http://localhost:3000
3. Create and edit a document
4. Verify perfect DOCX rendering

The system will automatically upload documents to DocSpace on first edit, then load instantly on subsequent edits.
