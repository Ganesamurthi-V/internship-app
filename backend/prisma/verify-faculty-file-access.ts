/**
 * Verifies, against the DEPLOYED backend, that a faculty member can see and open a
 * file a student in their department submitted as a `file_upload` answer.
 *
 * Checks the whole chain rather than any single layer:
 *   login -> submission list -> answer carries its document -> signed download URL
 *
 *   npx tsx prisma/verify-faculty-file-access.ts <facultyEmail> <password>
 */

const API = 'https://internship-app-backend.vercel.app/api';

const email = process.argv[2];
const password = process.argv[3];

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  if (!email || !password) {
    console.log('Usage: verify-faculty-file-access.ts <facultyEmail> <password>');
    process.exit(1);
  }

  // Faculty sign in goes through Supabase directly from the app, so mirror that by
  // using the anon endpoint the mobile client uses.
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.log('SUPABASE_URL / SUPABASE_ANON_KEY missing — run with --env-file=.env');
    process.exit(1);
  }

  console.log(`1. Faculty sign in (${email})`);
  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  const authBody = await authRes.json().catch(() => null);
  const token = (authBody as any)?.access_token;
  check('signed in', Boolean(token), authRes.ok ? '' : JSON.stringify(authBody));
  if (!token) return;

  const authed = { Authorization: `Bearer ${token}` };

  console.log('\n2. Confirm role is a reviewer');
  const meRes = await fetch(`${API}/auth/me`, { headers: authed });
  const meBody = await meRes.json().catch(() => null);
  const role = (meBody as any)?.data?.role;
  check('role is faculty or admin', role === 'faculty' || role === 'admin', `role=${role}`);

  console.log('\n3. Fetch submissions in scope');
  const listRes = await fetch(`${API}/submissions?page=1`, { headers: authed });
  const listBody = await listRes.json().catch(() => null);
  const submissions = (listBody as any)?.data ?? [];
  check('submission list returned', listRes.ok, `count=${submissions.length}`);

  // Find any answer that is a file upload.
  let fileAnswer: any = null;
  let owningSubmission: any = null;
  for (const s of submissions) {
    const hit = (s.answers ?? []).find((a: any) => a.questionType === 'file_upload');
    if (hit) { fileAnswer = hit; owningSubmission = s; break; }
  }

  if (!fileAnswer) {
    console.log('\n  No file_upload answers visible to this faculty — nothing to verify.');
    console.log('  (Have a student in this department answer a file question first.)');
    return;
  }

  console.log(`\n4. File answer found on ${owningSubmission.student?.registerNumber ?? '?'} / ${owningSubmission.submissionDate}`);
  check('answer reports questionType=file_upload', fileAnswer.questionType === 'file_upload');
  check('answer carries resolved document', Boolean(fileAnswer.document),
    fileAnswer.document ? fileAnswer.document.originalFilename : 'document is null');

  if (!fileAnswer.document) return;

  check('document is linked to this submission',
    fileAnswer.document.submissionId === owningSubmission.id,
    `submissionId=${fileAnswer.document.submissionId}`);

  console.log('\n5. Open the file as faculty');
  const docRes = await fetch(`${API}/documents/${fileAnswer.document.id}`, { headers: authed });
  const docBody = await docRes.json().catch(() => null);
  check('signed download URL issued', docRes.ok && Boolean((docBody as any)?.data?.downloadUrl),
    docRes.ok ? '' : JSON.stringify(docBody));

  const url = (docBody as any)?.data?.downloadUrl;
  if (url) {
    const head = await fetch(url, { method: 'GET' });
    check('file is actually fetchable', head.ok, `status=${head.status} type=${head.headers.get('content-type')}`);
  }
}

main()
  .then(() => {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
    if (failures > 0) process.exit(1);
  })
  .catch((e) => { console.error(e); process.exit(1); });
