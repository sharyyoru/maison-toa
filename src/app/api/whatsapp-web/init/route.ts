import { NextResponse } from 'next/server';
import { createWhatsAppAuthHeader } from '@/lib/whatsapp-auth';

const WA_SERVER = process.env.WA_SERVER_URL || 'http://localhost:3001';

export async function POST(request: Request) {
  const authHeader = createWhatsAppAuthHeader(request);
  
  if (!authHeader) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  
  const res = await fetch(`${WA_SERVER}/connect`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Authorization': authHeader }
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = { error: 'Upstream did not return JSON' };
  }

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        error: payload?.error || `WhatsApp server error (${res.status})`,
        upstreamStatus: res.status,
        upstreamBody: payload,
      },
      { status: res.status }
    );
  }

  return NextResponse.json({ success: true, upstream: payload });
}
