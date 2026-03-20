import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import QRCode from 'qrcode';

let client: Client | null = null;
let qrCodeData: string | null = null;
let isReady = false;
let connectionStatus: 'disconnected' | 'qr' | 'authenticated' | 'ready' = 'disconnected';

const listeners: { [key: string]: Function[] } = {
  qr: [],
  ready: [],
  message: [],
  disconnected: [],
  authenticated: []
};

export function getWhatsAppClient() {
  if (!client) {
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
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
      console.log('QR Code received');
      qrCodeData = await QRCode.toDataURL(qr);
      connectionStatus = 'qr';
      listeners.qr.forEach(fn => fn(qrCodeData));
    });

    client.on('ready', () => {
      console.log('WhatsApp Web is ready!');
      isReady = true;
      connectionStatus = 'ready';
      qrCodeData = null;
      listeners.ready.forEach(fn => fn());
    });

    client.on('authenticated', () => {
      console.log('WhatsApp Web authenticated');
      connectionStatus = 'authenticated';
      listeners.authenticated.forEach(fn => fn());
    });

    client.on('message_create', (message: Message) => {
      listeners.message.forEach(fn => fn(message));
    });

    client.on('disconnected', (reason) => {
      console.log('WhatsApp Web disconnected:', reason);
      isReady = false;
      connectionStatus = 'disconnected';
      qrCodeData = null;
      listeners.disconnected.forEach(fn => fn());
    });

    client.on('auth_failure', (msg) => {
      console.error('WhatsApp Web authentication failure:', msg);
      connectionStatus = 'disconnected';
      isReady = false;
    });
  }

  return client;
}

export function initializeWhatsApp() {
  const client = getWhatsAppClient();
  if (!isReady && connectionStatus === 'disconnected') {
    console.log('Initializing WhatsApp Web client...');
    client.initialize();
  }
}

export function getConnectionStatus() {
  return {
    status: connectionStatus,
    qrCode: qrCodeData,
    isReady
  };
}

export function addEventListener(event: string, callback: Function) {
  if (listeners[event]) {
    listeners[event].push(callback);
  }
}

export function removeEventListener(event: string, callback: Function) {
  if (listeners[event]) {
    listeners[event] = listeners[event].filter(fn => fn !== callback);
  }
}

export async function getChats() {
  if (!isReady || !client) return [];
  try {
    const chats = await client.getChats();
    return chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body || '',
      timestamp: chat.timestamp
    }));
  } catch (error) {
    console.error('Error getting chats:', error);
    return [];
  }
}

export async function getMessages(chatId: string, limit: number = 50) {
  if (!isReady || !client) return [];
  try {
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    return messages.map(msg => ({
      id: msg.id._serialized,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      author: msg.author || msg.from,
      hasMedia: msg.hasMedia,
      type: msg.type
    }));
  } catch (error) {
    console.error('Error getting messages:', error);
    return [];
  }
}

export async function sendMessage(chatId: string, message: string) {
  if (!isReady || !client) {
    throw new Error('WhatsApp Web is not ready');
  }
  try {
    await client.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

export async function searchChats(query: string) {
  if (!isReady || !client) return [];
  try {
    const chats = await getChats();
    return chats.filter(chat => 
      chat.name.toLowerCase().includes(query.toLowerCase())
    );
  } catch (error) {
    console.error('Error searching chats:', error);
    return [];
  }
}

export async function getChatByPhoneNumber(phoneNumber: string) {
  if (!isReady || !client) return null;
  try {
    const formattedNumber = phoneNumber.replace(/\D/g, '');
    const chatId = `${formattedNumber}@c.us`;
    const chat = await client.getChatById(chatId);
    return {
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body || '',
      timestamp: chat.timestamp
    };
  } catch (error) {
    console.error('Error getting chat by phone number:', error);
    return null;
  }
}

export function destroyClient() {
  if (client) {
    client.destroy();
    client = null;
    isReady = false;
    connectionStatus = 'disconnected';
    qrCodeData = null;
  }
}
