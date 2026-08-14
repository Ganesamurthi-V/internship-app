/**
 * GET /api/students — paginated student directory, faculty and admin only.
 *
 * 05_API_Spec matrix: "— | — | R | RW". Results are always narrowed by
 * `studentScopeFilter`, so a faculty member sees their department and the
 * internships they coordinate, and nothing else.
 */

import type { NextRequest } from 'next/server';
import { studentListQuerySchema } from '@ims/shared-validation';
import { listResponse, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { listStudents } from '@/server/students/listService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, studentListQuerySchema);

  const { items, pagination } = await listStudents(auth, {
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    departmentId: query.departmentId,
    status: query.status,
    missingLogOn: query.missingLogOn,
  });

  return listResponse(items, pagination);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
