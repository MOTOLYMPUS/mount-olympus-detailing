// ─────────────────────────────────────────────────────────────────────────────
// Connector — website content.
//
// WHAT THIS DOES: writes an approved draft to `content/drafts/` as Markdown with
// YAML front matter. It does NOT edit a live page, a component, or a route.
//
// WHY IT STOPS THERE. An agent with write access to `app/` can break the build,
// and a broken build on the marketing site is lost bookings. A Markdown file in
// a directory nothing imports cannot break anything, is reviewable in a diff,
// and is deleted by dragging it to the trash. Publishing is a deliberate human
// step: read the draft, paste it where it belongs, commit.
//
// That is the difference between a system the owner can leave running and one
// they have to supervise. It is also the honest answer to "implement on-site
// changes where appropriate" — appropriate, here, means proposing them.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { Connector, ConnectorResult } from './index';

const DRAFTS_DIR = () =>
  process.env.JARVIS_DRAFTS_DIR?.trim() || path.join(process.cwd(), 'content', 'drafts');

/**
 * Filenames come from model-written titles, so they are rebuilt from scratch
 * rather than sanitised: a slug that can only contain [a-z0-9-] cannot contain
 * `../`, a drive letter, or a NUL, and path traversal here would mean an agent
 * writing anywhere on disk.
 */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'untitled';
}

function yamlEscape(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

interface DraftPayload {
  kind: string;
  title: string;
  body: string;
  meta: Record<string, string>;
}

function readPayload(payload: Record<string, unknown>): DraftPayload | string {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const kind = typeof payload.kind === 'string' ? payload.kind.trim() : 'page';

  if (!title) return 'A draft needs a title.';
  if (!body) return 'A draft needs a body.';
  if (body.length > 100_000) return 'That draft is unreasonably long.';

  const meta: Record<string, string> = {};
  if (payload.meta && typeof payload.meta === 'object') {
    for (const [k, v] of Object.entries(payload.meta as Record<string, unknown>)) {
      // Front-matter keys are restricted to a safe alphabet so a model cannot
      // inject YAML structure into the header.
      if (/^[a-z][a-z0-9_]{0,40}$/i.test(k) && typeof v === 'string') meta[k] = v.slice(0, 500);
    }
  }

  return { kind: slugify(kind), title, body, meta };
}

async function writeDraft(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const parsed = readPayload(payload);
  if (typeof parsed === 'string') return { ok: false, detail: parsed };

  const dir = path.join(DRAFTS_DIR(), parsed.kind);
  fs.mkdirSync(dir, { recursive: true });

  // Date prefix so drafts sort chronologically and a re-run of the same
  // campaign on a later day does not silently overwrite the earlier draft.
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${stamp}-${slugify(parsed.title)}.md`;
  const file = path.join(dir, filename);

  // Final containment check. slugify() should make this impossible; it is here
  // because "should be impossible" is not the standard for a filesystem write.
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(DRAFTS_DIR()))) {
    return { ok: false, detail: 'Refused: that path escapes the drafts directory.' };
  }

  const frontMatter = [
    '---',
    `title: ${yamlEscape(parsed.title)}`,
    `kind: ${yamlEscape(parsed.kind)}`,
    `created: ${yamlEscape(new Date().toISOString())}`,
    'status: "draft"',
    ...Object.entries(parsed.meta).map(([k, v]) => `${k}: ${yamlEscape(v)}`),
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(resolved, frontMatter + parsed.body + '\n', 'utf8');

  return {
    ok: true,
    detail: `Draft written to content/drafts/${parsed.kind}/${filename}`,
    data: { path: `content/drafts/${parsed.kind}/${filename}` },
  };
}

/**
 * SEO changes land as a checklist rather than an edit, for the same reason: a
 * title-tag change in the wrong file is a silent ranking regression that nobody
 * notices for weeks.
 */
async function proposeSeoChange(payload: Record<string, unknown>): Promise<ConnectorResult> {
  const target = typeof payload.target === 'string' ? payload.target.trim() : '';
  const change = typeof payload.change === 'string' ? payload.change.trim() : '';
  const rationale = typeof payload.rationale === 'string' ? payload.rationale.trim() : '';

  if (!target || !change) {
    return { ok: false, detail: 'An SEO proposal needs a target page and the change to make.' };
  }

  return writeDraft({
    kind: 'seo',
    title: `SEO — ${target}`,
    body: [`## Target\n\n${target}`, `## Change\n\n${change}`, `## Why\n\n${rationale || '—'}`].join(
      '\n\n'
    ),
    meta: { target },
  });
}

export const websiteConnector: Connector = {
  name: 'website',
  label: 'Website drafts (built in)',
  configured: () => true,
  missingCredentials: () => [],
  setupNote:
    'Built in. Drafts are written to content/drafts/ for you to review and publish by hand. Nothing is ever written to app/ or components/.',
  actions: {
    writeDraft: {
      channel: 'website.content',
      description: 'Write a content draft (blog post, service description, landing copy) to disk.',
      risk: 'low',
      run: writeDraft,
    },
    proposeSeoChange: {
      channel: 'website.technical',
      description: 'Record a proposed metadata, linking, or technical SEO change for review.',
      risk: 'low',
      run: proposeSeoChange,
    },
  },
};
