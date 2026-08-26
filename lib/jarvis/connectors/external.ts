// ─────────────────────────────────────────────────────────────────────────────
// Connectors — social, accounting, payments.
//
// These are DECLARED BUT NOT IMPLEMENTED, and they say so at runtime instead of
// failing mysteriously. Each one reports `configured() === false` with the exact
// credential names it needs, which means:
//
//   • `perform()` refuses before an approval is ever created, so the owner is
//     never asked to approve something that cannot happen;
//   • the agent receives a readable explanation and reports the gap in its
//     summary rather than retrying;
//   • the dashboard's integrations panel lists precisely what is missing.
//
// A stub that throws, or one that silently no-ops and reports success, would
// both be worse than this — the first is noise, the second is a lie the owner
// acts on. The shape below is also the template for finishing them: fill in
// `run`, and nothing else in the system changes.
//
// WHY THESE THREE ARE NOT DONE
//   Social    — Meta and Google Business Profile both need an app review and a
//               three-legged OAuth flow that a headless process cannot complete.
//   Accounting— QuickBooks/Xero OAuth, plus a chart-of-accounts mapping that has
//               to match how this business actually books revenue.
//   Payments  — Stripe is already integrated for taking payment (lib/stripe.ts).
//               What is missing here is deliberate: agents get READ access to
//               payment history through tools, and no write path at all.
// ─────────────────────────────────────────────────────────────────────────────

import { Connector, ConnectorResult } from './index';
import { credential } from '../vault';

function notImplemented(what: string, doc: string): () => Promise<ConnectorResult> {
  return async () => ({
    ok: false,
    detail: `${what} is not implemented yet. ${doc}`,
  });
}

// ── Social ───────────────────────────────────────────────────────────────────

const metaToken = () => credential('META_PAGE_ACCESS_TOKEN');
const metaPageId = () => credential('META_PAGE_ID');
const gbpToken = () => credential('GOOGLE_BUSINESS_REFRESH_TOKEN');

export const socialConnector: Connector = {
  name: 'social',
  label: 'Social media (Facebook, Instagram, Google Business Profile)',
  configured: () => !!(metaToken() && metaPageId()),
  missingCredentials: () =>
    [
      !metaPageId() && 'META_PAGE_ID',
      !metaToken() && 'META_PAGE_ACCESS_TOKEN',
      !gbpToken() && 'GOOGLE_BUSINESS_REFRESH_TOKEN',
    ].filter(Boolean) as string[],
  setupNote:
    'Requires a Meta app with pages_manage_posts (subject to App Review) and a long-lived page token. Until then the Content Agent still writes every post as a reviewable draft — you publish by hand.',
  actions: {
    post: {
      channel: 'social.post',
      description: 'Publish a post to Facebook or Instagram.',
      risk: 'high',
      run: notImplemented(
        'Publishing to social media',
        'The post has been drafted; publish it by hand. See docs/JARVIS.md → Remaining integrations.'
      ),
    },
    postGoogleBusiness: {
      channel: 'social.post',
      description: 'Publish an update to the Google Business Profile.',
      risk: 'high',
      run: notImplemented(
        'Publishing to Google Business Profile',
        'The update has been drafted; publish it by hand.'
      ),
    },
  },
};

// ── Accounting ───────────────────────────────────────────────────────────────

const qbToken = () => credential('QUICKBOOKS_REFRESH_TOKEN');
const qbRealm = () => credential('QUICKBOOKS_REALM_ID');

export const accountingConnector: Connector = {
  name: 'accounting',
  label: 'Accounting (QuickBooks)',
  configured: () => !!(qbToken() && qbRealm()),
  missingCredentials: () =>
    [!qbRealm() && 'QUICKBOOKS_REALM_ID', !qbToken() && 'QUICKBOOKS_REFRESH_TOKEN'].filter(
      Boolean
    ) as string[],
  setupNote:
    'Requires an Intuit developer app and one OAuth consent. Note that this app already records payments and invoices itself (lib/repo/payments.ts) — accounting sync is for your bookkeeper, not for the business to function.',
  actions: {
    syncRevenue: {
      channel: 'accounting.write',
      description: 'Push completed jobs and payments into the accounting ledger.',
      risk: 'high',
      run: notImplemented('Accounting sync', 'Export a CSV from Reports instead.'),
    },
  },
};

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * Read-only by construction. There is no `run` here that moves money, and the
 * one action present refuses unconditionally — `payment.write` is also pinned to
 * 'approve' in config.ts and cannot be set to 'auto'. Two independent
 * mechanisms, because one bad refund is worse than any convenience this could
 * ever buy.
 */
export const paymentsConnector: Connector = {
  name: 'payments',
  label: 'Payments (Stripe)',
  configured: () => false,
  missingCredentials: () => ['(intentionally unavailable to agents)'],
  setupNote:
    'Stripe is integrated for taking payment (lib/stripe.ts), but agents have no write path to it by design. Agents can READ payment history through their analytics tools. Refunds and charges stay in the admin UI, performed by a human.',
  actions: {
    refund: {
      channel: 'payment.write',
      description: 'Refund a payment. Permanently unavailable to agents.',
      risk: 'high',
      run: async () => ({
        ok: false,
        detail:
          'Agents cannot move money. Issue this refund yourself from the admin payments page.',
      }),
    },
  },
};
