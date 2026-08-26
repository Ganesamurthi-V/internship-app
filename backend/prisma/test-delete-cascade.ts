/**
 * Verifies the auth <-> app delete triggers actually fire, in every direction.
 *
 * Creates a throwaway account, deletes it from one side, and asserts the other
 * side disappeared. Repeats for all three entry points. Cleans up after itself.
 *
 *   npx tsx --env-file=.env prisma/test-delete-cascade.ts
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const EMAIL = 'cascade-probe@smvec.ac.in';
const REGNO = 'CASCADEPROBE001';

let failures = 0;

function assert(label: string, condition: boolean): void {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
}

/** Builds auth user + app user + student row, returns the ids. */
async function seedProbe(departmentId: string) {
  // Clear any leftover from a previous aborted run.
  await cleanup();

  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: '9999999999',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  const user = await prisma.user.create({
    data: { authId: data.user.id, email: EMAIL, role: 'student', status: 'pending', name: 'Cascade Probe' },
    select: { id: true },
  });

  const student = await prisma.student.create({
    data: {
      userId: user.id,
      registerNumber: REGNO,
      name: 'Cascade Probe',
      programme: 'Probe',
      departmentId,
      studentEmail: EMAIL,
      mobile: '9999999999',
    },
    select: { id: true },
  });

  return { authId: data.user.id, userId: user.id, studentId: student.id };
}

async function authExists(authId: string): Promise<boolean> {
  const { data } = await supabase.auth.admin.getUserById(authId);
  return Boolean(data?.user);
}

async function cleanup(): Promise<void> {
  await prisma.student.deleteMany({ where: { registerNumber: REGNO } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  // Sweep the auth side in case no app row pointed at it.
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const leftover = data?.users.find((u) => u.email?.toLowerCase() === EMAIL);
  if (leftover) await supabase.auth.admin.deleteUser(leftover.id);
}

async function main(): Promise<void> {
  const department = await prisma.department.findFirst({ select: { id: true } });
  if (!department) throw new Error('No departments exist. Run the seed first.');

  // -- Direction 1: delete the Supabase Auth account -------------------------
  console.log('\n1. Delete auth.users  ->  app user + student should vanish');
  {
    const p = await seedProbe(department.id);
    const { error } = await supabase.auth.admin.deleteUser(p.authId);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);

    assert('public.users row removed', (await prisma.user.findUnique({ where: { id: p.userId } })) === null);
    assert('students row removed', (await prisma.student.findUnique({ where: { id: p.studentId } })) === null);
  }

  // -- Direction 2: delete the app user --------------------------------------
  console.log('\n2. Delete public.users  ->  auth account should vanish (frees the email)');
  {
    const p = await seedProbe(department.id);
    await prisma.user.delete({ where: { id: p.userId } });

    assert('auth.users account removed', (await authExists(p.authId)) === false);
    assert('students row removed', (await prisma.student.findUnique({ where: { id: p.studentId } })) === null);
  }

  // -- Direction 3: delete just the student profile --------------------------
  console.log('\n3. Delete students  ->  app user + auth account should vanish');
  {
    const p = await seedProbe(department.id);
    await prisma.student.delete({ where: { id: p.studentId } });

    assert('public.users row removed', (await prisma.user.findUnique({ where: { id: p.userId } })) === null);
    assert('auth.users account removed', (await authExists(p.authId)) === false);
  }

  // -- The email must be reusable afterwards ---------------------------------
  console.log('\n4. Email is reusable after deletion');
  {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: '9999999999',
      email_confirm: true,
    });
    assert('auth account can be recreated with the same email', !error && Boolean(data?.user));
    if (data?.user) await supabase.auth.admin.deleteUser(data.user.id);
  }

  await cleanup();

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

main()
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
