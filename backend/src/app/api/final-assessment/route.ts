/**
 * POST /api/final-assessment — save the draft (student)
 * GET  /api/final-assessment?internshipId= — the form's read model
 *
 * 05_API_Spec matrix: "RW own | — | R/Unlock | RW". The mentor has no access to the
 * final assessment at all, which `ACCESS_MATRIX` enforces by omitting
 * `assigned_mentor` from every level on this resource.
 *
 * The GET returns access state and auto-filled totals along with the record, so the
 * three-part form can render a locked or unlocked view in one round trip.
 */

import type { NextRequest } from 'next/server';
import {
  finalAssessmentQuerySchema,
  upsertFinalAssessmentSchema,
} from '@ims/shared-validation';
import { ok, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { serializeFinalAssessment } from '@/lib/serialize';
import {
  getFinalAssessmentDetail,
  upsertFinalAssessment,
} from '@/server/finalAssessment/finalAssessmentService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, upsertFinalAssessmentSchema);
  await assertInternshipAccess(auth, input.internshipId, 'final_assessment', 'write');

  const assessment = await upsertFinalAssessment(auth, input);
  return ok(serializeFinalAssessment(assessment));
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, finalAssessmentQuerySchema);

  await assertInternshipAccess(auth, query.internshipId, 'final_assessment', 'read');

  return ok(await getFinalAssessmentDetail(query.internshipId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
