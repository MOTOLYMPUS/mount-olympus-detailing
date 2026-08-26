// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pricing — the current admin price overrides, for the CLIENT preview.
//
// Public on purpose and safe: it exposes nothing the customer would not already
// see the moment they open the estimate wizard — it IS the price list. The
// client fetches this once so its live preview matches the number the server
// will authoritatively store. Without it, an owner's price edit would show in
// the confirmation email but not in the wizard the customer just used.
//
// The server NEVER trusts this response back — the authoritative price is
// recomputed server-side in /api/estimates and the booking path from the same
// database overrides. This endpoint is display-only.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getPriceOverrides } from '@/lib/repo/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    return NextResponse.json(
      { ok: true, overrides: getPriceOverrides() },
      {
        // Short cache: price edits should show up quickly, but the wizard does
        // not need a fresh read on every keystroke.
        headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
      }
    );
  } catch (e) {
    console.error('[pricing] overrides read failed', e);
    // Fail open to code defaults — a preview must never be blocked by this.
    return NextResponse.json({ ok: true, overrides: {} });
  }
}
