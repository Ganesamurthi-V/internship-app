/**
 * POST /api/internships/:id/approve — faculty only (05_API_Spec).
 *
 * Uses the `approve` access level, which the matrix grants to scoped faculty and
 * admin only — a mentor cannot approve an internship (09_Test_Plan §3).
 *
 * Approval sends the student a push notification, which is milestone 4 of the
 * first development milestone in 10_Project_Setup_README.
 */

import type { NextRequest } from 'next/server';
import { approveInternshipSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, requireRole } from '@/lib/auth/guards';
import { serializeInternship } from '@/lib/serialize';
import { approveInternship } from '@/server/internships/internshipService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const internshipId = await uuidRouteParam(context, 'id');
  await assertInternshipAccess(auth, internshipId, 'internship', 'approve');

  const input = await parseJson(request, approveInternshipSchema);
  const internship = await approveInternship(auth, internshipId, input.note ?? null);

  return ok(serializeInternship(internship));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
