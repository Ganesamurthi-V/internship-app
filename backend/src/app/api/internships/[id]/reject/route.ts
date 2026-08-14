/**
 * POST /api/internships/:id/reject — faculty only (05_API_Spec).
 *
 * A reason is mandatory (minimum 10 characters in the schema): the student sees it
 * on the registration screen and needs to know what to correct. The database CHECK
 * constraint `internships_rejection_reason_present` enforces the same rule.
 */

import type { NextRequest } from 'next/server';
import { rejectInternshipSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, requireRole } from '@/lib/auth/guards';
import { serializeInternship } from '@/lib/serialize';
import { rejectInternship } from '@/server/internships/internshipService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const internshipId = await uuidRouteParam(context, 'id');
  await assertInternshipAccess(auth, internshipId, 'internship', 'approve');

  const input = await parseJson(request, rejectInternshipSchema);
  const internship = await rejectInternship(auth, internshipId, input.rejectionReason);

  return ok(serializeInternship(internship));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
