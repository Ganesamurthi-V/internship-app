/**
 * Database seed — 10_Project_Setup_README §3 ("creates admin user, departments").
 *
 * Idempotent: every write is an upsert keyed on a natural unique column, so running
 * `pnpm prisma db seed` repeatedly converges rather than erroring or duplicating.
 *
 * Demo data (students, an internship, attendance, work logs) is created only outside
 * production. An accidental `db seed` against a live database must not inject fake
 * students into institutional evidence, so that path is gated on NODE_ENV.
 *
 * Passwords come from the environment where supplied, and fall back to a documented
 * development default otherwise. The seed prints what it created, including whether
 * the fallback was used, so nobody deploys unaware of a known password.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  BCRYPT_COST_FACTOR,
  SKILL_TYPES,
  type AttendanceStatus,
} from '@ims/shared-types';
import { addDays, calculateTotalHours, daysBetween } from '@ims/shared-validation';

const prisma = new PrismaClient();

const INSTITUTION = process.env.INSTITUTION_NAME ?? 'Sri Manakula Vinayagar Engineering College';

/** Meets the policy in 07_Security_and_Privacy §5: 8+ chars, 1 uppercase, 1 number. */
const DEV_PASSWORD = 'Internship1';

const isProduction = process.env.NODE_ENV === 'production';

function hash(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);
}

