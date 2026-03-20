# Setup Domain-Wide Delegation for Google Drive

## Why This Is Needed

**Service accounts created after April 15, 2024 have 0GB storage quota and cannot own files.**

Your service account was created in 2024, so it has no storage. The solution is **domain-wide delegation**, which allows the service account to **impersonate a user** and create files directly in that user's Drive - bypassing the service account's quota entirely.

---

## Setup Steps

### Step 1: Enable Domain-Wide Delegation in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project: **gen-lang-client-0847434256**
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click on your service account: `aestheticclinic@gen-lang-client-0847434256.iam.gserviceaccount.com`
5. Go to the **Details** tab
6. Scroll down to **Advanced settings**
7. Click **Show domain-wide delegation**
8. Check the box: **Enable Google Workspace Domain-wide Delegation**
9. Click **Save**
10. **Copy the Client ID** (you'll need this in Step 2)

### Step 2A: For Google Workspace Accounts (Recommended)

If `aliicecrm01@gmail.com` is part of a Google Workspace domain:

1. Go to [Google Workspace Admin Console](https://admin.google.com)
2. Navigate to **Security** → **Access and data control** → **API Controls**
3. Click **Manage Domain-Wide Delegation**
4. Click **Add new**
5. Enter the **Client ID** from Step 1
6. Add these OAuth scopes:
   ```
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/documents
   ```
7. Click **Authorize**

### Step 2B: For Personal Gmail Accounts (Alternative)

**Important**: Domain-wide delegation is NOT available for personal Gmail accounts (@gmail.com).

If you're using a personal Gmail account, you have **two options**:

#### Option 1: Use OAuth 2.0 Instead (Recommended for Personal Gmail)
Switch from service account to OAuth 2.0 user authentication. This requires:
- User consent flow
- Storing refresh tokens
- Files are created in the authenticated user's Drive

#### Option 2: Use Shared Folder (Limited)
- Create a folder in `aliicecrm01@gmail.com`'s Drive
- Share it with the service account email: `aestheticclinic@gen-lang-client-0847434256.iam.gserviceaccount.com`
- Give "Editor" permission
- **Limitation**: Files created in shared folders still count against the service account's quota (0GB), so this won't work

**For personal Gmail, you MUST use OAuth 2.0 instead of service accounts.**

---

## Step 3: Update Environment Variables

Already done in `.env.local`:

```bash
GOOGLE_DRIVE_IMPERSONATE_USER=aliicecrm01@gmail.com
```

Also update this in **Vercel**:
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add/Update:
   - Key: `GOOGLE_DRIVE_IMPERSONATE_USER`
   - Value: `aliicecrm01@gmail.com`
4. Redeploy your application

---

## Step 4: Test

After setup, try creating a document. The service account will impersonate `aliicecrm01@gmail.com` and create the file directly in their Drive.

Check the logs - you should see:
```
Impersonating user: aliicecrm01@gmail.com
File created in user's Drive via impersonation - no transfer needed
```

---

## Troubleshooting

### Error: "Not Authorized to access this resource/api"

**Cause**: Domain-wide delegation not properly configured.

**Solutions**:
1. Verify you completed Step 1 (enabled delegation in GCP)
2. Verify you completed Step 2 (authorized in Workspace Admin)
3. Wait 10-15 minutes for changes to propagate
4. Make sure the scopes match exactly:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/documents`

### Error: "Domain-wide delegation is not available for consumer accounts"

**Cause**: You're using a personal Gmail account (@gmail.com), not Google Workspace.

**Solution**: You MUST switch to OAuth 2.0 authentication. See "Alternative: OAuth 2.0 Implementation" below.

### Error: "Storage quota exceeded"

**Cause**: The impersonated user's Drive is full.

**Solutions**:
1. Free up space in `aliicecrm01@gmail.com`'s Drive
2. Empty trash: https://drive.google.com/drive/trash
3. Check storage: https://one.google.com/storage
4. Upgrade to Google One for more storage

---

## Alternative: OAuth 2.0 Implementation (For Personal Gmail)

If domain-wide delegation doesn't work (personal Gmail), you need to implement OAuth 2.0:

### What Changes:
1. User must authorize the app once
2. You store a refresh token
3. Files are created in the authenticated user's Drive
4. No service account quota issues

### Implementation Steps:

1. **Create OAuth 2.0 Credentials**:
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URIs

2. **Implement OAuth Flow**:
   ```typescript
   // User clicks "Connect Google Drive"
   // Redirect to Google OAuth consent screen
   // User authorizes
   // Store refresh token in database
   ```

3. **Use Refresh Token**:
   ```typescript
   const oauth2Client = new google.auth.OAuth2(
     CLIENT_ID,
     CLIENT_SECRET,
     REDIRECT_URI
   );
   
   oauth2Client.setCredentials({
     refresh_token: storedRefreshToken
   });
   
   const drive = google.drive({ version: 'v3', auth: oauth2Client });
   ```

Would you like me to implement the OAuth 2.0 approach instead?

---

## Summary

**For Google Workspace**: Follow Steps 1-4 above. Domain-wide delegation will work.

**For Personal Gmail**: Domain-wide delegation is NOT available. You must use OAuth 2.0 instead.

Check if `aliicecrm01@gmail.com` is:
- **Google Workspace**: Domain ends with your company domain (e.g., @yourcompany.com)
- **Personal Gmail**: Domain is @gmail.com

If it's personal Gmail, let me know and I'll implement the OAuth 2.0 solution.
