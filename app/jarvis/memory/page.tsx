// ─────────────────────────────────────────────────────────────────────────────
// /jarvis/memory — what Jarvis knows about the business.
// ─────────────────────────────────────────────────────────────────────────────

import { PageHeader } from '@/components/ui';
import MemoryEditor from '@/components/jarvis/MemoryEditor';
import { requireRolePage } from '@/lib/guards';
import { atLeast } from '@/lib/rbac';
import { recentMemory, searchMemory, isMemoryKind, seedStarterMemory } from '@/lib/jarvis/memory';

export const dynamic = 'force-dynamic';

export default function MemoryPage({
  searchParams,
}: {
  searchParams?: { q?: string; kind?: string };
}) {
  const user = requireRolePage('manager', '/jarvis/memory');

  // First visit populates the starter memories, so the screen explains itself
  // instead of being empty. No-op once anything exists.
  seedStarterMemory();

  const query = searchParams?.q?.trim();
  const kind = isMemoryKind(searchParams?.kind) ? searchParams.kind : undefined;

  const memories = query
    ? searchMemory(query, { kind, limit: 50 })
    : recentMemory({ kind, limit: 50 });

  return (
    <>
      <PageHeader
        eyebrow="Jarvis"
        title="Memory"
        description="Standing facts about the business. Pinned entries are read by every agent, every run."
      />

      <form className="mb-6" method="get">
        <input
          name="q"
          defaultValue={query ?? ''}
          placeholder="Search memory…"
          className="w-full max-w-md rounded-sm border border-white/15 bg-charcoal/60 px-4 py-2.5 text-sm text-white outline-none placeholder:text-subtle focus:border-white/40"
        />
      </form>

      <MemoryEditor
        memories={memories.map((m) => ({
          id: m.id,
          kind: m.kind,
          title: m.title,
          body: m.body,
          tags: m.tags,
          source: m.source,
          pinned: m.pinned,
          confidence: m.confidence,
          updatedAt: m.updatedAt,
        }))}
        canEdit={atLeast(user.role, 'admin')}
      />
    </>
  );
}
