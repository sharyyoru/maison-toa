const jwt = require('jsonwebtoken');

// JWT secret from environment or default (should be same as main app)
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

/**
 * Extract user ID from Authorization header
 * Supports both JWT tokens and simple API keys
 */
function extractUserId(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Try JWT token first
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      // Try to decode JWT
      const decoded = jwt.decode(token);
      
      // Supabase JWT structure
      if (decoded && decoded.sub) {
        return decoded.sub;
      }
      
      // Custom JWT structure
      if (decoded && decoded.userId) {
        return decoded.userId;
      }
      
      if (decoded && decoded.user_id) {
        return decoded.user_id;
      }
    } catch (err) {
      console.error('JWT decode error:', err.message);
    }
  }
  
  // Fallback: treat the entire auth header as a user ID (for testing)
  // Format: "UserId <user-id>" or just the user ID
  if (authHeader.startsWith('UserId ')) {
    return authHeader.substring(7);
  }
  
  // Last resort: use the token itself as user ID (for simple API key auth)
  return authHeader;
}

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  const userId = extractUserId(req);
  
  if (!userId) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please provide Authorization header with Bearer token or UserId'
    });
  }
  
  req.userId = userId;
  next();
}

/**
 * Optional auth middleware - sets userId if available but doesn't require it
 */
function optionalAuth(req, res, next) {
  const userId = extractUserId(req);
  req.userId = userId || null;
  next();
}

module.exports = {
  extractUserId,
  requireAuth,
  optionalAuth
};
