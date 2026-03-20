const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const http = require('http');
const path = require('path');

const PORT = process.env.WA_SERVER_PORT || 3001;

let qrCodeData = null;
let isReady = false;
let connectionStatus = 'disconnected'; // disconnected | launching | qr | authenticated | ready

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '..', '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
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

client.on('qr', async (qr) => {
  console.log('[WA] QR code received');
  qrCodeData = await QRCode.toDataURL(qr);
  connectionStatus = 'qr';
});

client.on('authenticated', () => {
  console.log('[WA] Authenticated');
  connectionStatus = 'authenticated';
  qrCodeData = null;
});

client.on('ready', () => {
  console.log('[WA] Ready!');
  isReady = true;
  connectionStatus = 'ready';
  qrCodeData = null;
});

client.on('disconnected', (reason) => {
  console.log('[WA] Disconnected:', reason);
  isReady = false;
  connectionStatus = 'disconnected';
  qrCodeData = null;
});

client.on('auth_failure', (msg) => {
  console.error('[WA] Auth failure:', msg);
  connectionStatus = 'disconnected';
  isReady = false;
});

// Start the WhatsApp client immediately
console.log('[WA] Launching Chromium...');
connectionStatus = 'launching';
client.initialize();

// ── HTTP server ────────────────────────────────────────────────────────────────

function json(res, data, code = 200) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET /status
  if (req.method === 'GET' && pathname === '/status') {
    return json(res, { status: connectionStatus, qrCode: qrCodeData, isReady });
  }

  // GET /chats
  if (req.method === 'GET' && pathname === '/chats') {
    if (!isReady) return json(res, { error: 'Not ready' }, 503);
    try {
      const chats = await client.getChats();
      return json(res, {
        chats: chats.slice(0, 100).map(c => ({
          id: c.id._serialized,
          name: c.name,
          isGroup: c.isGroup,
          unreadCount: c.unreadCount,
          lastMessage: c.lastMessage?.body || '',
          timestamp: c.timestamp,
        }))
      });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /messages/:chatId
  if (req.method === 'GET' && pathname.startsWith('/messages/')) {
    if (!isReady) return json(res, { error: 'Not ready' }, 503);
    const chatId = decodeURIComponent(pathname.replace('/messages/', ''));
    const limit = parseInt(url.searchParams.get('limit') || '50');
    try {
      const chat = await client.getChatById(chatId);
      const msgs = await chat.fetchMessages({ limit });
      return json(res, {
        messages: msgs.map(m => ({
          id: m.id._serialized,
          body: m.body,
          fromMe: m.fromMe,
          timestamp: m.timestamp,
          author: m.author || m.from,
          hasMedia: m.hasMedia,
          type: m.type,
        }))
      });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /chat-by-phone?phone=...
  if (req.method === 'GET' && pathname === '/chat-by-phone') {
    if (!isReady) return json(res, { chat: null }, 200);
    const phone = url.searchParams.get('phone');
    if (!phone) return json(res, { error: 'phone required' }, 400);
    try {
      // Normalize: strip non-digits, handle Swiss 0xx -> 41xx
      const digits = phone.replace(/\D/g, '');
      const normalized = digits.startsWith('0') ? '41' + digits.slice(1) : digits;
      // Search last 9 digits across all chats (fast, no network call)
      const suffix = normalized.slice(-9);
      const chats = await client.getChats();
      const match = chats.find(c => {
        const chatDigits = c.id.user || '';
        return chatDigits.endsWith(suffix);
      });
      if (match) {
        return json(res, {
          chat: {
            id: match.id._serialized,
            name: match.name,
            isGroup: match.isGroup,
            unreadCount: match.unreadCount,
            lastMessage: match.lastMessage?.body || '',
            timestamp: match.timestamp,
          }
        });
      }
      return json(res, { chat: null });
    } catch (e) {
      return json(res, { chat: null });
    }
  }

  // POST /send
  if (req.method === 'POST' && pathname === '/send') {
    if (!isReady) return json(res, { error: 'Not ready' }, 503);
    const body = await readBody(req);
    const { chatId, message } = body;
    if (!chatId || !message) return json(res, { error: 'chatId and message required' }, 400);
    try {
      let resolvedId = chatId;
      // For new chats (not yet in chat list), resolve the number via WhatsApp
      // This ensures the ID is valid before sending
      if (chatId.endsWith('@c.us')) {
        const number = chatId.replace('@c.us', '');
        try {
          const numberId = await client.getNumberId(number);
          if (numberId) {
            resolvedId = numberId._serialized;
          }
        } catch { /* use original chatId */ }
      }
      await client.sendMessage(resolvedId, message);
      return json(res, { success: true, chatId: resolvedId });
    } catch (e) {
      console.error('[WA] Send error:', e.message, 'chatId:', chatId);
      return json(res, { error: e.message }, 500);
    }
  }

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`[WA] Server listening on http://localhost:${PORT}`);
});
