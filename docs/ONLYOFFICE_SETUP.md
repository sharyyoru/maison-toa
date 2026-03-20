# OnlyOffice Document Server Setup

OnlyOffice Document Server provides 100% accurate DOCX rendering and editing, preserving all formatting, images, headers, footers, and layout exactly as in Microsoft Word.

## Quick Start (Docker)

### 1. Install Docker
- **Windows**: Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **Mac**: `brew install --cask docker`
- **Linux**: `sudo apt-get install docker.io`

### 2. Run OnlyOffice Document Server

```bash
docker run -i -t -d -p 8080:80 --name onlyoffice-ds onlyoffice/documentserver
```

Wait approximately 30-60 seconds for the server to fully initialize.

### 3. Verify Installation

Open http://localhost:8080 in your browser. You should see the OnlyOffice welcome page.

### 4. Configure Environment

Add to your `.env.local` file:

```env
NEXT_PUBLIC_ONLYOFFICE_URL=http://localhost:8080
```

### 5. Restart the Development Server

```bash
npm run dev
```

## Usage

1. Go to a patient's **Documents** tab
2. Click **"New Document"**
3. Select a template and click **"Full Editor"** (green button)
4. The document will open in OnlyOffice with full formatting preserved

## Docker Commands

### Start/Stop

```bash
# Start the container
docker start onlyoffice-ds

# Stop the container
docker stop onlyoffice-ds

# View logs
docker logs onlyoffice-ds
```

### Remove and Reinstall

```bash
# Remove the container
docker rm -f onlyoffice-ds

# Pull latest version and run
docker pull onlyoffice/documentserver
docker run -i -t -d -p 8080:80 --name onlyoffice-ds onlyoffice/documentserver
```

## Production Deployment

For production, you should:

1. Use HTTPS (required for many features)
2. Configure JWT for security
3. Use proper volume mounts for data persistence

```bash
docker run -i -t -d -p 443:443 \
  -e JWT_ENABLED=true \
  -e JWT_SECRET=your-secret-key \
  -v /app/onlyoffice/data:/var/www/onlyoffice/Data \
  -v /app/onlyoffice/logs:/var/log/onlyoffice \
  --name onlyoffice-ds \
  onlyoffice/documentserver
```

## Troubleshooting

### "OnlyOffice Server Not Available" Error

1. Check if Docker is running: `docker ps`
2. Check if the container is running: `docker ps -a | grep onlyoffice`
3. View container logs: `docker logs onlyoffice-ds`
4. Ensure port 8080 is not in use by another application

### Document Not Loading

1. Ensure the document URL is accessible from the OnlyOffice container
2. For local development, use `host.docker.internal` instead of `localhost` in callback URLs
3. Check browser console for CORS errors

### JWT Errors in Production

If you enable JWT, ensure the same secret is configured in both:
- OnlyOffice container (`JWT_SECRET` environment variable)
- Your application configuration

## Resources

- [OnlyOffice Documentation](https://api.onlyoffice.com/editors/basic)
- [Docker Hub - OnlyOffice](https://hub.docker.com/r/onlyoffice/documentserver)
- [GitHub - OnlyOffice](https://github.com/ONLYOFFICE/DocumentServer)
