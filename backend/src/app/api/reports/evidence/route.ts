/**
 * GET /api/reports/evidence?internshipId= — 05_API_Spec "Reports".
 *
 * The full seven-section evidence package as JSON (06_App_Flow §8). This is what the
 * faculty student-detail tabs read, and it is the same data the PDF and CSV exports
 * are rendered from — so what is reviewed on screen and what is filed as evidence
 * cannot drift apart.
 */

import type { NextRequest } from 'next/server';
import { reportQuerySchema } from '@ims/shared-validation';
import { ok, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { buildStudentEvidence } from '@/server/reports/evidenceService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, reportQuerySchema);

  // The internship read permission is the gate: a student may pull their own package,
  // a mentor their assigned students', faculty their scope.
  await assertInternshipAccess(auth, query.internshipId, 'internship', 'read');
  await enforceRateLimit('general', auth.userId);

  return ok(await buildStudentEvidence(query.internshipId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
