/**
 * Database seed — creates users via Supabase Auth + application records via Prisma.
 *
 * Idempotent: checks if users exist before creating. Demo data only outside production.
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { SKILL_TYPES, type AttendanceStatus } from '@ims/shared-types';
import { addDays, calculateTotalHours, daysBetween } from '@ims/shared-validation';

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INSTITUTION = process.env.INSTITUTION_NAME ?? 'Sri Manakula Vinayagar Engineering College';
const DEV_PASSWORD = 'Internship1';
const isProduction = process.env.NODE_ENV === 'production';

function dateColumn(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Creates a Supabase Auth user and returns the auth id.
 * If the user already exists (by email), returns the existing id.
 */
async function ensureAuthUser(email: string, password: string, metadata?: Record<string, unknown>): Promise<string> {
  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata ?? {},
  });

  if (error) {
    // If user already exists error, try to find them
    if (error.message?.includes('already been registered')) {
      const { data: listData } = await supabase.auth.admin.listUsers();
      const found = listData?.users?.find((u) => u.email === email);
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
  // App settings
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
  const facultyAuthId = await ensureAuthUser('faculty@smvec.ac.in', DEV_PASSWORD, { role: 'faculty' });

  const faculty = await prisma.user.upsert({
    where: { email: 'faculty@smvec.ac.in' },
    create: {
      authId: facultyAuthId,
      email: 'faculty@smvec.ac.in',
      role: 'faculty',
      status: 'active',
      name: 'Dr. Anitha Rajendran',
      departmentId: cse.id,
    },
    update: { authId: facultyAuthId, departmentId: cse.id },
    select: { id: true, email: true },
  });

  // -------------------------------------------------------------------------
  // Organisation and mentor
  // -------------------------------------------------------------------------
  const organisation = await prisma.organisation.upsert({
    where: { name: 'Iinvsys Technologies' },
    create: { name: 'Iinvsys Technologies', location: 'Puducherry' },
    update: {},
    select: { id: true },
  });

  const mentorAuthId = await ensureAuthUser('raj@iinvsys.example', DEV_PASSWORD, { role: 'mentor' });

  const mentorUser = await prisma.user.upsert({
    where: { email: 'raj@iinvsys.example' },
    create: {
      authId: mentorAuthId,
      email: 'raj@iinvsys.example',
      role: 'mentor',
      status: 'active',
      name: 'Raj Kumar',
    },
    update: { authId: mentorAuthId },
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
  ];

  const students = [];
  for (const [index, seed] of studentSeeds.entries()) {
    const authId = await ensureAuthUser(seed.email, DEV_PASSWORD, { role: 'student', name: seed.name });

    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        authId,
        email: seed.email,
        role: 'student',
        status: 'active',
        name: seed.name,
      },
      update: { authId },
      select: { id: true },
    });

    const student = await prisma.student.upsert({
      where: { registerNumber: seed.registerNumber },
      create: {
        userId: user.id,
        registerNumber: seed.registerNumber,
        name: seed.name,
        programme: 'B.E. Computer Science',
        departmentId: cse.id,
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
  // Demo internship with attendance
  // -------------------------------------------------------------------------
  const firstStudent = students[0]!;
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

  const existingAttendance = await prisma.attendance.count({
    where: { internshipId: internship.id },
  });

  if (existingAttendance === 0) {
    let attendanceCreated = 0;
    for (let offset = 0; offset <= daysBetween(startDate, endDate); offset += 1) {
      const date = addDays(startDate, offset);
      const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

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
    }
    console.log(`  Attendance records: ${attendanceCreated}`);
  }

  console.log('');
  console.log('Demo accounts (password for all: ' + DEV_PASSWORD + ')');
  console.log(`  admin    ${admin.email}`);
  console.log(`  faculty  ${faculty.email}`);
  console.log('  mentor   raj@iinvsys.example');
  for (const student of students) {
    console.log(`  student  ${student.registerNumber}  ${student.name}`);
  }
  console.log('');
  console.log('Change these before exposing the API publicly.');
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
