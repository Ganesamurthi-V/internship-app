/**
 * Faculty student directory — `GET /api/students` (05_API_Spec "Students").
 *
 * Backs the list screen in 12_Mobile_App_Spec §2 and the "Missing Today's Log"
 * drill-down in 06_App_Flow §7, so each row carries the attendance percentage,
 * last submission time, today's submission state and the pending document count.
 *
 * Performance note: every per-row value is fetched in one batched query for the
 * whole page rather than per student. 09_Test_Plan §7 requires the faculty
 * dashboard to load 200 students in under 3 seconds, and the naive version is 5
 * extra queries per row.
 */

import type { Pagination, StudentListItem } from '@ims/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn } from '@/lib/clock';
import { buildPagination } from '@/lib/http';
import { serializeInternship, serializeStudent } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { canSeeContactDetails, studentScopeFilter } from '@/lib/auth/guards';
import { getAttendanceSummaries } from '@/server/attendance/summaryService';

export interface StudentListFilters {
  page: number;
  pageSize: number;
  search?: string | undefined;
  departmentId?: string | undefined;
  status?: string | undefined;
  missingLogOn?: string | undefined;
}

const STUDENT_SELECT = {
  id: true,
  userId: true,
  registerNumber: true,
  name: true,
  programme: true,
  departmentId: true,
  year: true,
  section: true,
  studentEmail: true,
  mobile: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, institution: true, createdAt: true } },
} as const;

export async function listStudents(
  auth: AuthContext,
  filters: StudentListFilters,
): Promise<{ items: StudentListItem[]; pagination: Pagination }> {
  const where = buildWhere(auth, filters);

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      select: {
        ...STUDENT_SELECT,
        internships: {
          // One internship per row: the one the student is actually working in.
          // 'active' < 'approved' < 'completed' < 'pending' < 'rejected' is not
          // alphabetical, so order by recency and let the caller see the newest.
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: INTERNSHIP_SELECT,
        },
      },
      orderBy: [{ name: 'asc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  const internshipIds = students
    .map((student) => student.internships[0]?.id)
    .filter((id): id is string => Boolean(id));

  const currentDate = today();

  const [summaries, submittedToday, lastSubmissions, pendingDocuments] = await Promise.all([
    getAttendanceSummaries(internshipIds),
    findStudentsWithLogOn(internshipIds, currentDate),
    findLastSubmissionTimes(internshipIds),
    countPendingDocuments(internshipIds),
  ]);

  const items: StudentListItem[] = students.map((student) => {
    const internshipRow = student.internships[0] ?? null;
    const internshipId = internshipRow?.id ?? null;
    const summary = internshipId ? summaries.get(internshipId) : undefined;

    return {
      student: serializeStudent(student, {
        includeContactDetails: canSeeContactDetails(auth, student.id),
      }),
      internship: internshipRow ? serializeInternship(internshipRow) : null,
      attendancePercentage: summary?.attendancePercentage ?? null,
      lastSubmissionAt: internshipId ? (lastSubmissions.get(internshipId) ?? null) : null,
      // A student with no internship cannot be missing a log for it.
      missingTodayLog: internshipId ? !submittedToday.has(internshipId) : false,
      pendingDocumentCount: internshipId ? (pendingDocuments.get(internshipId) ?? 0) : 0,
    };
  });

  return { items, pagination: buildPagination(total, filters.page, filters.pageSize) };
}

const INTERNSHIP_SELECT = {
  id: true,
  studentId: true,
  organisationId: true,
  mentorId: true,
  facultyCoordinatorId: true,
  domain: true,
  mode: true,
  startDate: true,
  endDate: true,
  durationDays: true,
  workingHoursPerDay: true,
  status: true,
  approvedById: true,
  approvedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  organisation: {
    select: { id: true, name: true, location: true, createdAt: true, updatedAt: true },
  },
} as const;

/**
 * Composes the scope filter with the caller's search filters.
 *
 * The scope filter comes first and is never overridable — a `departmentId` query
 * parameter can only narrow what the caller may already see, never widen it.
 */
function buildWhere(auth: AuthContext, filters: StudentListFilters): Prisma.StudentWhereInput {
  const clauses: Prisma.StudentWhereInput[] = [
    studentScopeFilter(auth) as Prisma.StudentWhereInput,
  ];

  if (filters.departmentId) {
    clauses.push({ departmentId: filters.departmentId });
  }

  if (filters.search) {
    // Trigram indexes on name and register_number make these ILIKE scans fast
    // (see the constraints migration).
    clauses.push({
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { registerNumber: { contains: filters.search, mode: 'insensitive' } },
        { studentEmail: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }

  if (filters.status) {
    clauses.push({ internships: { some: { status: filters.status as never } } });
  }

  if (filters.missingLogOn) {
    // "Missing daily submission" means no work log for that date, which is the
    // signal 06_App_Flow §7 sorts the faculty follow-up list by.
    clauses.push({
      internships: {
        some: {
          status: { in: ['approved', 'active'] },
          workLogs: { none: { workDate: toDateColumn(filters.missingLogOn) } },
        },
      },
    });
  }

  return { AND: clauses };
}

/** Which of these internships already have a work log for the given date. */
async function findStudentsWithLogOn(
  internshipIds: readonly string[],
  date: string,
): Promise<Set<string>> {
  if (internshipIds.length === 0) return new Set();

  const rows = await prisma.dailyWorkLog.findMany({
    where: { internshipId: { in: [...internshipIds] }, workDate: toDateColumn(date) },
    select: { internshipId: true },
  });

  return new Set(rows.map((row) => row.internshipId));
}

/**
 * Most recent submission per internship, across both attendance and work logs.
 *
 * 12_Mobile_App_Spec §2 sorts the missing-submissions list by last-active date, so
 * whichever of the two happened later is the meaningful value.
 */
async function findLastSubmissionTimes(
  internshipIds: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (internshipIds.length === 0) return result;

  const ids = [...internshipIds];

  const [attendance, workLogs] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['internshipId'],
      where: { internshipId: { in: ids } },
      _max: { createdAt: true },
    }),
    prisma.dailyWorkLog.groupBy({
      by: ['internshipId'],
      where: { internshipId: { in: ids } },
      _max: { createdAt: true },
    }),
  ]);

  const consider = (internshipId: string, value: Date | null): void => {
    if (!value) return;
    const iso = value.toISOString();
    const existing = result.get(internshipId);
    if (!existing || existing < iso) {
      result.set(internshipId, iso);
    }
  };

  for (const row of attendance) consider(row.internshipId, row._max.createdAt);
  for (const row of workLogs) consider(row.internshipId, row._max.createdAt);

  return result;
}

/** Documents still awaiting faculty review, per internship. */
async function countPendingDocuments(
  internshipIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (internshipIds.length === 0) return result;

  const rows = await prisma.document.groupBy({
    by: ['internshipId'],
    where: {
      internshipId: { in: [...internshipIds] },
      verificationStatus: 'pending',
      deletedAt: null,
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (row.internshipId) result.set(row.internshipId, row._count._all);
  }

  return result;
}
