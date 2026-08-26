// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/jarvis/memory — search or list what Jarvis knows
// POST   /api/jarvis/memory — teach it something, or correct it
// DELETE /api/jarvis/memory — forget something
//
// The owner's direct line into agent behaviour: pinned memories go into every
// agent's system prompt, so editing one here changes what all eight do on their
// next run. That is why writes are admin-only and audited — a memory saying
// "always offer 50% off" would be obeyed.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth, str, text } from '@/lib/api';
import {
  forget,
  getMemory,
  isMemoryKind,
  recentMemory,
  remember,
  searchMemory,
  setPinned,
} from '@/lib/jarvis/memory';
import { audit } from '@/lib/repo/audit';

export const GET = withAuth('manager', async ({ query }) => {
  const q = query.get('q');
  const kind = query.get('kind');
  const limit = Number(query.get('limit')) || 50;

  return ok({
    memories: q
      ? searchMemory(q, { kind: isMemoryKind(kind) ? kind : undefined, limit })
      : recentMemory({ kind: isMemoryKind(kind) ? kind : undefined, limit }),
  });
});

interface WriteBody {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  tags?: unknown;
  pinned?: unknown;
}

export const POST = withAuth<WriteBody>(
  'admin',
  async ({ user, body, ipHash }) => {
    const kind = str(body?.kind, 40);
    if (!isMemoryKind(kind)) return fail('Unknown memory kind.', 400, { kind: 'Not a valid kind.' });

    const title = str(body?.title, 300);
    if (!title) return fail('A memory needs a title.', 400, { title: 'Required.' });

    const memory = remember({
      id: typeof body?.id === 'string' ? body.id : undefined,
      kind,
      title,
      body: text(body?.body, 20_000),
      tags: Array.isArray(body?.tags)
        ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10)
        : [],
      pinned: body?.pinned === true,
      source: 'owner',
      // Stated by a human, so it is not flagged as an agent's guess.
      confidence: 1.0,
    });

    audit({
      actorId: user.id,
      actorRole: user.role,
      action: 'jarvis.memory_write',
      entity: 'jarvis_memory',
      entityId: memory.id,
      meta: { kind, title, pinned: memory.pinned },
      ipHash,
    });

    return ok({ memory });
  },
  { limit: 'api' }
);

export const PATCH = withAuth<{ id?: unknown; pinned?: unknown }>('admin', async ({ user, body, ipHash }) => {
  const id = str(body?.id, 60);
  const memory = getMemory(id);
  if (!memory) return fail('No such memory.', 404);

  setPinned(id, body?.pinned === true);
  audit({
    actorId: user.id,
    actorRole: user.role,
    action: 'jarvis.memory_pin',
    entity: 'jarvis_memory',
    entityId: id,
    meta: { pinned: body?.pinned === true },
    ipHash,
  });

  return ok({ memory: getMemory(id) });
});

export const DELETE = withAuth('admin', async ({ user, query, ipHash }) => {
  const id = str(query.get('id'), 60);
  const memory = getMemory(id);
  if (!memory) return fail('No such memory.', 404);

  forget(id);
  audit({
    actorId: user.id,
    actorRole: user.role,
    action: 'jarvis.memory_delete',
    entity: 'jarvis_memory',
    entityId: id,
    meta: { title: memory.title },
    ipHash,
  });

  return ok({ deleted: true });
});
