# WhatsApp Web Integration

## Overview

The clinic system now includes a **WhatsApp Web** integration that allows doctors and staff to send and receive WhatsApp messages directly from the patient page without needing to use their phone for each message.

## Key Features

### 🔐 Persistent Session Storage
- **One-time QR code scan**: After scanning the QR code once, your WhatsApp session is saved securely
- **Long-lasting sessions**: Sessions persist across server restarts and page refreshes
- **No daily scanning required**: The session data is stored in `.wwebjs_auth/` folder on the server

### 📱 Two WhatsApp Modes

The system supports **two WhatsApp integration modes**:

1. **Twilio Mode** (Original)
   - SMS-based WhatsApp messaging via Twilio API
   - Messages stored in database (`whatsapp_messages` table)
   - Good for automated workflows and notifications

2. **WhatsApp Web Mode** (New)
   - Direct WhatsApp Web integration using `whatsapp-web.js`
   - Access to all your WhatsApp chats and contacts
   - Real-time messaging with full WhatsApp features
   - Persistent session (no daily QR scanning)

### 🎯 Toggle Between Modes

On the patient page's WhatsApp tab, you'll see a toggle button to switch between:
- **Twilio**: Traditional SMS-based WhatsApp
- **WhatsApp Web**: Full WhatsApp Web interface

Your preference is saved in browser localStorage and persists across sessions.

## How to Use

### Initial Setup (One-Time)

1. Navigate to any patient page
2. Click on the **CRM** tab
3. Select the **WhatsApp** sub-tab
4. Toggle to **WhatsApp Web** mode
5. Click **"Connect WhatsApp"**
6. Scan the QR code with your phone:
   - Open WhatsApp on your phone
   - Tap **Menu** → **Linked Devices**
   - Tap **"Link a Device"**
   - Scan the QR code displayed on screen

### Daily Usage

After the initial setup, you can:
- **View all your WhatsApp chats** in the left sidebar
- **Select any chat** to view message history
- **Send messages** directly from the interface
- **Search for patient chats** by phone number
- **Refresh chats** to get latest messages

The system will automatically:
- Load the patient's WhatsApp chat if they have a phone number
- Maintain your session across page refreshes
- Reconnect automatically if disconnected

## Technical Details

### Files Created

**Library:**
- `src/lib/whatsapp-web-client.ts` - WhatsApp client singleton with session management

**API Routes:**
- `src/app/api/whatsapp-web/init/route.ts` - Initialize WhatsApp connection
- `src/app/api/whatsapp-web/status/route.ts` - Check connection status
- `src/app/api/whatsapp-web/chats/route.ts` - Get all chats
- `src/app/api/whatsapp-web/messages/[chatId]/route.ts` - Get messages for a chat
- `src/app/api/whatsapp-web/send/route.ts` - Send a message
- `src/app/api/whatsapp-web/chat-by-phone/route.ts` - Find chat by phone number

**Components:**
- `src/components/WhatsAppWebConversation.tsx` - Main WhatsApp Web UI component

**Modified Files:**
- `src/app/patients/[id]/PatientActivityCard.tsx` - Added toggle between Twilio and WhatsApp Web modes

### Session Storage

WhatsApp session data is stored in:
- `.wwebjs_auth/` - Authentication data (added to `.gitignore`)
- `.wwebjs_cache/` - Cache data (added to `.gitignore`)

**Important:** These folders contain sensitive authentication data and should never be committed to version control.

### Dependencies

```json
{
  "whatsapp-web.js": "^1.x.x",
  "qrcode": "^1.x.x"
}
```

## Connection States

The UI displays different states:

1. **Disconnected** - Shows "Connect WhatsApp" button
2. **QR Code** - Displays QR code to scan with phone
3. **Authenticated** - Shows loading spinner while initializing
4. **Ready** - Full chat interface with all features

## Troubleshooting

### Session Expired
If your session expires, simply:
1. Click "Connect WhatsApp" again
2. Scan the new QR code
3. Your session will be saved again

### Connection Issues
- Check that the server has internet access
- Ensure WhatsApp Web is not blocked by firewall
- Verify that `.wwebjs_auth/` folder has write permissions

### Multiple Devices
- WhatsApp allows up to 4 linked devices
- Each server instance counts as one linked device
- You can unlink devices from WhatsApp phone app

## Security Considerations

1. **Session Data**: The `.wwebjs_auth/` folder contains sensitive authentication tokens
2. **Access Control**: Only authorized clinic staff should have access to the system
3. **Data Privacy**: Messages are transmitted directly through WhatsApp's servers
4. **Compliance**: Ensure usage complies with your clinic's data protection policies

## Deployment Notes

### Development
- Session data is stored locally in `.wwebjs_auth/`
- Server restart may require reconnection

### Production (Vercel)
⚠️ **Important**: `whatsapp-web.js` requires a persistent Node.js runtime and cannot run on:
- Vercel Edge Functions
- Cloudflare Workers
- Other serverless platforms without persistent storage

**Recommended deployment options:**
1. **Separate Node.js server** for WhatsApp Web integration
2. **Docker container** with persistent volume for `.wwebjs_auth/`
3. **VPS/dedicated server** with Node.js runtime

For Vercel deployment, consider:
- Using Twilio mode for production
- Running WhatsApp Web on a separate server
- Using a managed WhatsApp Business API solution

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify API routes are responding correctly
3. Check server logs for WhatsApp client errors
4. Ensure dependencies are properly installed

## Future Enhancements

Potential improvements:
- Message templates
- Bulk messaging
- Media file support (images, documents)
- Group chat management
- Message scheduling
- Analytics and reporting
