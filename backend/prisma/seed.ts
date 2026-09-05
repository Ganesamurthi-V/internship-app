/**
 * Database seed — Supabase Auth accounts plus the application records.
 *
 * Idempotent: every write is an upsert keyed on a natural unique column, so running
 * it twice is safe and running it after a schema change tops up what is missing
 * rather than duplicating.
 *
 * Demo accounts all share one password, which is fine for a development database and
 * is why the whole demo block is skipped when NODE_ENV is production.
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { addDays } from '@ims/shared-validation';

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INSTITUTION = process.env.INSTITUTION_NAME ?? 'Sri Manakula Vinayagar Engineering College';
const DEV_PASSWORD = 'Internship1';
const isProduction = process.env.NODE_ENV === 'production';

/** `YYYY-MM-DD` → the UTC-midnight Date a Prisma `@db.Date` column expects. */
function dateColumn(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/** Today in `YYYY-MM-DD`, in the institution's timezone. */
function todayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.INSTITUTION_TIMEZONE ?? 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Creates a Supabase Auth user, or returns the existing id.
 *
 * `listUsers` is paginated and defaults to a small page, so a project with many
 * users could miss an existing account and fall through to `createUser`. The
 * "already registered" branch below is what makes that safe rather than fatal.
 */
async function ensureAuthUser(
  email: string,
  password: string,
  appMetadata?: Record<string, unknown>,
): Promise<string> {
  const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = existingUsers?.users?.find((user) => user.email === email);
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // `app_metadata`, not `user_metadata`: only the service role can write it, so it is the
    // one role claim the mobile client may trust when `/auth/me` is unreachable.
    // `user_metadata` is rewritable by the account holder with nothing but the anon key.
    //
    // Note the early return above — an account that already exists keeps whatever metadata
    // it was created with, so accounts seeded before this change need a one-off backfill.
    app_metadata: appMetadata ?? {},
  });

  if (error) {
    if (error.message?.includes('already been registered')) {
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const found = listData?.users?.find((user) => user.email === email);
      if (found) return found.id;
    }
    throw new Error(`Failed to create auth user ${email}: ${error.message}`);
  }

  return data.user.id;
}