/** UTC-midnight Date for a `YYYY-MM-DD` string, matching how the app writes DATE columns. */
function dateColumn(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

async function main(): Promise<void> {
  console.log(`Seeding database (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);

  // -------------------------------------------------------------------------
  // Departments
  // -------------------------------------------------------------------------
  const departmentNames = [
    'Computer Science and Engineering',
    'Information Technology',
    'Electronics and Communication Engineering',
    'Mechanical Engineering',
    'Master of Business Administration',
  ];

  const departments = await Promise.all(
    departmentNames.map((name) =>
      prisma.department.upsert({
        where: { name_institution: { name, institution: INSTITUTION } },
        create: { name, institution: INSTITUTION },
        update: {},
        select: { id: true, name: true },
      }),
    ),
  );

  const cse = departments[0]!;
  console.log(`  Departments: ${departments.length}`);

  // -------------------------------------------------------------------------
  // Administrator
  // -------------------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@smvec.ac.in';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? DEV_PASSWORD;

  if (isProduction && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      'Refusing to seed a production database with the default admin password. ' +
        'Set SEED_ADMIN_PASSWORD.',
    );
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      role: 'admin',
      status: 'active',
      name: 'Department Administrator',
    },
    // An existing admin's password is left alone: re-seeding must not reset it.
    update: { role: 'admin', status: 'active' },
    select: { id: true, email: true },
  });

  console.log(`  Admin: ${admin.email}`);

  // -------------------------------------------------------------------------
  // Notification settings (02_SRS §4 — admin-configurable)
  // -------------------------------------------------------------------------
  await prisma.appSetting.upsert({
    where: { key: 'notifications' },
    create: {
      key: 'notifications',
      value: {
        missingDailySubmissionAt: '21:00',
        weeklyReportReminderDay: 0,
        weeklyReportReminderAt: '18:00',
        finalAssessmentLeadDays: 3,
        enabled: true,
      },
      updatedById: admin.id,
    },
    update: {},
  });

  if (isProduction) {
    console.log('  Production environment: skipping demo data.');
    return;
  }

  // -------------------------------------------------------------------------
  // Demo faculty coordinator
  // -------------------------------------------------------------------------
  const faculty = await prisma.user.upsert({
    where: { email: 'faculty@smvec.ac.in' },
    create: {
      email: 'faculty@smvec.ac.in',
      passwordHash: await hash(DEV_PASSWORD),
      role: 'faculty',
      status: 'active',
      name: 'Dr. Anitha Rajendran',
      // Scopes this coordinator to CSE, which is what makes the department
      // authorization rules exercisable in development.
      departmentId: cse.id,
    },
    update: { departmentId: cse.id },
    select: { id: true, email: true },
  });

  // A second faculty member in another department, so the scoping tests in
  // 09_Test_Plan §3 have a negative case to assert against.
  const otherFaculty = await prisma.user.upsert({
    where: { email: 'faculty.mech@smvec.ac.in' },
    create: {
      email: 'faculty.mech@smvec.ac.in',
      passwordHash: await hash(DEV_PASSWORD),
      role: 'faculty',
      status: 'active',
      name: 'Dr. Suresh Kumar',
      departmentId: departments[3]!.id,
    },
    update: {},
    select: { id: true, email: true },
  });

  // -------------------------------------------------------------------------
  // Organisation and mentor
  // -------------------------------------------------------------------------
  const organisation = await prisma.organisation.upsert({
    where: { name: 'Iinvsys Technologies' },
    create: { name: 'Iinvsys Technologies', location: 'Puducherry' },
    update: {},
    select: { id: true, name: true },
  });

  const mentorUser = await prisma.user.upsert({
    where: { email: 'raj@iinvsys.example' },
    create: {
      email: 'raj@iinvsys.example',
      passwordHash: await hash(DEV_PASSWORD),
      role: 'mentor',
      status: 'active',
      name: 'Raj Kumar',
    },
    update: {},
    select: { id: true },
  });

  const existingMentor = await prisma.mentor.findFirst({
    where: { email: 'raj@iinvsys.example' },
    select: { id: true },
  });

  const mentor = existingMentor
    ? await prisma.mentor.update({
        where: { id: existingMentor.id },
        data: { userId: mentorUser.id, organisationId: organisation.id },
        select: { id: true },
      })
    : await prisma.mentor.create({
        data: {
          name: 'Raj Kumar',
          designation: 'Senior Engineer',
          email: 'raj@iinvsys.example',
          contact: '9876543210',
          organisationId: organisation.id,
          userId: mentorUser.id,
        },
        select: { id: true },
      });

  // -------------------------------------------------------------------------
  // Demo students
  // -------------------------------------------------------------------------
  const studentSeeds = [
    { registerNumber: '21CS101', name: 'Praveen Kumar', email: 'praveen@smvec.ac.in' },
    { registerNumber: '21CS102', name: 'Divya Lakshmi', email: 'divya@smvec.ac.in' },
    { registerNumber: '21ME201', name: 'Karthik Raja', email: 'karthik@smvec.ac.in' },
  ];

  const students = [];
  for (const [index, seed] of studentSeeds.entries()) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        email: seed.email,
        passwordHash: await hash(DEV_PASSWORD),
        role: 'student',
        status: 'active',
        name: seed.name,
      },
      update: {},
      select: { id: true },
    });

    const student = await prisma.student.upsert({
      where: { registerNumber: seed.registerNumber },
      create: {
        userId: user.id,
        registerNumber: seed.registerNumber,
        name: seed.name,
        programme: index === 2 ? 'B.E. Mechanical Engineering' : 'B.E. Computer Science',
        // The third student sits in Mechanical, outside the demo faculty's scope.
        departmentId: index === 2 ? departments[3]!.id : cse.id,
        year: 3,
        section: 'A',
        studentEmail: seed.email,
        mobile: `98765432${10 + index}`,
      },
      update: {},
      select: { id: true, name: true, registerNumber: true },
    });

    students.push(student);
  }

  console.log(`  Students: ${students.length}`);

  // -------------------------------------------------------------------------
  // Demo internship with attendance and work logs
  // -------------------------------------------------------------------------
  const firstStudent = students[0]!;

  // A window ending yesterday, so the final assessment is unlocked and the dashboard
  // has history to display.
  const endDate = addDays(new Date().toISOString().slice(0, 10), -1);
  const startDate = addDays(endDate, -44);

  const existingInternship = await prisma.internship.findFirst({
    where: { studentId: firstStudent.id },
    select: { id: true },
  });

  const internship = existingInternship
    ? await prisma.internship.update({
        where: { id: existingInternship.id },
        data: { status: 'active' },
        select: { id: true },
      })
    : await prisma.internship.create({
        data: {
          studentId: firstStudent.id,
          organisationId: organisation.id,
          mentorId: mentor.id,
          facultyCoordinatorId: faculty.id,
          domain: 'software_development',
          mode: 'offline',
          startDate: dateColumn(startDate),
          endDate: dateColumn(endDate),
          // Mirrors the generated column the documents specify: end - start.
          durationDays: daysBetween(startDate, endDate),
          workingHoursPerDay: 8,
          status: 'active',
          submittedAt: new Date(),
          approvedById: faculty.id,
          approvedAt: new Date(),
          evidenceUploadsPermitted: true,
        },
        select: { id: true },
      });

  // Skip regenerating daily records if they already exist, so re-seeding is cheap.
  const existingAttendance = await prisma.attendance.count({
    where: { internshipId: internship.id },
  });

  if (existingAttendance === 0) {
    const technologies = [
      ['Python', 'Flask', 'PostgreSQL'],
      ['TypeScript', 'React', 'Git'],
      ['Docker', 'AWS', 'Linux'],
      ['SQL', 'Prisma', 'Node.js'],
    ];

    let attendanceCreated = 0;
    let logsCreated = 0;

    for (let offset = 0; offset <= daysBetween(startDate, endDate); offset += 1) {
      const date = addDays(startDate, offset);
      const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

      // Sundays are weekly offs; one deliberate absence and one leave day give the
      // attendance percentage something meaningful to compute.
      let status: AttendanceStatus = 'present';
      if (dayOfWeek === 0) status = 'weekly_off';
      else if (offset === 10) status = 'absent';
      else if (offset === 25) status = 'permission_leave';

      const isWorkingDay = status === 'present';
      const reportingTime = isWorkingDay ? '09:00' : null;
      const leavingTime = isWorkingDay ? '17:30' : null;

      await prisma.attendance.create({
        data: {
          internshipId: internship.id,
          studentId: firstStudent.id,
          attendanceDate: dateColumn(date),
          status,
          reportingTime,
          leavingTime,
          totalHours: calculateTotalHours(reportingTime, leavingTime),
          mode: isWorkingDay ? 'office' : null,
          leaveReason:
            status === 'absent'
              ? 'Unwell, informed the mentor by phone.'
              : status === 'permission_leave'
                ? 'Permission taken for a university examination.'
                : null,
          mentorVerified: isWorkingDay && offset % 3 === 0,
          mentorVerifiedAt: isWorkingDay && offset % 3 === 0 ? new Date() : null,
        },
      });
      attendanceCreated += 1;

      if (isWorkingDay) {
        const tags = technologies[offset % technologies.length]!;
        await prisma.dailyWorkLog.create({
          data: {
            internshipId: internship.id,
            studentId: firstStudent.id,
            workDate: dateColumn(date),
            activities:
              'Worked on the internship management API. Implemented request validation, ' +
              'reviewed the authentication flow with the mentor, and wrote unit tests for ' +
              'the new endpoints. Spent the afternoon tracing a bug in the attendance ' +
              'aggregation query and documented the fix.',
            technologies: tags,
            taskAssigned: 'Implement and test the assigned API module',
            completionStatus: offset % 7 === 0 ? 'partially' : 'yes',
            learning:
              'Learned how database indexes change the plan for aggregate queries and why ' +
              'computing totals is safer than storing them.',
            challenge: 'The aggregation returned duplicate rows for a joined table.',
            solution: 'Grouped in the database instead of in application code.',
            deliverableType: 'code',
            mentorInteraction: offset % 2 === 0,
            mentorFeedback: offset % 2 === 0 ? 'Good progress. Add more test coverage.' : null,
          },
        });
        logsCreated += 1;
      }
    }

    console.log(`  Attendance records: ${attendanceCreated}`);
    console.log(`  Work logs: ${logsCreated}`);
  }

  // -------------------------------------------------------------------------
  // A draft final assessment with skill ratings, so the form has data to show
  // -------------------------------------------------------------------------
  const assessment = await prisma.finalAssessment.upsert({
    where: { internshipId: internship.id },
    create: {
      internshipId: internship.id,
      studentId: firstStudent.id,
      completedSuccessfully: true,
      majorProject: 'Internship management REST API with offline sync support',
      technologiesMastered: ['TypeScript', 'PostgreSQL', 'Prisma'],
      skillsDeveloped: ['API design', 'Testing', 'Code review'],
      objectivesStatus: 'fully',
      usefulnessRating: 5,
      recommendOrganisation: true,
    },
    update: {},
    select: { id: true },
  });

  const existingRatings = await prisma.skillRating.count({
    where: { finalAssessmentId: assessment.id },
  });

  if (existingRatings === 0) {
    await prisma.skillRating.createMany({
      data: SKILL_TYPES.map((skillType, index) => ({
        finalAssessmentId: assessment.id,
        // Varied but always inside the 1..5 CHECK constraint.
        skillType,
        rating: ((index % 3) + 3) as number,
      })),
    });
  }

  console.log('');
  console.log('Demo accounts (password for all: ' + DEV_PASSWORD + ')');
  console.log(`  admin    ${admin.email}`);
  console.log(`  faculty  ${faculty.email}   (${cse.name})`);
  console.log(`  faculty  ${otherFaculty.email}   (Mechanical \u2014 out of scope for CSE records)`);
  console.log('  mentor   raj@iinvsys.example');
  for (const student of students) {
    console.log(`  student  ${student.registerNumber}  ${student.name}`);
  }
  console.log('');
  console.log('Change these before exposing the API to anyone.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
