# Google Drive Storage Quota Fix - Implementation Guide

## Problems Addressed

### 1. ✅ Service Account Quota Problem
**Issue**: Service accounts have 0GB or very limited storage, causing "Drive storage quota" errors.

**Solution Implemented**: 
- Added `GOOGLE_DRIVE_OWNER_EMAIL` configuration to transfer ownership of created documents to your personal Gmail account
- Documents are now stored in YOUR Drive quota, not the service account's
- Alternatively, you can use `GOOGLE_SHARED_DRIVE_ID` to store files in a Shared Drive

### 2. ✅ Large File "Ghosting" in Trash
**Issue**: Deleted files stay in trash for 30 days and continue counting against quota.

**Solution Implemented**:
- Created `/api/documents/google/cleanup-trash` endpoint to permanently delete trashed files
- GET endpoint to check trash status
- POST endpoint to empty trash and free up space

### 3. ✅ API Rate Limits
**Issue**: Generic "quota" errors when hitting API rate limits.

**Solution Implemented**:
- Added specific error detection for rate limit vs storage quota errors
- Better error messages to distinguish between the two
- Proper error handling with retry suggestions

### 4. ✅ Restricted Folder Permissions
**Issue**: Cannot add files to folders owned by users who are out of storage.

**Solution Implemented**:
- Removed hardcoded parent folder restrictions
- Support for Shared Drives which have separate quota management
- Ownership transfer ensures files go to the correct user's quota

---

## Configuration Steps

### Step 1: Update Environment Variables

Edit your `.env.local` file and set:

```bash
# REQUIRED: Set this to YOUR Gmail address
GOOGLE_DRIVE_OWNER_EMAIL=your-email@gmail.com

# OPTIONAL: Use a Shared Drive instead (leave empty for personal Drive)
# GOOGLE_SHARED_DRIVE_ID=your-shared-drive-id
```

**Important**: 
- Replace `your-email@gmail.com` with the actual Gmail account that should own the documents
- This email must have sufficient Google Drive storage available
- The service account must have permission to share files with this email

### Step 2: Grant Service Account Permissions

The service account needs to be able to transfer ownership. You have two options:

#### Option A: Personal Drive (Recommended for small teams)
1. No additional setup needed
2. Files will be transferred to the email specified in `GOOGLE_DRIVE_OWNER_EMAIL`
3. That user's Drive quota will be used

#### Option B: Shared Drive (Recommended for organizations)
1. Create a Shared Drive in Google Drive
2. Add your service account email as a member with "Content Manager" or "Manager" role:
   - Email: `aestheticclinic@gen-lang-client-0847434256.iam.gserviceaccount.com`
3. Get the Shared Drive ID from the URL: `https://drive.google.com/drive/folders/SHARED_DRIVE_ID`
4. Set `GOOGLE_SHARED_DRIVE_ID=SHARED_DRIVE_ID` in `.env.local`

### Step 3: Enable Domain-Wide Delegation (If Needed)

If ownership transfer fails, you may need to enable domain-wide delegation:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project: `gen-lang-client-0847434256`
3. Go to **IAM & Admin** > **Service Accounts**
4. Click on your service account
5. Click **Show Domain-Wide Delegation**
6. Enable **Enable Google Workspace Domain-wide Delegation**
7. Note the Client ID
8. Go to your Google Workspace Admin Console (if you have one)
9. Navigate to **Security** > **API Controls** > **Domain-wide Delegation**
10. Add the Client ID with scope: `https://www.googleapis.com/auth/drive`

**Note**: This is only needed if you're using Google Workspace. For personal Gmail accounts, the basic setup should work.

---

## Usage

### Creating Documents (Automatic)
The ownership transfer happens automatically when you create a new document. No code changes needed in your frontend.

### Cleaning Up Trash (Manual)

#### Check Trash Status:
```bash
curl http://localhost:3000/api/documents/google/cleanup-trash
```

Response:
```json
{
  "fileCount": 15,
  "totalSizeMB": "245.67",
  "files": [...]
}
```

#### Empty Trash:
```bash
curl -X POST http://localhost:3000/api/documents/google/cleanup-trash
```

