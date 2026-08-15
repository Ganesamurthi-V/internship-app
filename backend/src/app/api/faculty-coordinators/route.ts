/**
 * GET /api/faculty-coordinators — options for step 2 of the registration wizard.
 *
 * Not listed in 05_API_Spec, but 01_PRD §4.1 requires "Faculty coordinator
 * assignment" and 06_App_Flow §3 shows a "select from list" control, which needs a
 * source.
 *
 * Deliberately minimal: id, name, email and role only. A student picking a
 * coordinator has no business seeing staff account status, department assignments
 * or anything else (07_Security_and_Privacy §8, data minimisation).
 */

import type { NextRequest } from 'next/server';
import type { FacultyCoordinatorOption, UserRole } from '@ims/shared-types';
import { cachedOk, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);

  const staff = await prisma.user.findMany({
    where: {
      role: { in: ['faculty', 'admin'] },
      status: 'active',
      // A student sees coordinators in their own department, plus any staff member
      // with no department set (institution-wide coordinators). Faculty and admin
      // callers see the full list.
      ...(auth.role === 'student' && auth.departmentId
        ? { OR: [{ departmentId: auth.departmentId }, { departmentId: null }] }
        : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });

  const options: FacultyCoordinatorOption[] = staff.map((member) => ({
    id: member.id,
    name: member.name ?? member.email.split('@')[0]!,
    email: member.email,
    role: member.role as UserRole,
  }));

  return cachedOk(options, 3600);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
