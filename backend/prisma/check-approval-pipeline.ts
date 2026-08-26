/**
 * Diagnostic: does each pending student have a faculty who can approve them?
 *
 * Prints pending students with their department, and the faculty scoped to that
 * department. A pending student with no matching faculty is invisible in the app.
 *
 *   pnpm --filter @ims/backend exec tsx prisma/check-approval-pipeline.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const faculty = await prisma.user.findMany({
    where: { role: { in: ['faculty', 'admin'] } },
    select: { id: true, email: true, name: true, role: true, status: true, departmentId: true,
      department: { select: { name: true } } },
    orderBy: { role: 'asc' },
  });

  console.log('=== Reviewers ===');
  for (const f of faculty) {
    const dept = f.department?.name ?? (f.role === 'admin' ? 'ALL (admin)' : 'NONE — cannot approve anyone');
    console.log(`  [${f.role}] ${f.email}  status=${f.status}  dept=${dept}`);
  }

  const pending = await prisma.student.findMany({
    where: { user: { status: 'pending' } },
    select: {
      registerNumber: true, name: true, programme: true, departmentId: true,
      department: { select: { name: true } },
      user: { select: { status: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n=== Pending students (${pending.length}) ===`);

  if (pending.length === 0) {
    console.log('  none');
  }

  for (const s of pending) {
    console.log(`\n  ${s.registerNumber}  ${s.name}`);
    console.log(`    status      : ${s.user.status}`);
    console.log(`    programme   : ${s.programme}`);
    console.log(`    departmentId: ${s.departmentId ?? 'NULL  <-- invisible to faculty'}`);
    console.log(`    department  : ${s.department?.name ?? '(none)'}`);

    const reviewers = faculty.filter(
      (f) => f.role === 'admin' || (f.departmentId && f.departmentId === s.departmentId),
    );

    if (reviewers.length === 0) {
      console.log('    reviewers   : NONE — nobody can approve this student');
    } else {
      console.log(`    reviewers   : ${reviewers.map((r) => `${r.email} (${r.role})`).join(', ')}`);
    }
  }

  const counts = await prisma.user.groupBy({
    by: ['status'],
    where: { role: 'student' },
    _count: { status: true },
  });

  console.log('\n=== Student account statuses ===');
  for (const c of counts) {
    console.log(`  ${c.status}: ${c._count.status}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
