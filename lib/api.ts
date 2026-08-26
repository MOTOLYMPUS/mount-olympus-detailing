// ─────────────────────────────────────────────────────────────────────────────
// Route-handler plumbing.
//
// Every protected API route in this app is written as
//
//     export const POST = withAuth('manager', async ({ user, body }) => { … });
//
// so that authentication, authorisation, rate limiting, body parsing, error
// shaping and audit context are applied uniformly. A route that forgets a check
// is the classic way an app leaks data; here there is no way to define a
// handler *without* stating who may call it.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, getSessionUser } from './auth';
import { Role, User } from './models';
import { atLeast, isStaff } from './rbac';
import { LimitBucket, consume } from './ratelimit';
import { clientIp, hashIp } from './security';

export interface HandlerContext<TBody = unknown> {
  req: NextRequest;
  user: User;
  body: TBody;
  params: Record<string, string>;
  ipHash: string | null;
  /** Query string parameters, pre-parsed. */
  query: URLSearchParams;
}

export interface PublicHandlerContext<TBody = unknown>
  extends Omit<HandlerContext<TBody>, 'user'> {
  user: User | null;
}

// ── Responses ────────────────────────────────────────────────────────────────

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, ...(data as object) }, init);
}

export function fail(
  message: string,
  status = 400,
  errors?: Record<string, string>
): NextResponse {
  return NextResponse.json({ ok: false, error: message, errors: errors ?? {} }, { status });
}

// ── Guard ────────────────────────────────────────────────────────────────────

/**
 * `'any'`   — must be signed in, role irrelevant
 * `'staff'` — any non-customer role
 * a Role    — that role or higher (see lib/rbac.ts for the ranking)
 */
export type Requirement = 'any' | 'staff' | Role;

function satisfies(user: User, requirement: Requirement): boolean {
  if (requirement === 'any') return true;
  if (requirement === 'staff') return isStaff(user.role);
  return atLeast(user.role, requirement);
}

export interface RouteOptions {
  /** Rate-limit bucket keyed on the caller's user id (or IP when anonymous). */
  limit?: LimitBucket;
  /** Reject bodies larger than this many bytes. Defaults to 1 MB. */
  maxBodyBytes?: number;
  /** Skip JSON parsing — for multipart uploads, which read the body themselves. */
  rawBody?: boolean;
}

const DEFAULT_MAX_BODY = 1024 * 1024;

type RouteHandler<TBody> = (ctx: HandlerContext<TBody>) => Promise<NextResponse> | NextResponse;
type PublicRouteHandler<TBody> = (
  ctx: PublicHandlerContext<TBody>
) => Promise<NextResponse> | NextResponse;

/** Next.js passes `{ params }` as the second argument to a route handler. */
type NextRouteArgs = { params?: Record<string, string> };

export function withAuth<TBody = any>(
  requirement: Requirement,
  handler: RouteHandler<TBody>,
  options: RouteOptions = {}
) {
  return async (req: NextRequest, args: NextRouteArgs = {}): Promise<NextResponse> => {
    const ipHash = hashIp(clientIp(req.headers));

    let user: User | null;
    try {
      user = getSessionUser();
    } catch (e) {
      console.error('[api] session lookup failed', e);
      return fail('Authentication is temporarily unavailable.', 503);
    }

    if (!user) return fail('Please sign in.', 401);
    if (!satisfies(user, requirement)) return fail('You do not have access to that.', 403);

    if (options.limit) {
      const result = consume(options.limit, user.id);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: 'Too many requests. Please slow down.' },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
        );
      }
    }

    const parsed = await readBody<TBody>(req, options);
    if (parsed.error) return parsed.error;

    try {
      return await handler({
        req,
        user,
        body: parsed.body as TBody,
        params: args.params ?? {},
        ipHash,
        query: req.nextUrl.searchParams,
      });
    } catch (e) {
      return handleError(e);
    }
  };
}

/**
 * For endpoints that work signed-out but behave differently signed-in — the AI
 * assistant, and the public availability calendar.
 */
export function withOptionalAuth<TBody = any>(
  handler: PublicRouteHandler<TBody>,
  options: RouteOptions = {}
) {
  return async (req: NextRequest, args: NextRouteArgs = {}): Promise<NextResponse> => {
    const ipHash = hashIp(clientIp(req.headers));
    let user: User | null = null;
    try {
      user = getSessionUser();
    } catch {
      user = null;
    }

    if (options.limit) {
      const result = consume(options.limit, user?.id ?? ipHash ?? 'anonymous');
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: 'Too many requests. Please slow down.' },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
        );
      }
    }

    const parsed = await readBody<TBody>(req, options);
    if (parsed.error) return parsed.error;

    try {
      return await handler({
        req,
        user,
        body: parsed.body as TBody,
        params: args.params ?? {},
        ipHash,
        query: req.nextUrl.searchParams,
      });
    } catch (e) {
      return handleError(e);
    }
  };
}

// ── Body handling ────────────────────────────────────────────────────────────

async function readBody<TBody>(
  req: NextRequest,
  options: RouteOptions
): Promise<{ body: TBody | null; error: NextResponse | null }> {
  if (options.rawBody) return { body: null, error: null };
  if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') {
    return { body: null, error: null };
  }

  const declared = Number(req.headers.get('content-length') ?? 0);
  const max = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  if (declared > max) {
    return { body: null, error: fail('Request body too large.', 413) };
  }

  const text = await req.text();
  if (!text) return { body: {} as TBody, error: null };
  if (text.length > max) {
    return { body: null, error: fail('Request body too large.', 413) };
  }

  try {
    return { body: JSON.parse(text) as TBody, error: null };
  } catch {
    return { body: null, error: fail('Invalid JSON.', 400) };
  }
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Thrown by domain code to produce a specific HTTP status without every
 * function having to return a discriminated union.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public fields?: Record<string, string>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function handleError(e: unknown): NextResponse {
  if (e instanceof ApiError) return fail(e.message, e.status, e.fields);
  if (e instanceof AuthError) {
    return e.kind === 'unauthenticated'
      ? fail('Please sign in.', 401)
      : fail('You do not have access to that.', 403);
  }

  // Anything unexpected: log the detail, return a generic message. An internal
  // error string can disclose schema, paths, or provider keys.
  console.error('[api] unhandled error', e);
  return fail('Something went wrong. Please try again.', 500);
}

// ── Small parsing helpers shared by handlers ─────────────────────────────────

export function str(v: unknown, max = 500): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Preserves newlines — for notes and message bodies. */
export function text(v: unknown, max = 5000): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[ --]/g, '')
    .trim()
    .slice(0, max);
}

export function int(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function stringArray(v: unknown, maxItems = 40, maxLen = 100): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, maxLen)))
  ).slice(0, maxItems);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isIsoDateTime(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
