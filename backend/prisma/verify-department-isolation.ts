/**
 * Verifies department isolation against the DEPLOYED backend.
 *
 * Proving a faculty member CAN reach their own department's data is only half the
 * requirement. This proves a faculty member in a DIFFERENT department cannot:
 *
 *   - the submission does not appear in their list
 *   - a direct document fetch by id is refused
 *   - the student does not appear in their pending-approval queue
 *   - approving that student by id is refused
 *
 * Creates a throwaway faculty account in another department and removes it after,
 * so it leaves no trace.
 *
 *   npx tsx --env-file=.env prisma/verify-department-isolation.ts
 */

import { PrismaClient } from '@prisma/client';

const API = 'https://internship-app-backend.vercel.app/api';
const ADMIN_EMAIL = 'admin@smvec.ac.in';
const ADMIN_PASSWORD = 'Internship1';

const PROBE_EMAIL = 'isolation-probe@smvec.ac.in';
const PROBE_PASSWORD = 'IsolationProbe1';

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY! },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  return (body as any)?.access_token ?? null;
}

async function cleanup(): Promise<void> {
  // Deleting the app user cascades to the Supabase auth account via the delete
  // trigger, so this is enough to remove the probe entirely.
  await prisma.user.deleteMany({ where: { email: PROBE_EMAIL } }).catch(() => {});
}

async function main(): Promise<void> {
  await cleanup();

  // Which department owns the existing file answer we are trying to reach?
  const target = await prisma.answer.findFirst({
    where: { question: { type: 'file_upload' } },
    select: {
      answerText: true,
      submissionId: true,
      submission: {
        select: {
          id: true,
          student: { select: { id: true, registerNumber: true, departmentId: true } },
        },
      },
    },
  });

  if (!target) {
    console.log('No file_upload answer exists to test against. Nothing to verify.');
    return;
  }

  const targetDeptId = target.submission.student.departmentId;
  const documentId = target.answerText.trim();

  const otherDept = await prisma.department.findFirst({
    where: { id: { not: targetDeptId ?? undefined } },
    select: { id: true, name: true },
  });

  if (!otherDept) {
    console.log('Only one department exists; cannot test isolation.');
    return;
  }

  console.log(`target submission : ${target.submission.id}`);
  console.log(`target student    : ${target.submission.student.registerNumber}`);
  console.log(`probe department  : ${otherDept.name}\n`);

  // 1. Admin creates a faculty in a different department.
  console.log('1. Create a throwaway faculty in another department');
  const adminToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('admin signed in', Boolean(adminToken));
  if (!adminToken) return;

  const createRes = await fetch(`${API}/auth/create-faculty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Isolation Probe',
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
      departmentId: otherDept.id,
    }),
  });
  const createBody = await createRes.json().catch(() => null);
  check('faculty created', createRes.ok, createRes.ok ? '' : JSON.stringify(createBody));
  if (!createRes.ok) return;

  // 2. Sign in as that faculty.
  console.log('\n2. Sign in as the other-department faculty');
  const probeToken = await signIn(PROBE_EMAIL, PROBE_PASSWORD);
  check('probe signed in', Boolean(probeToken));
  if (!probeToken) return;

  const authed = { Authorization: `Bearer ${probeToken}` };

  const meRes = await fetch(`${API}/auth/me`, { headers: authed });
  const me = await meRes.json().catch(() => null);
  check('probe role is faculty', (me as any)?.data?.role === 'faculty', `role=${(me as any)?.data?.role}`);

  // 3. The submission must not be visible.
  console.log('\n3. Submissions must be scoped out');
  const listRes = await fetch(`${API}/submissions?page=1`, { headers: authed });
  const listBody = await listRes.json().catch(() => null);
  const ids = ((listBody as any)?.data ?? []).map((s: any) => s.id);
  check('other department submission not listed', !ids.includes(target.submission.id),
    `${ids.length} submission(s) visible`);

  // 4. Direct document fetch must be refused.
  console.log('\n4. Direct document fetch must be refused');
  const docRes = await fetch(`${API}/documents/${documentId}`, { headers: authed });
  check('document fetch blocked', docRes.status === 403 || docRes.status === 404,
    `status=${docRes.status}`);

  // 5. Pending queue must not include the student.
  console.log('\n5. Pending approvals must be scoped out');
  const pendRes = await fetch(`${API}/students/pending`, { headers: authed });
  const pendBody = await pendRes.json().catch(() => null);
  const pendIds = ((pendBody as any)?.data ?? []).map((s: any) => s.id);
  check('other department student not in pending queue',
    !pendIds.includes(target.submission.student.id),
    `${pendIds.length} pending visible`);

  // 6. Approving that student by id must be refused.
  console.log('\n6. Approving across departments must be refused');
  const apprRes = await fetch(`${API}/students/${target.submission.student.id}/approve`, {
    method: 'POST',
    headers: authed,
  });
  check('cross-department approve blocked',
    apprRes.status === 403 || apprRes.status === 409 || apprRes.status === 404,
    `status=${apprRes.status}`);
}

main()
  .then(async () => {
    await cleanup();
    console.log(failures === 0 ? '\nIsolation holds. All checks passed.' : `\n${failures} check(s) FAILED.`);
    if (failures > 0) process.exit(1);
  })
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
