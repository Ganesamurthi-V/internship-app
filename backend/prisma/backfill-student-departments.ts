/**
 * One-off backfill: link students to a Department row.
 *
 * Early registrations stored the department only as the `programme` display name
 * and left `departmentId` null. A null department makes the student invisible to
 * their faculty reviewer, because the pending-approval list is scoped by
 * `departmentId`. This matches `programme` back to a Department and fills the FK.
 *
 * Safe to re-run: it only touches rows where `departmentId` is still null.
 *
 *   pnpm --filter @ims/backend exec tsx prisma/backfill-student-departments.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Loose match so "computer science and engineering " lines up with the real row. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

async function main(): Promise<void> {
  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
  });

  if (departments.length === 0) {
    console.error('No departments exist. Run the seed first.');
    process.exit(1);
  }

  const byName = new Map(departments.map((d) => [normalise(d.name), d.id]));

  const orphans = await prisma.student.findMany({
    where: { departmentId: null },
    select: { id: true, name: true, registerNumber: true, programme: true },
  });

  if (orphans.length === 0) {
    console.log('Nothing to backfill — every student already has a department.');
    return;
  }

  console.log(`Found ${orphans.length} student(s) with no department.\n`);

  let fixed = 0;
  const unmatched: typeof orphans = [];

  for (const student of orphans) {
    const departmentId = byName.get(normalise(student.programme));

    if (!departmentId) {
      unmatched.push(student);
      continue;
    }

    await prisma.student.update({
      where: { id: student.id },
      data: { departmentId },
    });

    console.log(`  linked  ${student.registerNumber}  ${student.name}  ->  ${student.programme}`);
    fixed += 1;
  }

  console.log(`\nLinked ${fixed} student(s).`);

  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} student(s) could not be matched automatically:`);
    for (const student of unmatched) {
      console.log(`  ${student.registerNumber}  ${student.name}  programme="${student.programme}"`);
    }
    console.log('\nTheir `programme` does not match any department name. Fix the');
    console.log('department in the admin UI, or correct the name and re-run this script.');
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
