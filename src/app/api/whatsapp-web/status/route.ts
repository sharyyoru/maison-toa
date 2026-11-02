import { NextResponse } from 'next/server';
import { createWhatsAppAuthHeader } from '@/lib/whatsapp-auth';
import { requireStaff, requireRole, authErrorResponse } from "@/lib/serverAuth";

const WA_SERVER = process.env.WA_SERVER_URL || 'http://localhost:3001';

export async function GET(request: Request) {
    try {
      await requireStaff(request);
    } catch (err) {
      return authErrorResponse(err);
    }
  try {
    const authHeader = createWhatsAppAuthHeader(request);
    
    if (!authHeader) {
      return NextResponse.json({ 
        status: 'disconnected', 
        error: 'Authentication required' 
      }, { status: 401 });
    }
    
    const res = await fetch(`${WA_SERVER}/status`, { 
      cache: 'no-store',
      headers: {
        'Authorization': authHeader
      }
    });
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ 
      status: 'disconnected', 
      qrCode: null, 
      isReady: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}
