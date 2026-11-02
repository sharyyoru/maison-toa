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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });
    
    const res = await fetch(`${WA_SERVER}/chat-by-phone?phone=${encodeURIComponent(phone)}`, { 
      cache: 'no-store',
      headers: { 'Authorization': authHeader }
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ chat: null });
  }
}