async function main(): Promise<void> {
  console.log(`Seeding database (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);

  // -------------------------------------------------------------------------
  // Departments
  // -------------------------------------------------------------------------
  const departmentNames = [
    'Electrical and Electronics Engineering',
    'Electronics and Communication Engineering',
    'Computer Science and Engineering',
    'Information Technology',
    'Instrumentation and Control Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Biomedical Engineering',
    'Mechatronics',
    'Computer Science and Business Systems',
    'Computer and Communication Engineering',
    'Artificial Intelligence and Data Science',
    'Fashion Technology',
  ];

  const departments: { id: string; name: string }[] = [];
  for (const name of departmentNames) {
    const dept = await prisma.department.upsert({
      where: { name_institution: { name, institution: INSTITUTION } },
      create: { name, institution: INSTITUTION },
      update: {},
      select: { id: true, name: true },
    });
    departments.push(dept);
  }

  const cse = departments.find((d) => d.name === 'Computer Science and Engineering')!;
  console.log(`  Departments: ${departments.length}`);

  // -------------------------------------------------------------------------
  // Administrator — no department, so institution-wide scope
  // -------------------------------------------------------------------------
  const adminEmail = 'admin@smvec.ac.in';
  const adminAuthId = await ensureAuthUser(adminEmail, DEV_PASSWORD, { role: 'admin' });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      authId: adminAuthId,
      email: adminEmail,
      role: 'admin',
      status: 'active',
      name: 'Department Administrator',
    },
    update: { authId: adminAuthId, role: 'admin', status: 'active' },
    select: { id: true, email: true },
  });

  console.log(`  Admin: ${admin.email}`);

  // -------------------------------------------------------------------------
  // Questions — the daily form
  //
  // Seeded even in production: without at least one active question the app has
  // nothing for a student to answer, so an empty question table is a broken
  // install rather than a clean one.
  // -------------------------------------------------------------------------
  const questionSeeds = [
    {
      prompt: 'What did you work on today?',
      helpText: 'Describe the tasks you actually did, not what you were assigned.',
      type: 'long_text' as const,
      sortOrder: 10,
      required: true,
      minLength: 40,
      maxLength: 1000,
    },
    {
      prompt: 'What did you learn?',
      helpText: 'A tool, a technique, or something about how the team works.',
      type: 'long_text' as const,
      sortOrder: 20,
      required: true,
      minLength: 20,
      maxLength: 800,
    },
    {
      prompt: 'Did anything block you?',
      helpText: 'Leave blank if nothing did.',
      type: 'long_text' as const,
      sortOrder: 30,
      required: false,
      minLength: null,
      maxLength: 500,
    },
    {
      prompt: 'How many hours did you work today?',
      type: 'number' as const,
      sortOrder: 40,
      required: true,
      minLength: null,
      maxLength: null,
    },
    {
      prompt: 'Did you work from the office or remotely?',
      type: 'choice' as const,
      sortOrder: 50,
      required: true,
      options: ['Office', 'Remote', 'Hybrid'],
      minLength: null,
      maxLength: null,
    },
  ];

  const questions: { id: string; prompt: string }[] = [];

  for (const seed of questionSeeds) {
    // No natural unique key on questions, so match on the prompt to stay idempotent.
    const existing = await prisma.question.findFirst({
      where: { prompt: seed.prompt, departmentId: null },
      select: { id: true },
    });

    if (existing) {
      questions.push({ id: existing.id, prompt: seed.prompt });
      continue;
    }

    const createdQuestion = await prisma.question.create({
      data: {
        prompt: seed.prompt,
        helpText: 'helpText' in seed ? (seed.helpText ?? null) : null,
        type: seed.type,
        sortOrder: seed.sortOrder,
        required: seed.required,
        options: 'options' in seed && seed.options ? seed.options : undefined,
        minLength: seed.minLength,
        maxLength: seed.maxLength,
        departmentId: null,
        createdById: admin.id,
      },
      select: { id: true, prompt: true },
    });

    questions.push(createdQuestion);
  }

  console.log(`  Questions: ${questions.length}`);

  if (isProduction) {
    console.log('Production environment: skipping demo faculty, students and submissions.');
    return;
  }

  // -------------------------------------------------------------------------
  // Faculty — scoped to CSE
  // -------------------------------------------------------------------------
  const facultyEmail = 'faculty@smvec.ac.in';
  const facultyAuthId = await ensureAuthUser(facultyEmail, DEV_PASSWORD, { role: 'faculty' });

  const faculty = await prisma.user.upsert({
    where: { email: facultyEmail },
    create: {
      authId: facultyAuthId,
      email: facultyEmail,
      role: 'faculty',
      status: 'active',
      name: 'Dr. Anitha Raman',
      departmentId: cse.id,
    },
    update: {
      authId: facultyAuthId,
      role: 'faculty',
      status: 'active',
      departmentId: cse.id,
    },
    select: { id: true, email: true },
  });

  console.log(`  Faculty: ${faculty.email}`);

  // -------------------------------------------------------------------------
  // Students
  // -------------------------------------------------------------------------
  const studentSeeds = [
    {
      email: 'praveen@smvec.ac.in',
      registerNumber: '21CS101',
      name: 'Praveen Kumar',
      programme: 'B.Tech Computer Science and Engineering',
      year: 4,
      section: 'A',
      mobile: '9876543210',
    },
    {
      email: 'divya@smvec.ac.in',
      registerNumber: '21CS102',
      name: 'Divya Lakshmi',
      programme: 'B.Tech Computer Science and Engineering',
      year: 4,
      section: 'A',
      mobile: '9876543211',
    },
    {
      email: 'arjun@smvec.ac.in',
      registerNumber: '21CS103',
      name: 'Arjun Menon',
      programme: 'B.Tech Computer Science and Engineering',
      year: 4,
      section: 'B',
      mobile: '9876543212',
    },
  ];

  const students: { id: string; name: string; registerNumber: string }[] = [];

  for (const seed of studentSeeds) {
    const authId = await ensureAuthUser(seed.email, DEV_PASSWORD, { role: 'student' });

    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        authId,
        email: seed.email,
        role: 'student',
        status: 'active',
        name: seed.name,
      },
      update: { authId, role: 'student', status: 'active' },
      select: { id: true },
    });

    const student = await prisma.student.upsert({
      where: { registerNumber: seed.registerNumber },
      create: {
        userId: user.id,
        registerNumber: seed.registerNumber,
        name: seed.name,
        programme: seed.programme,
        departmentId: cse.id,
        year: seed.year,
        section: seed.section,
        studentEmail: seed.email,
        mobile: seed.mobile,
      },
      update: {
        userId: user.id,
        name: seed.name,
        departmentId: cse.id,
        year: seed.year,
        section: seed.section,
      },
      select: { id: true, name: true, registerNumber: true },
    });

    students.push(student);
  }

  console.log(`  Students: ${students.length}`);

  // -------------------------------------------------------------------------
  // Submissions — a spread of statuses so both dashboards have something to show
  // -------------------------------------------------------------------------
  const today = todayString();
  const firstStudent = students[0]!;
  const secondStudent = students[1]!;

  const answerFor = (prompt: string): string => {
    if (prompt.startsWith('What did you work on')) {
      return 'Worked through the review queue screen, wired the approve and decline actions to the API, and fixed the empty state that showed while loading.';
    }
    if (prompt.startsWith('What did you learn')) {
      return 'Learned how the team splits server validation from client validation so the same rules run in both places.';
    }
    if (prompt.startsWith('Did anything block')) {
      return 'Waited about an hour on a staging database credential.';
    }
    if (prompt.startsWith('How many hours')) {
      return '8';
    }
    return 'Office';
  };

  /**
   * Fourteen days back, weekdays only, with the oldest days already reviewed and the
   * most recent left pending — which is what the review queue looks like in use.
   */
  let created = 0;

  for (let offset = 14; offset >= 1; offset -= 1) {
    const date = addDays(today, -offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    // The first student is diligent; the second misses the occasional day.
    const cohort = offset % 3 === 0 ? [firstStudent] : [firstStudent, secondStudent];

    for (const student of cohort) {
      const status = offset > 4 ? 'approved' : offset > 2 ? 'declined' : 'pending';
      const reviewed = status !== 'pending';

      const submission = await prisma.dailySubmission.upsert({
        where: {
          studentId_submissionDate: {
            studentId: student.id,
            submissionDate: dateColumn(date),
          },
        },
        create: {
          studentId: student.id,
          submissionDate: dateColumn(date),
          status,
          ...(reviewed
            ? {
                reviewedById: faculty.id,
                reviewedAt: new Date(),
                reviewNote:
                  status === 'declined'
                    ? 'Please add more detail about what you actually built.'
                    : null,
              }
            : {}),
        },
        update: {},
        select: { id: true },
      });

      // Answers are written once; a re-run leaves existing ones alone.
      const existingAnswers = await prisma.answer.count({
        where: { submissionId: submission.id },
      });

      if (existingAnswers === 0) {
        await prisma.answer.createMany({
          data: questions
            // The optional "blocked" question is left unanswered on most days,
            // which is the realistic shape.
            .filter((question) => !question.prompt.startsWith('Did anything block') || offset % 4 === 0)
            .map((question) => ({
              submissionId: submission.id,
              questionId: question.id,
              promptSnapshot: question.prompt,
              answerText: answerFor(question.prompt),
            })),
        });
        created += 1;
      }
    }
  }

  console.log(`  Submissions with answers: ${created}`);

  console.log('\nDemo accounts (password: %s)', DEV_PASSWORD);
  console.log('  admin    admin@smvec.ac.in');
  console.log('  faculty  faculty@smvec.ac.in');
  for (const seed of studentSeeds) {
    console.log(`  student  ${seed.email}  (${seed.registerNumber})`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\nSeed complete.');
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
