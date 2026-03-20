# DocSpace Configuration Test

## Current Configuration

From `.env.local`:
```
NEXT_PUBLIC_DOCSPACE_URL=https://docspace-hm9cxt.onlyoffice.com/
DOCSPACE_API_TOKEN=sk-115bcff3b0fb4b78db72c2adb4db8b5dcea0ad7dc656ffcd2286c3c6f05eea1b
DOCSPACE_ROOM_ID=TH8KPxfXMpXG8G2
```

## Issue

DocSpace upload is failing with empty error. Possible causes:

### 1. Room ID Format
The Room ID `TH8KPxfXMpXG8G2` looks like a base64-encoded string, but DocSpace typically uses numeric IDs.

**How to get correct Room ID:**
1. Login to https://docspace-hm9cxt.onlyoffice.com/
2. Navigate to your "Patient Documents" room
3. Look at the URL: `https://docspace-hm9cxt.onlyoffice.com/rooms/shared/12345`
4. The number `12345` is your Room ID

### 2. API Token Permissions
The token might not have permission to upload files.

**Verify token:**
1. Go to DocSpace → Settings → Developer Tools → API
2. Check token permissions
3. Ensure "Upload files" permission is enabled

### 3. API Endpoint
Current endpoint: `https://docspace-hm9cxt.onlyoffice.com//api/2.0/files/TH8KPxfXMpXG8G2/upload`

Notice the double slash `//` - this is because the URL has a trailing slash.

## Fix Options

### Option 1: Get Correct Room ID (RECOMMENDED)
1. Find the numeric room ID from your DocSpace URL
2. Update `.env.local`:
   ```
   DOCSPACE_ROOM_ID=12345  # Replace with actual numeric ID
   ```

### Option 2: Use Different API Approach
Instead of uploading to a specific room, we can:
1. Upload to user's personal space
2. Use DocSpace SDK instead of REST API
3. Create room programmatically

### Option 3: Skip DocSpace Upload (Temporary)
For now, you can edit documents directly from Supabase storage without DocSpace:
1. Download from `patient-docs` bucket
2. Edit locally
3. Re-upload to `patient-docs` bucket

## Test DocSpace API

Try this curl command to test your DocSpace configuration:

```bash
curl -X POST "https://docspace-hm9cxt.onlyoffice.com/api/2.0/files/TH8KPxfXMpXG8G2/upload" \
  -H "Authorization: Bearer sk-115bcff3b0fb4b78db72c2adb4db8b5dcea0ad7dc656ffcd2286c3c6f05eea1b" \
  -F "file=@test.docx"
```

Expected responses:
- **401**: Token invalid
- **403**: No permission
- **404**: Room not found
- **200**: Success

## Next Steps

1. **Get the correct Room ID** from your DocSpace URL
2. **Update `.env.local`** with the numeric room ID
3. **Restart dev server**
4. **Test template creation** again

The document is successfully being created in Supabase (`patient-docs` bucket), so the template workflow is working - we just need to fix the DocSpace upload step.
