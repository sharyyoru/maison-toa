FROM node:18-slim

# Install Chromium dependencies for Puppeteer (used by whatsapp-web.js)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use installed Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

RUN npm install --only=production

# Copy all application files
COPY . .

# Create persistent data directory (mount Railway volume here at /data)
# - /data/whatsapp-sessions/ — WhatsApp Web auth data per user (LocalAuth)
# - /data/sessions.db — SQLite session metadata & logs
RUN mkdir -p /data/whatsapp-sessions

# Point session storage and SQLite DB to the persistent volume
ENV WA_SESSION_PATH=/data/whatsapp-sessions
ENV DB_PATH=/data/sessions.db

EXPOSE 3001

CMD ["node", "index.js"]
