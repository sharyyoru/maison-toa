# ONLYOFFICE Cloud Setup for Vercel Deployment

## Why Use ONLYOFFICE Cloud?

- ✅ **No server management** - Fully managed
- ✅ **Works with Vercel** - Just set environment variable
- ✅ **Free tier available** - Test before paying
- ✅ **5-minute setup** - No Docker, no VPS needed
- ✅ **100% DOCX fidelity** - Same as self-hosted

---

## Setup Steps

### Step 1: Create ONLYOFFICE Cloud Account

1. Go to https://www.onlyoffice.com/docspace-registration.aspx
2. Sign up for a free account
3. Choose "ONLYOFFICE Docs" (Document Server)

### Step 2: Get Your Server URL

After signup, you'll receive:
- Server URL (e.g., `https://your-workspace.onlyoffice.com`)
- API credentials (if needed)

### Step 3: Update Environment Variables

**Local (.env.local)**:
```env
NEXT_PUBLIC_ONLYOFFICE_URL=https://your-workspace.onlyoffice.com
```

**Vercel**:
1. Go to your Vercel project
2. Settings → Environment Variables
3. Add:
   - Key: `NEXT_PUBLIC_ONLYOFFICE_URL`
   - Value: `https://your-workspace.onlyoffice.com`
4. Redeploy

### Step 4: Test

1. Deploy to Vercel
2. Open a patient document
3. Click "Edit in ONLYOFFICE"
4. Document should open with perfect DOCX fidelity

---

## Alternative: Self-Hosted on VPS (More Control)

If you want full control and no recurring costs:

### DigitalOcean Droplet Setup

**Cost**: $12/month (2GB RAM droplet)

1. **Create Droplet**:
   - Go to https://www.digitalocean.com/
   - Create → Droplets
   - Choose: Ubuntu 22.04 LTS
   - Plan: Basic ($12/month, 2GB RAM)
   - Add SSH key or use password

2. **SSH into Droplet**:
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

4. **Run ONLYOFFICE**:
   ```bash
   docker run -i -t -d -p 80:80 \
     --name onlyoffice-ds \
     onlyoffice/documentserver
   ```

5. **Setup Domain** (Optional but recommended):
   - Point DNS A record to droplet IP
   - Install SSL with Let's Encrypt:
   ```bash
   sudo apt-get update
   sudo apt-get install certbot
   sudo certbot certonly --standalone -d docs.yourdomain.com
   ```

6. **Update Vercel**:
   ```env
   NEXT_PUBLIC_ONLYOFFICE_URL=http://your-droplet-ip
   # or with domain:
   NEXT_PUBLIC_ONLYOFFICE_URL=https://docs.yourdomain.com
   ```

---

## Railway Deployment (Docker Hosting)

**Cost**: ~$5/month

1. **Create Railway Account**: https://railway.app/
2. **New Project** → Deploy from Docker Image
3. **Docker Image**: `onlyoffice/documentserver`
4. **Port**: 80
5. **Get Public URL**: Railway provides a URL like `onlyoffice-production.up.railway.app`
6. **Update Vercel**:
   ```env
   NEXT_PUBLIC_ONLYOFFICE_URL=https://onlyoffice-production.up.railway.app
   ```

---

## Render.com Deployment

**Cost**: Free tier available, $7/month for production

1. **Create Render Account**: https://render.com/
2. **New** → Web Service
3. **Docker** → Image URL: `onlyoffice/documentserver`
4. **Instance Type**: Free or Starter ($7/month)
5. **Get URL**: e.g., `onlyoffice.onrender.com`
6. **Update Vercel**:
   ```env
   NEXT_PUBLIC_ONLYOFFICE_URL=https://onlyoffice.onrender.com
   ```

---

## Cost Comparison

| Option | Setup Time | Monthly Cost | Pros | Cons |
|--------|------------|--------------|------|------|
| **ONLYOFFICE Cloud** | 5 min | Free - $5+ | Easiest, managed | Recurring cost |
| **DigitalOcean VPS** | 30 min | $12 | Full control, one-time setup | Requires server management |
| **Railway** | 10 min | $5 | Easy, Docker-based | Limited free tier |
| **Render** | 10 min | Free - $7 | Free tier available | Slower on free tier |

---

## Recommended: Start with ONLYOFFICE Cloud

1. **Fastest to production** - 5 minutes
2. **No server management** - Focus on your app
3. **Free tier** - Test before committing
4. **Upgrade later** - Can switch to self-hosted anytime

---

## Security Considerations

### For Production:

1. **Enable JWT** (prevents unauthorized access):
   ```env
   JWT_ENABLED=true
   JWT_SECRET=your-secret-key
   ```

2. **Use HTTPS** (required for many features):
   - ONLYOFFICE Cloud: Already HTTPS ✅
   - Self-hosted: Use Let's Encrypt SSL

3. **Restrict Access** (optional):
   - Configure firewall to only allow your Vercel IP
   - Use VPN for admin access

---

## Testing Checklist

After deployment:

- [ ] ONLYOFFICE server is accessible at public URL
- [ ] Environment variable set in Vercel
- [ ] Vercel app redeployed
- [ ] Open a patient document
- [ ] Click "Edit" button
- [ ] Document loads in ONLYOFFICE editor
- [ ] Verify DOCX formatting is preserved
- [ ] Test editing and saving
- [ ] Verify changes persist

---

## Troubleshooting

### "ONLYOFFICE Server Not Available"

**Cause**: Server URL not accessible or wrong

**Fix**:
1. Verify URL is publicly accessible: `curl https://your-onlyoffice-url`
2. Check environment variable is set in Vercel
3. Redeploy Vercel app after changing env vars

### "Document Not Loading"

**Cause**: Document URL not accessible from ONLYOFFICE server

**Fix**:
1. Ensure document download endpoint is public
2. Check CORS headers allow ONLYOFFICE domain
3. Verify document exists in Supabase storage

### "CORS Error"

**Cause**: ONLYOFFICE server blocking requests

**Fix**:
Add CORS headers to document download endpoint:
```typescript
headers: {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
}
```

---

## Next Steps

1. **Choose deployment option** (ONLYOFFICE Cloud recommended for quick start)
2. **Get server URL**
3. **Update Vercel environment variables**
4. **Redeploy**
5. **Test document editing**
6. **Enjoy 100% DOCX fidelity with no quota issues!**

---

## Resources

- [ONLYOFFICE Cloud](https://www.onlyoffice.com/)
- [DigitalOcean](https://www.digitalocean.com/)
- [Railway](https://railway.app/)
- [Render](https://render.com/)
- [ONLYOFFICE Documentation](https://api.onlyoffice.com/editors/basic)
