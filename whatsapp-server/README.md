# Aesthetics Clinic WhatsApp Server (Multi-User)

Multi-user WhatsApp Web server with SQLite session management for the Aesthetics Clinic CRM.

## Features

- ✅ **Multi-user sessions** - Each doctor/user has their own WhatsApp connection
- ✅ **SQLite session storage** - Persistent session data across restarts
- ✅ **JWT authentication** - Secure user identification via Bearer tokens
- ✅ **Real-time WebSocket updates** - Live QR codes and message notifications
- ✅ **User isolation** - No account spilling between users
- ✅ **Session persistence** - WhatsApp sessions survive server restarts
- ✅ **Docker ready** - Containerized for Railway deployment

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Main CRM Application                   │
│              (Next.js on Vercel)                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/WebSocket
                     │ Authorization: Bearer <jwt>
                     ▼
┌─────────────────────────────────────────────────────────┐
│            WhatsApp Server (Express.js)                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   User A     │  │   User B     │  │   User C     │ │
│  │  WhatsApp    │  │  WhatsApp    │  │  WhatsApp    │ │
│  │  Client      │  │  Client      │  │  Client      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                 │                 │          │
│         └─────────────────┴─────────────────┘          │
│                           │                            │
│                    ┌──────▼──────┐                     │
│                    │   SQLite    │                     │
│                    │  sessions.db│                     │
│                    └─────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## Installation

### Local Development

```bash
cd whatsapp-server
npm install
cp env.example .env
# Edit .env with your configuration
npm start
```

### Docker

```bash
docker build -t whatsapp-server .
docker run -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/whatsapp-sessions:/app/whatsapp-sessions \
  -e JWT_SECRET=your-secret \
  -e ALLOWED_ORIGINS=http://localhost:3000 \
  whatsapp-server
```

### Railway Deployment

1. Create a new project on Railway
2. Connect your GitHub repository
3. Set the root directory to `whatsapp-server`
4. Add environment variables:
   - `JWT_SECRET` - Your JWT secret (same as main app)
   - `ALLOWED_ORIGINS` - Your frontend URLs (comma-separated)
   - `PORT` - Railway will set this automatically
5. Add a volume mount for persistence:
   - Mount path: `/app/data` (for SQLite database)
   - Mount path: `/app/whatsapp-sessions` (for WhatsApp sessions)
6. Deploy!

### Production URL

**WhatsApp Server**: https://aestheticclinic-production.up.railway.app

## Main App Configuration

Update your main application's environment variables:

```bash
# In your main app's .env.local
WA_SERVER_URL=https://aestheticclinic-production.up.railway.app
```

## API Endpoints

All endpoints require `Authorization: Bearer <jwt>` header with a valid JWT token containing user ID.

### Connection Management

- `GET /status` - Get current connection status for authenticated user
- `POST /connect` - Initialize WhatsApp connection (generates QR code)
- `POST /disconnect` - Disconnect and logout WhatsApp session

### Messaging

- `GET /chats` - Get all chats for the user
- `GET /messages/:chatId?limit=50` - Get messages from a specific chat
- `POST /send` - Send a message
  ```json
  {
    "chatId": "41791234567@c.us",
    "message": "Hello from the clinic!"
  }
  ```
- `GET /chat-by-phone?phone=+41791234567` - Find chat by phone number

### Monitoring

- `GET /health` - Health check (no auth required)
- `GET /logs?limit=50` - Get session logs for authenticated user
- `GET /diagnostics` - Server diagnostics
- `GET /admin/sessions` - Get all active sessions (admin only)

## WebSocket Connection

Connect to `ws://your-server:3001?token=<jwt>` for real-time updates.

Events received:
- `status` - Connection status changes
- `qr` - QR code generated (scan with phone)
- `ready` - WhatsApp connected and ready
- `message` - New message received
- `disconnected` - Session disconnected
- `error` - Error occurred

Example:
```javascript
const ws = new WebSocket(`ws://localhost:3001?token=${jwtToken}`);

ws.onmessage = (event) => {
  const { type, data, timestamp } = JSON.parse(event.data);
  
  if (type === 'qr') {
    // Display QR code: data.qrDataUrl
  } else if (type === 'ready') {
    // WhatsApp is connected!
  }
};
```

## Authentication

The server extracts user ID from JWT tokens in the following order:

1. **Supabase JWT**: `decoded.sub`
2. **Custom JWT**: `decoded.userId` or `decoded.user_id`
3. **Simple Auth**: `UserId <user-id>` header format
4. **API Key**: Raw token as user ID (for testing)

Example JWT payload:
```json
{
  "sub": "user-123",
  "email": "doctor@clinic.com",
  "iat": 1234567890
}
```

## Database Schema

SQLite database stores session information:

```sql
CREATE TABLE user_sessions (
  user_id TEXT PRIMARY KEY,
  phone_number TEXT,
  display_name TEXT,
  status TEXT DEFAULT 'disconnected',
  qr_code TEXT,
  connected_at TEXT,
  last_activity TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE session_logs (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  event_type TEXT,
  event_data TEXT,
  timestamp TEXT
);
```

## Session Persistence

- WhatsApp sessions are stored in `/app/whatsapp-sessions/<user-id>/`
- SQLite database is stored in `/app/data/sessions.db`
- Both directories should be mounted as volumes for persistence
- Sessions survive server restarts and redeployments

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | Server port |
| `ALLOWED_ORIGINS` | Yes | - | Comma-separated CORS origins |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `SUPABASE_JWT_SECRET` | No | - | Alternative JWT secret |
| `DB_PATH` | No | `./sessions.db` | SQLite database path |
| `PUPPETEER_EXECUTABLE_PATH` | No | Auto | Chromium path (set in Docker) |

## Troubleshooting

### QR Code Not Generating
- Check that Chromium is installed (Docker handles this)
- Verify Puppeteer can launch headless browser
- Check logs for initialization errors

### Authentication Failures
- Verify JWT_SECRET matches your main application
- Check that JWT token is valid and not expired
- Ensure Authorization header format is correct

### Session Not Persisting
- Verify volume mounts are configured correctly
- Check file permissions on `/app/data` and `/app/whatsapp-sessions`
- Review Railway volume configuration

### Multiple Users Same Account
- This should NOT happen with this implementation
- Each user gets their own isolated WhatsApp client
- Check that user IDs are being extracted correctly from JWT

## Security Notes

- Never expose this server directly to the internet without authentication
- Always use HTTPS/WSS in production
- Rotate JWT secrets regularly
- Monitor session logs for suspicious activity
- Implement rate limiting for production use

## License

Proprietary - Aesthetics Clinic XT SA
