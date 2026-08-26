// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/messages  — the signed-in staff member's inbox
// POST /api/messages  — start a conversation
//
// ACCESS RULE (see the header of lib/repo/messages.ts): membership is the only
// thing that grants access. `withAuth('staff')` establishes that the caller
// works here; it does NOT put them in any room. A manager who is not a member
// of a conversation cannot read it, by design — internal messaging is where
// staff discuss each other, and a silent management back door would make it
// useless for that.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, str, stringArray, withAuth } from '@/lib/api';
import { createConversation, findOrCreateDirect, listConversations } from '@/lib/repo/messages';
import { ConversationKind, STAFF_ROLES } from '@/lib/models';
import { canManage } from '@/lib/rbac';
import { listUsers } from '@/lib/repo/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: ConversationKind[] = ['direct', 'group', 'announcement'];

export const GET = withAuth('staff', async ({ user, query }) => {
  const conversations = listConversations(user.id);

  // The composer's "who can I message?" list. Staff only — this is the internal
  // tool, and customers must never appear as a messaging target here.
  const includeStaff = query.get('staff') === '1';
  const staff = includeStaff
    ? listUsers({ roles: [...STAFF_ROLES], activeOnly: true, limit: 200 }).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }))
    : undefined;

  return NextResponse.json({ ok: true, conversations, ...(staff ? { staff } : {}) });
});

export const POST = withAuth(
  'staff',
  async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;

    const kind = (str(b.kind, 20) || 'direct') as ConversationKind;
    if (!KINDS.includes(kind)) return fail('Unknown conversation type.', 400);

    // Announcements broadcast to the whole team, so creating one is a
    // management action rather than something any technician can do.
    if (kind === 'announcement' && !canManage(user.role)) {
      return fail('Only managers can post announcements.', 403);
    }

    const requested = stringArray(b.memberIds, 50, 60).filter((id) => id !== user.id);

    // Members are validated against the STAFF list rather than trusted, so a
    // crafted request cannot pull a customer into an internal room.
    const staffIds = new Set(
      listUsers({ roles: [...STAFF_ROLES], activeOnly: true, limit: 500 }).map((u) => u.id)
    );
    const memberIds = requested.filter((id) => staffIds.has(id));

    if (kind === 'direct') {
      if (memberIds.length !== 1) {
        return fail('Choose exactly one person for a direct message.', 400);
      }
      // findOrCreateDirect is idempotent — opening a DM twice reuses the room
      // instead of forking the history.
      return ok({ conversation: findOrCreateDirect(user.id, memberIds[0]) }, { status: 201 });
    }

    if (kind === 'announcement') {
      // Everyone on staff, whether or not the sender listed them.
      for (const id of staffIds) if (id !== user.id) memberIds.push(id);
    }

    if (!memberIds.length) return fail('Choose at least one person.', 400);

    const title = str(b.title, 120);
    if (!title) return fail('Give the conversation a name.', 400, { title: 'Required.' });

    const conversation = createConversation({
      kind,
      title,
      memberIds: Array.from(new Set(memberIds)),
      createdBy: user.id,
    });

    return ok({ conversation }, { status: 201 });
  },
  { limit: 'message' }
);
