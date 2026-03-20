import { NextResponse } from 'next/server';
import { createWhatsAppAuthHeader } from '@/lib/whatsapp-auth';

const WA_SERVER = process.env.WA_SERVER_URL || 'http://localhost:3001';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const authHeader = createWhatsAppAuthHeader(request);
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const { chatId } = await params;
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || '50';
    const res = await fetch(`${WA_SERVER}/messages/${encodeURIComponent(chatId)}?limit=${limit}`, { 
      cache: 'no-store',
      headers: { 'Authorization': authHeader }
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'WhatsApp server unavailable' }, { status: 503 });
  }
}