Response:
```json
{
  "message": "Successfully emptied trash",
  "deletedCount": 15,
  "freedSpaceMB": "245.67"
}
```

### Recommended: Set Up Automated Cleanup

Add a cron job or scheduled task to periodically empty trash:

```typescript
// Example: Add to a scheduled job or admin panel
async function cleanupTrash() {
  const response = await fetch('/api/documents/google/cleanup-trash', {
    method: 'POST',
  });
  const result = await response.json();
  console.log(`Freed ${result.freedSpaceMB}MB`);
}
```

---

## Troubleshooting

### Error: "Ownership transfer failed"
**Cause**: Service account doesn't have permission to transfer ownership.

**Solutions**:
1. Make sure `GOOGLE_DRIVE_OWNER_EMAIL` is set correctly
2. Try using a Shared Drive instead (set `GOOGLE_SHARED_DRIVE_ID`)
3. Enable domain-wide delegation (see Step 3 above)
4. The code will fallback to "writer" permission if ownership transfer fails

### Error: "Storage quota exceeded"
**Cause**: The target user's Drive is full.

**Solutions**:
1. Empty trash: `https://drive.google.com/drive/trash`
2. Check storage: `https://one.google.com/storage`
3. Delete large files from Google Photos, Gmail, or Drive
4. Upgrade to Google One for more storage

### Error: "Rate limit exceeded"
**Cause**: Too many API requests in a short time.

**Solutions**:
1. Wait a few minutes and try again
2. Check quotas in [Google Cloud Console](https://console.cloud.google.com/apis/api/drive.googleapis.com/quotas)
3. Request quota increase if needed
4. Implement request batching or delays in your code

### Error: "Insufficient permissions"
**Cause**: Service account doesn't have required scopes.

**Solutions**:
1. Verify scopes in code include:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
2. Regenerate service account key if needed
3. Check that the service account is enabled in Google Cloud Console

---

## Monitoring

### Check Your Storage Usage
- Personal Drive: https://one.google.com/storage
- Breakdown by service (Drive, Photos, Gmail)
- See what's taking up space

### Check API Quotas
- Google Cloud Console: https://console.cloud.google.com/apis/api/drive.googleapis.com/quotas
- Monitor: Queries per minute, Queries per day
- Request increases if needed

### Check Trash Regularly
```bash
# Add this to your monitoring dashboard
curl http://localhost:3000/api/documents/google/cleanup-trash
```

---

## Best Practices

1. **Set up ownership transfer immediately** - Don't wait until you hit quota limits
2. **Empty trash monthly** - Prevents quota buildup
3. **Use Shared Drives for teams** - Better quota management and collaboration
4. **Monitor API usage** - Set up alerts in Google Cloud Console
5. **Regular audits** - Check which files are taking up space
6. **Implement rate limiting** - Add delays between bulk operations

---

## Summary of Changes

### Files Modified:
1. `src/app/api/documents/google/create/route.ts`
   - Added ownership transfer logic
   - Added Shared Drive support
   - Improved error handling for quota and rate limits
   - Better error messages

2. `.env.local`
   - Added `GOOGLE_DRIVE_OWNER_EMAIL`
   - Added `GOOGLE_SHARED_DRIVE_ID` (optional)

### Files Created:
1. `src/app/api/documents/google/cleanup-trash/route.ts`
   - GET endpoint to check trash status
   - POST endpoint to empty trash
   - Calculates freed space

2. `GOOGLE_DRIVE_QUOTA_FIX.md` (this file)
   - Complete documentation
   - Setup instructions
   - Troubleshooting guide

---

## Next Steps

1. ✅ Update `.env.local` with your Gmail address
2. ✅ Test document creation - ownership should transfer automatically
3. ✅ Check trash status: `GET /api/documents/google/cleanup-trash`
4. ✅ Empty trash if needed: `POST /api/documents/google/cleanup-trash`
5. ✅ Monitor your Drive storage at https://one.google.com/storage
6. ✅ Set up automated trash cleanup (optional but recommended)

---

## Support

If you continue to experience issues:
1. Check the console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure the service account has proper permissions
4. Check Google Cloud Console for API quota status
5. Review the troubleshooting section above
