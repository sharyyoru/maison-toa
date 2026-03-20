import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Get authenticated user ID from request headers
 * Extracts from Supabase auth or custom auth headers
 */
export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return null;
  }

  // Try to get user from Supabase auth
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (user && !error) {
        return user.id;
      }
    } catch (err) {
      console.error('Error getting user from token:', err);
    }
  }
  
  return null;
}

/**
 * Create authorization header for WhatsApp server requests
 */
export function createWhatsAppAuthHeader(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  return authHeader || null;
}
