/**
 * GET /api/documents?internshipId=&type=&studentId= — 05_API_Spec "Documents".
 *
 * Matrix: "RW own | R assigned | RW scoped | RW". When `internshipId` is supplied the
 * list is authorized against that internship; without it, a non-staff caller sees
 * only their own uploads.
 */

import type { NextRequest } from 'next/server';
import { documentListQuerySchema } from '@ims/shared-validation';
import { ok, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { listDocuments } from '@/server/documents/documentService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, documentListQuerySchema);

  const documents = await listDocuments(auth, {
    internshipId: query.internshipId,
    studentId: query.studentId,
    type: query.type,
    verificationStatus: query.verificationStatus,
  });

  return ok(documents);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
