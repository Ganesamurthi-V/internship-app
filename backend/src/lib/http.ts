/**
 * HTTP plumbing: response envelopes, request parsing, and the handler wrapper
 * that every route goes through.
 *
 * The envelope shapes are fixed by 05_API_Spec "Standard Response Shapes". Route
 * handlers only ever return the helpers below, so the mobile client can unwrap
 * `{ data }` / `{ error }` in exactly one place.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { Pagination } from '@ims/shared-types';
import { clientContextSchema } from '@ims/shared-validation';
import { ApiError, fromZodError, toApiError, validationError } from './errors';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** `no-store` on every response: these payloads are personal data. */
const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
};

export function ok<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 200, headers: BASE_HEADERS });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201, headers: BASE_HEADERS });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: BASE_HEADERS });
}

export function listResponse<T>(data: T[], pagination: Pagination): NextResponse {
  return NextResponse.json({ data, pagination }, { status: 200, headers: BASE_HEADERS });
}

export function buildPagination(total: number, page: number, pageSize: number): Pagination {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export function errorResponse(error: ApiError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    },
    { status: error.status, headers: BASE_HEADERS },
  );
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/**
 * Parses and validates a JSON body.
 *
 * A malformed body becomes a 422 with a field message rather than an unhandled
 * `SyntaxError`, because a truncated request from a flaky mobile connection is an
 * expected condition, not a server fault.
 *
 * The generic is `S extends z.ZodTypeAny` returning `z.output<S>`, rather than the
 * more obvious `schema: ZodType<T>`. That matters: `ZodType<T>` is shorthand for
 * `ZodType<T, ZodTypeDef, T>`, which pins the schema's *input* type equal to its
 * output. Most schemas here use `.transform()` (text sanitising, email
 * lower-casing, tag de-duplication) so input and output genuinely differ, and
 * asking TypeScript to unify them makes it structurally compare two large,
 * divergent object types at every call site. That is not a style preference — it
 * exhausted an 8 GB heap during `tsc`. Inferring from a single type parameter and
 * reading the output off it costs nothing.
 */
export async function parseJson<S extends z.ZodTypeAny>(
  request: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validationError('Request body must be valid JSON.', { _: 'Malformed JSON body.' });
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw fromZodError(result.error);
  }
  return result.data;
}

/** Parses `?a=1&b=2` through a Zod schema. Repeated keys collapse to the last value. */
export function parseQuery<S extends z.ZodTypeAny>(request: NextRequest, schema: S): z.output<S> {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);
  if (!result.success) {
    throw fromZodError(result.error, 'Invalid query parameters');
  }
  return result.data;
}

export type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * Reads a dynamic route segment. Next 15 delivers `params` as a Promise, so this
 * awaits it and asserts the segment is present.
 */
export async function routeParam(context: RouteContext, name: string): Promise<string> {
  const params = await context.params;
  const value = params[name];
  const single = Array.isArray(value) ? value[0] : value;
  if (!single) {
    throw validationError(`Missing "${name}" in the URL.`, { [name]: 'Required.' });
  }
  return single;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Reads a dynamic segment and validates it is a UUID.
 *
 * Returning 422 for a non-UUID keeps a scan for `/api/attendance/1` from reaching
 * the database, and avoids Prisma raising an opaque type error.
 */
export async function uuidRouteParam(context: RouteContext, name: string): Promise<string> {
  const value = await routeParam(context, name);
  if (!UUID_PATTERN.test(value)) {
    throw validationError(`"${name}" is not a valid identifier.`, {
      [name]: 'Invalid identifier.',
    });
  }
  return value;
}

// ---------------------------------------------------------------------------
// Client context — recorded on audit rows (02_SRS §6)
// ---------------------------------------------------------------------------

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  clientPlatform: 'ios' | 'android' | 'web' | undefined;
  clientVersion: string | undefined;
}

/**
 * Reads the client IP from proxy headers.
 *
 * Only the first `x-forwarded-for` entry is trusted, which is what a correctly
 * configured reverse proxy sets. This value feeds rate limiting and audit rows, so
 * a spoofed header can at worst throttle the spoofer.
 */
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? null;
}

export function getRequestContext(request: NextRequest): RequestContext {
  const parsed = clientContextSchema.safeParse({
    clientPlatform: request.headers.get('x-client-platform') ?? undefined,
    clientVersion: request.headers.get('x-client-version') ?? undefined,
  });

  return {
    requestId: request.headers.get('x-request-id') ?? randomUUID(),
    ipAddress: getClientIp(request),
    clientPlatform: parsed.success ? parsed.data.clientPlatform : undefined,
    clientVersion: parsed.success ? parsed.data.clientVersion : undefined,
  };
}

// ---------------------------------------------------------------------------
// Handler wrapper
// ---------------------------------------------------------------------------

type Handler = (request: NextRequest, context: RouteContext) => Promise<NextResponse>;

/**
 * Wraps a route handler so that:
 *   - thrown ApiErrors become the documented error envelope,
 *   - Zod errors become 422s with field messages,
 *   - anything else becomes a 500 whose detail is logged, never returned,
 *   - every response carries the request id for correlation.
 *
 * 5xx responses log at error level; 4xx at debug, since client mistakes are
 * routine and would otherwise drown the logs.
 */
export function withErrorHandling(handler: Handler): Handler {
  return async (request, context) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const route = `${request.method} ${request.nextUrl.pathname}`;

    try {
      const response = await handler(request, context);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (caught) {
      const apiError = toApiError(caught);

      if (apiError.status >= 500) {
        logger.error(
          { requestId, route, code: apiError.code, detail: apiError.detail },
          apiError.message,
        );
      } else {
        logger.debug({ requestId, route, code: apiError.code }, apiError.message);
      }

      const response = errorResponse(apiError);
      response.headers.set('x-request-id', requestId);
      return response;
    }
  };
}
