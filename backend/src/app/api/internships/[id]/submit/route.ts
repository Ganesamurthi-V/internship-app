/**
 * POST /api/internships/:id/submit — student submits the registration for approval.
 *
 * The service re-checks that the offer letter and joining proof are present
 * (01_PRD §4.1). That gate is enforced here and not only in the wizard, because the
 * client-side step-3 validation is skippable.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, requireStudentId } from '@/lib/auth/guards';
import { serializeInternship } from '@/lib/serialize';
import { submitInternship } from '@/server/internships/internshipService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireStudentId(auth);

  const internshipId = await uuidRouteParam(context, 'id');
  await assertInternshipAccess(auth, internshipId, 'internship', 'write');

  const internship = await submitInternship(auth, internshipId);
  return ok(serializeInternship(internship));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
