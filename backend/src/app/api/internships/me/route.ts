/**
 * GET /api/internships/me — the student's own internship, enriched.
 *
 * Returns `InternshipDetail`: the record plus the derived values the dashboard and
 * the internship view screen need, so the app makes one call instead of four.
 *
 *   - `duration`   — inclusive calendar days and working days (02_SRS §2.1)
 *   - `attendanceSummary` — computed, never stored (04_Database_Design §5)
 *   - `documents`  — the registration checklist state
 *
 * Returns `data: null` rather than 404 when the student has not registered yet:
 * "no internship" is the normal first-run state, and the dashboard renders a
 * "Register Internship" call to action for it (06_App_Flow §3).
 */

import type { NextRequest } from 'next/server';
import type { InternshipDetail } from '@ims/shared-types';
import { calculateInternshipDuration } from '@ims/shared-validation';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireStudentId } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { serializeInternship, toDateOnly } from '@/lib/serialize';
import { getAttendanceSummary } from '@/server/attendance/summaryService';
import { getRegistrationChecklist } from '@/server/documents/checklistService';
import { INTERNSHIP_SELECT } from '@/server/internships/internshipService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);

  const internship = await prisma.internship.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: INTERNSHIP_SELECT,
  });

  if (!internship) {
    return ok(null);
  }

  const startDate = toDateOnly(internship.startDate);
  const endDate = toDateOnly(internship.endDate);

  // Attendance and the checklist only mean something once the record is approved;
  // skip the queries for a pending registration.
  const isLive = internship.status === 'approved' || internship.status === 'active' ||
    internship.status === 'completed';

  const [attendanceSummary, documents] = await Promise.all([
    isLive ? getAttendanceSummary(internship.id) : Promise.resolve(null),
    getRegistrationChecklist(internship.id),
  ]);

  const detail: InternshipDetail = {
    internship: serializeInternship(internship),
    duration: calculateInternshipDuration(startDate, endDate),
    attendanceSummary,
    documents,
  };

  return ok(detail);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
