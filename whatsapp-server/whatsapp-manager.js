const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const {
  getUserSession,
  upsertUserSession,
  updateSessionStatus,
  updateSessionQR,
  clearSessionQR,
  logEvent
} = require('./db');

// Lazy-loaded to avoid circular dependency (queue-processor requires whatsapp-manager)
let _resetSessionFailedItems = null;
function getResetSessionFailed() {
  if (!_resetSessionFailedItems) {
    try { _resetSessionFailedItems = require('./queue-processor').resetSessionFailedItems; } catch { _resetSessionFailedItems = () => {}; }
  }
  return _resetSessionFailedItems;
}

// Store active WhatsApp clients per user
const clients = new Map();

// Track init watchdog timers per user
const initWatchdogs = new Map();

// WebSocket clients per user for real-time updates
const wsClientsByUser = new Map();

/**
 * Get or create WhatsApp client for a specific user
 */
function getWhatsAppClient(userId) {
  if (clients.has(userId)) {
    return clients.get(userId);
  }

  console.log(`Creating new WhatsApp client for user: ${userId}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId,
      dataPath: process.env.WA_SESSION_PATH || path.join(__dirname, 'whatsapp-sessions')
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  // Helpful diagnostics (Railway debugging)
  client.on('loading_screen', (percent, message) => {
    console.log(`WhatsApp loading for user ${userId}: ${percent}% - ${message}`);
  });

  client.on('change_state', (state) => {
    console.log(`WhatsApp state changed for user ${userId}: ${state}`);
  });

  // QR Code event
  client.on('qr', async (qr) => {
    console.log(`QR Code received for user: ${userId}`);

    // QR means init succeeded; stop watchdog
    const watchdog = initWatchdogs.get(userId);
    if (watchdog) {
      clearTimeout(watchdog);
      initWatchdogs.delete(userId);
    }
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      updateSessionQR(userId, qrDataUrl);
      logEvent(userId, 'qr_generated');
      
      // Broadcast to user's WebSocket clients
      broadcastToUser(userId, 'qr', { qrDataUrl });
      broadcastToUser(userId, 'status', { status: 'qr_pending', qrCode: qrDataUrl });
    } catch (err) {
      console.error(`QR generation error for user ${userId}:`, err);
      logEvent(userId, 'qr_error', { error: err.message });
    }
  });

  // Authenticated event
  client.on('authenticated', () => {
    console.log(`WhatsApp authenticated for user: ${userId}`);

    // Authenticated means init succeeded; stop watchdog
    const watchdog = initWatchdogs.get(userId);
    if (watchdog) {
      clearTimeout(watchdog);
      initWatchdogs.delete(userId);
    }
    clearSessionQR(userId);
    updateSessionStatus(userId, 'authenticated');
    logEvent(userId, 'authenticated');
    
    broadcastToUser(userId, 'status', { status: 'authenticated' });
  });

  // Ready event
  client.on('ready', async () => {
    console.log(`WhatsApp ready for user: ${userId}`);

    // Ready means init succeeded; stop watchdog
    const watchdog = initWatchdogs.get(userId);
    if (watchdog) {
      clearTimeout(watchdog);
      initWatchdogs.delete(userId);
    }
    
    try {
      const info = client.info;
      const phoneNumber = info?.wid?.user || 'Unknown';
      const displayName = info?.pushname || 'WhatsApp User';
      
      upsertUserSession(userId, {
        phoneNumber,
        displayName,
        status: 'ready',
        connectedAt: new Date().toISOString()
      });
      
      logEvent(userId, 'ready', { phoneNumber, displayName });
      
      console.log(`User ${userId} connected as: ${displayName} (${phoneNumber})`);
      
      broadcastToUser(userId, 'status', { 
        status: 'ready', 
        phoneNumber, 
        displayName,
        connectedAt: new Date().toISOString()
      });
      broadcastToUser(userId, 'ready', { message: 'WhatsApp is ready' });
    } catch (err) {
      console.error(`Error getting info for user ${userId}:`, err);
      updateSessionStatus(userId, 'ready');
      logEvent(userId, 'ready');
      
      broadcastToUser(userId, 'status', { status: 'ready' });
    }

    // Auto-resend any queued messages that failed due to session disconnect
    try { getResetSessionFailed()(userId); } catch {}
  });

  // Message event
  client.on('message_create', async (message) => {
    try {
      // Skip status messages
      if (message.isStatus) return;
      
      logEvent(userId, 'message', {
        from: message.from,
        to: message.to,
        fromMe: message.fromMe,
        hasMedia: message.hasMedia
      });
      
      broadcastToUser(userId, 'message', {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        body: message.body,
        fromMe: message.fromMe,
        timestamp: message.timestamp
      });
    } catch (err) {
      console.error(`Error processing message for user ${userId}:`, err);
    }
  });

  // Disconnected event
  client.on('disconnected', (reason) => {
    console.log(`WhatsApp disconnected for user ${userId}:`, reason);

    const watchdog = initWatchdogs.get(userId);
    if (watchdog) {
      clearTimeout(watchdog);
      initWatchdogs.delete(userId);
    }
    updateSessionStatus(userId, 'disconnected');
    logEvent(userId, 'disconnected', { reason });
    
    broadcastToUser(userId, 'status', { status: 'disconnected', reason });
    broadcastToUser(userId, 'disconnected', { reason });
    
    // Clean up client
    clients.delete(userId);
  });

  // Auth failure
  client.on('auth_failure', (msg) => {
    console.error(`WhatsApp auth failure for user ${userId}:`, msg);

    const watchdog = initWatchdogs.get(userId);
    if (watchdog) {
      clearTimeout(watchdog);
      initWatchdogs.delete(userId);
    }
    updateSessionStatus(userId, 'disconnected');
    logEvent(userId, 'auth_failure', { message: msg });
    
    broadcastToUser(userId, 'status', { status: 'disconnected', error: 'Authentication failed' });
    broadcastToUser(userId, 'error', { message: 'Authentication failed' });
  });

  clients.set(userId, client);
  return client;
}

// Track which users are currently initializing to prevent duplicate calls
const initializingUsers = new Set();

/**
 * Remove stale Chromium lock files from a user's session directory.
 * When a container dies (redeploy), Chromium leaves SingletonLock/SingletonCookie/SingletonSocket
 * in the profile dir. The new container's Chromium refuses to start with "profile in use" error.
 */
function cleanStaleLockFiles(userId) {
  const sessionBasePath = process.env.WA_SESSION_PATH || path.join(__dirname, 'whatsapp-sessions');
  const sessionDir = path.join(sessionBasePath, `session-${userId}`);

  try {
    fs.lstatSync(sessionDir);
  } catch {
    return; // session dir doesn't exist at all
  }

  // SingletonLock is a SYMLINK. When the old container dies the symlink becomes
  // dangling/broken.  fs.existsSync() follows symlinks and returns false for
  // broken ones, so we must use readdirSync (which lists broken symlinks) and
  // lstatSync (which reads the link itself, not its target).
  const removeLocks = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith('Singleton')) {
        const fullPath = path.join(dir, entry);
        try {
          fs.unlinkSync(fullPath);
          console.log(`[LockCleanup] Removed stale ${entry} for user ${userId} at ${fullPath}`);
        } catch (err) {
          console.warn(`[LockCleanup] Could not remove ${fullPath}:`, err.message);
        }
      }
    }
  };

  // Chromium puts lock files at the root of the user-data-dir
  removeLocks(sessionDir);

  // Also check common subdirectories
  for (const sub of ['Default', 'chrome_crashpad_handler']) {
    removeLocks(path.join(sessionDir, sub));
  }

  console.log(`[LockCleanup] Lock file cleanup completed for user ${userId}`);
}

/**
 * Initialize WhatsApp for a user
 */
async function initializeWhatsApp(userId) {
  // Prevent duplicate initialization
  if (initializingUsers.has(userId)) {
    console.log(`WhatsApp already initializing for user: ${userId}`);
    return { success: true, message: 'Already initializing' };
  }

  const client = getWhatsAppClient(userId);
  
  // Check if already initialized
  const state = await client.getState().catch(() => null);
  if (state === 'CONNECTED') {
    console.log(`WhatsApp already connected for user: ${userId}`);
    return { success: true, message: 'Already connected' };
  }
  
  console.log(`Initializing WhatsApp for user: ${userId}`);
  initializingUsers.add(userId);
  updateSessionStatus(userId, 'launching');
  logEvent(userId, 'initialize_start');

  // If initialization hangs (Chromium stuck), cleanup so the user can retry.
  // This is common on low-memory instances.
  const existingWatchdog = initWatchdogs.get(userId);
  if (existingWatchdog) {
    clearTimeout(existingWatchdog);
  }
  initWatchdogs.set(userId, setTimeout(async () => {
    console.error(`Initialization timeout for user ${userId} (no QR/auth/ready)`);
    initializingUsers.delete(userId);
    initWatchdogs.delete(userId);
    logEvent(userId, 'initialize_timeout');
    updateSessionStatus(userId, 'disconnected');

    const clientToDestroy = clients.get(userId);
    clients.delete(userId);
    try {
      if (clientToDestroy) {
        await clientToDestroy.destroy();
      }
    } catch (e) {
      console.error(`Error destroying timed-out client for user ${userId}:`, e);
    }
  }, 90000));
  
  // Remove stale Chromium lock files left by previous container (persistent volume)
  cleanStaleLockFiles(userId);

  // Start initialization in background (don't block the HTTP response)
  client.initialize().then(() => {
    console.log(`WhatsApp client initialized for user: ${userId}`);
    initializingUsers.delete(userId);
  }).catch(err => {
    console.error(`Initialization error for user ${userId}:`, err);
    initializingUsers.delete(userId);
    const watchdog = initWatchdogs.get(userId);
    if (watchdog) {
      clearTimeout(watchdog);
      initWatchdogs.delete(userId);
    }
    clients.delete(userId);
    updateSessionStatus(userId, 'disconnected');
    logEvent(userId, 'initialize_error', { error: err.message });
  });
  
  return { success: true, message: 'Initialization started' };
}

/**
 * Disconnect WhatsApp for a user
 */
async function disconnectWhatsApp(userId) {
  const client = clients.get(userId);
  
  if (!client) {
    return { success: true, message: 'Not connected' };
  }
  
  console.log(`Disconnecting WhatsApp for user: ${userId}`);
  
  try {
    await client.logout();
    await client.destroy();
    clients.delete(userId);
    
    updateSessionStatus(userId, 'disconnected');
    logEvent(userId, 'disconnect');
    
    broadcastToUser(userId, 'status', { status: 'disconnected' });
    
    return { success: true, message: 'Disconnected successfully' };
  } catch (err) {
    console.error(`Disconnect error for user ${userId}:`, err);
    // Force cleanup even on error
    clients.delete(userId);
    updateSessionStatus(userId, 'disconnected');
    throw err;
  }
}

/**
 * Get connection status for a user
 */
async function getConnectionStatus(userId) {
  const session = getUserSession(userId);
  const client = clients.get(userId);
  
  let isReady = false;
  let clientState = null;
  
  if (client) {
    try {
      clientState = await client.getState();
      isReady = clientState === 'CONNECTED';
    } catch (err) {
      // Client exists but Chromium is still starting — not an error if we're initializing
      clientState = initializingUsers.has(userId) ? 'LAUNCHING' : 'ERROR';
    }
  }
  
  // Use DB status, but if we know we're initializing, override
  let status = session?.status || 'disconnected';
  if (initializingUsers.has(userId) && status === 'disconnected') {
    status = 'launching';
  }
  
  return {
    status,
    qrCode: session?.qr_code || null,
    phoneNumber: session?.phone_number || null,
    displayName: session?.display_name || null,
    connectedAt: session?.connected_at || null,
    lastActivity: session?.last_activity || null,
    isReady,
    clientState
  };
}

/**
 * Get all chats for a user
 */
async function getChats(userId) {
  const client = clients.get(userId);
  
  if (!client) {
    throw new Error('WhatsApp not connected');
  }
  
  const state = await client.getState();
  if (state !== 'CONNECTED') {
    throw new Error('WhatsApp not ready');
  }
  
  const chats = await client.getChats();
  return chats.map(chat => ({
    id: chat.id._serialized,
    name: chat.name,
    isGroup: chat.isGroup,
    unreadCount: chat.unreadCount,
    lastMessage: chat.lastMessage?.body || '',
    timestamp: chat.timestamp
  }));
}

/**
 * Get messages from a chat
 */
async function getMessages(userId, chatId, limit = 100) {
  const client = clients.get(userId);
  
  if (!client) {
    throw new Error('WhatsApp not connected');
  }
  
  const chat = await client.getChatById(chatId);
  const messages = await chat.fetchMessages({ limit });

  // Build a contact-name cache so we don't re-fetch the same contact
  const nameCache = new Map();

  // For group chats, pre-populate cache from participant list
  // This resolves @lid IDs that getContactById cannot handle
  if (chat.isGroup && chat.participants) {
    for (const p of chat.participants) {
      try {
        const pid = p.id?._serialized || p.id;
        if (pid) {
          const contact = await client.getContactById(pid);
          const name = contact.pushname || contact.name || contact.shortName || contact.number || null;
          if (name) {
            nameCache.set(pid, name);
          }
        }
      } catch { /* skip */ }
    }
  }

  // Also try to build a @lid -> name mapping from participants
  // whatsapp-web.js group participants have id in @c.us format
  // but msg.author in groups can be @lid format
  // We build a reverse lookup by phone-number suffix
  const lidLookup = new Map();
  for (const [key, name] of nameCache.entries()) {
    // Extract digits from the @c.us key
    const digits = key.replace(/@.*$/, '');
    if (digits) {
      lidLookup.set(digits, name);
      // Also store last 10 digits for fuzzy match
      if (digits.length > 10) {
        lidLookup.set(digits.slice(-10), name);
      }
    }
  }

  const resolveName = async (contactId) => {
    if (!contactId) return null;
    if (nameCache.has(contactId)) return nameCache.get(contactId);

    // Try @lid -> phone-digit matching
    if (contactId.includes('@lid') || contactId.includes('@g.us')) {
      const digits = contactId.replace(/@.*$/, '');
      const found = lidLookup.get(digits) || lidLookup.get(digits.slice(-10));
      if (found) {
        nameCache.set(contactId, found);
        return found;
      }
    }

    // Direct contact lookup (works for @c.us IDs)
    try {
      const contact = await client.getContactById(contactId);
      const name = contact.pushname || contact.name || contact.shortName || null;
      nameCache.set(contactId, name);
      return name;
    } catch {
      nameCache.set(contactId, null);
      return null;
    }
  };

  const result = await Promise.all(messages.map(async (msg) => {
    const authorId = msg.author || msg.from;
    const authorName = msg.fromMe ? null : await resolveName(authorId);

    // Try to download media
    let mediaData = null;
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          const isVisual = media.mimetype?.startsWith('image/') || media.mimetype?.startsWith('video/');
          mediaData = {
            mimetype: media.mimetype,
            filename: media.filename || null,
            // Inline base64 for images/videos under ~1MB
            data: isVisual && media.data && media.data.length < 1_400_000
              ? media.data : null,
          };
        }
      } catch {
        // Media download can fail for old messages
        mediaData = { mimetype: null, filename: null, data: null };
      }
    }

    return {
      id: msg.id._serialized,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      author: authorId,
      authorName,
      hasMedia: msg.hasMedia,
      type: msg.type,
      media: mediaData,
    };
  }));

  return result;
}

/**
 * Send a message
 */
async function sendMessage(userId, chatId, message) {
  const client = clients.get(userId);
  
  if (!client) {
    throw new Error('WhatsApp not connected');
  }
  
  const state = await client.getState();
  if (state !== 'CONNECTED') {
    throw new Error('WhatsApp not ready');
  }
  
  await client.sendMessage(chatId, message);
  logEvent(userId, 'message_sent', { chatId, messageLength: message.length });
}

/**
 * Get chat by phone number
 */
async function getChatByPhoneNumber(userId, phoneNumber) {
  const client = clients.get(userId);
  
  if (!client) {
    throw new Error('WhatsApp not connected');
  }
  
  const formattedNumber = phoneNumber.replace(/\D/g, '');
  const chatId = `${formattedNumber}@c.us`;
  
  try {
    const chat = await client.getChatById(chatId);
    return {
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body || '',
      timestamp: chat.timestamp
    };
  } catch (err) {
    return null;
  }
}

/**
 * Register WebSocket client for a user
 */
function registerWebSocket(userId, ws) {
  if (!wsClientsByUser.has(userId)) {
    wsClientsByUser.set(userId, new Set());
  }
  wsClientsByUser.get(userId).add(ws);
  
  console.log(`WebSocket registered for user: ${userId}`);
}

/**
 * Unregister WebSocket client
 */
function unregisterWebSocket(userId, ws) {
  const userClients = wsClientsByUser.get(userId);
  if (userClients) {
    userClients.delete(ws);
    if (userClients.size === 0) {
      wsClientsByUser.delete(userId);
    }
  }
}

/**
 * Broadcast message to all WebSocket clients of a user
 */
function broadcastToUser(userId, type, data) {
  const userClients = wsClientsByUser.get(userId);
  if (!userClients) return;
  
  const message = JSON.stringify({ 
    type, 
    data, 
    timestamp: new Date().toISOString() 
  });
  
  userClients.forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      ws.send(message);
    }
  });
}

/**
 * Get all active clients (for diagnostics)
 */
function getActiveClients() {
  return Array.from(clients.keys());
}

/**
 * Destroy all active clients for graceful shutdown.
 * Uses destroy() NOT logout() — logout clears session auth data!
 */
async function destroyAllClients() {
  const userIds = Array.from(clients.keys());
  console.log(`[Shutdown] Destroying ${userIds.length} active WhatsApp client(s)...`);

  for (const userId of userIds) {
    try {
      const client = clients.get(userId);
      if (client) {
        await client.destroy();
        clients.delete(userId);
        console.log(`[Shutdown] Destroyed client for user ${userId}`);
      }
    } catch (err) {
      console.error(`[Shutdown] Error destroying client for ${userId}:`, err.message);
      clients.delete(userId);
    }
  }
}

module.exports = {
  getWhatsAppClient,
  initializeWhatsApp,
  disconnectWhatsApp,
  getConnectionStatus,
  getChats,
  getMessages,
  sendMessage,
  getChatByPhoneNumber,
  registerWebSocket,
  unregisterWebSocket,
  broadcastToUser,
  getActiveClients,
  destroyAllClients
};
