const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Initialize SQLite database
const dbPath = process.env.DB_PATH || path.join(__dirname, 'sessions.db');
// Ensure directory exists before opening DB
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    user_id TEXT PRIMARY KEY,
    phone_number TEXT,
    display_name TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    connected_at TEXT,
    last_activity TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS session_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_sessions(user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_logs_user_id ON session_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_session_logs_timestamp ON session_logs(timestamp);
`);

// Prepared statements
const statements = {
  getUserSession: db.prepare('SELECT * FROM user_sessions WHERE user_id = ?'),

  ensureUserSession: db.prepare(`
    INSERT OR IGNORE INTO user_sessions (user_id, status, last_activity, updated_at)
    VALUES (?, 'disconnected', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `),
  
  upsertUserSession: db.prepare(`
    INSERT INTO user_sessions (user_id, phone_number, display_name, status, qr_code, connected_at, last_activity, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      phone_number = excluded.phone_number,
      display_name = excluded.display_name,
      status = excluded.status,
      qr_code = excluded.qr_code,
      connected_at = excluded.connected_at,
      last_activity = excluded.last_activity,
      updated_at = CURRENT_TIMESTAMP
  `),
  
  updateSessionStatus: db.prepare(`
    UPDATE user_sessions 
    SET status = ?, last_activity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),
  
  updateSessionQR: db.prepare(`
    UPDATE user_sessions 
    SET qr_code = ?, status = 'qr_pending', last_activity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),
  
  clearSessionQR: db.prepare(`
    UPDATE user_sessions 
    SET qr_code = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),
  
  getAllActiveSessions: db.prepare(`
    SELECT user_id, status, last_activity 
    FROM user_sessions 
    WHERE status IN ('ready', 'authenticated', 'qr_pending')
  `),
  
  logEvent: db.prepare(`
    INSERT INTO session_logs (user_id, event_type, event_data)
    VALUES (?, ?, ?)
  `),
  
  getRecentLogs: db.prepare(`
    SELECT * FROM session_logs 
    WHERE user_id = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `),

  getReconnectableSessions: db.prepare(`
    SELECT user_id, phone_number, display_name, status, connected_at
    FROM user_sessions 
    WHERE status IN ('ready', 'authenticated')
  `),

  markAllDisconnected: db.prepare(`
    UPDATE user_sessions 
    SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('ready', 'authenticated', 'qr_pending', 'launching')
  `)
};

// Helper functions
function getUserSession(userId) {
  return statements.getUserSession.get(userId);
}

function upsertUserSession(userId, data) {
  const now = new Date().toISOString();
  statements.upsertUserSession.run(
    userId,
    data.phoneNumber || null,
    data.displayName || null,
    data.status || 'disconnected',
    data.qrCode || null,
    data.connectedAt || null,
    now
  );
}

function ensureUserSession(userId) {
  statements.ensureUserSession.run(userId);
}

function updateSessionStatus(userId, status) {
  ensureUserSession(userId);
  const now = new Date().toISOString();
  statements.updateSessionStatus.run(status, now, userId);
}

function updateSessionQR(userId, qrCode) {
  ensureUserSession(userId);
  const now = new Date().toISOString();
  statements.updateSessionQR.run(qrCode, now, userId);
}

function clearSessionQR(userId) {
  ensureUserSession(userId);
  statements.clearSessionQR.run(userId);
}

function getAllActiveSessions() {
  return statements.getAllActiveSessions.all();
}

function logEvent(userId, eventType, eventData = null) {
  ensureUserSession(userId);
  const dataStr = eventData ? JSON.stringify(eventData) : null;
  statements.logEvent.run(userId, eventType, dataStr);
}

function getRecentLogs(userId, limit = 50) {
  return statements.getRecentLogs.all(userId, limit);
}

// Cleanup old logs (keep last 30 days)
function getReconnectableSessions() {
  return statements.getReconnectableSessions.all();
}

function markAllDisconnected() {
  return statements.markAllDisconnected.run();
}

function cleanupOldLogs() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM session_logs WHERE timestamp < ?').run(thirtyDaysAgo);
}

// Run cleanup daily
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

module.exports = {
  db,
  getUserSession,
  ensureUserSession,
  upsertUserSession,
  updateSessionStatus,
  updateSessionQR,
  clearSessionQR,
  getAllActiveSessions,
  logEvent,
  getRecentLogs,
  getReconnectableSessions,
  markAllDisconnected,
  cleanupOldLogs
};
