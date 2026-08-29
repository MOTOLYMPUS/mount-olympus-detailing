import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, endCurrentSession, getSessionUser } from '@/lib/auth';
import { AUDIT, audit } from '@/lib/repo/audit';
import { clientIp, hashIp } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();

  // Revoke server-side first. Clearing only the cookie would leave a valid
  // session row that a stolen token could still use.
  await endCurrentSession();

  if (user) {
    audit({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT.LOGOUT,
      entity: 'user',
      entityId: user.id,
      ipHash: hashIp(clientIp(req.headers)),
    });
  }

  return clearSessionCookie(NextResponse.json({ ok: true }));
}
