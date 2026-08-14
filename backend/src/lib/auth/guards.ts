/**
 * Role and ownership enforcement — the authorization matrix in 05_API_Spec and the
 * access control matrix in 07_Security_and_Privacy §2.
 *
 * The matrix is encoded as data (`ACCESS_MATRIX`) rather than scattered through
 * route handlers, so it can be read side by side with the documents and tested
 * exhaustively. 09_Test_Plan §3 lists the cases this must satisfy.
 *
 * Two conventions worth stating:
 *
 *   - Everything fails closed. An unrecognised combination denies access; a
 *     faculty member with no department and no coordinator assignment sees
 *     nothing rather than everything.
 *   - A record that exists but is not yours returns 403, not 404. That is what
 *     09_Test_Plan §3 specifies ("Direct object reference bypass ... returns
 *     403"). It does reveal that an id exists, which is the trade the spec makes.
 */

import type { UserRole } from '@ims/shared-types';
import { prisma } from '../prisma';
import { forbidden, notFound } from '../errors';
import type { AuthContext } from './context';

// ---------------------------------------------------------------------------
// Role predicates
// ---------------------------------------------------------------------------

export const isStudent = (auth: AuthContext): boolean => auth.role === 'student';
export const isFaculty = (auth: AuthContext): boolean => auth.role === 'faculty';
export const isMentor = (auth: AuthContext): boolean => auth.role === 'mentor';
export const isAdmin = (auth: AuthContext): boolean => auth.role === 'admin';
/** Faculty and admin share most staff-facing capabilities. */
export const isStaff = (auth: AuthContext): boolean => isFaculty(auth) || isAdmin(auth);

export function requireRole(auth: AuthContext, ...allowed: UserRole[]): void {
  if (!allowed.includes(auth.role)) {
    throw forbidden('You do not have permission to do that.');
  }
}

/**
 * Returns the caller's own student id, or fails.
 *
 * Used by the `/me` endpoints and by `POST /api/sync`, whose matrix row is
 * "W own" for students and nothing for everyone else.
 */
export function requireStudentId(auth: AuthContext): string {
  if (!isStudent(auth) || !auth.studentId) {
    throw forbidden('Only students can do that.');
  }
  return auth.studentId;
}

export function requireMentorId(auth: AuthContext): string {
  if (!isMentor(auth) || !auth.mentorId) {
    throw forbidden('Only industry mentors can do that.');
  }
  return auth.mentorId;
}

// ---------------------------------------------------------------------------
// Relation of the caller to a given internship
// ---------------------------------------------------------------------------

export type Relation = 'owner' | 'assigned_mentor' | 'scoped_faculty' | 'admin' | 'none';

export type ResourceKind =
  | 'internship'
  | 'attendance'
  | 'work_log'
  | 'weekly_report'
  | 'final_assessment'
  | 'mentor_evaluation'
  | 'document';

/**
 * Actions beyond plain read/write that the matrix treats separately:
 *   `verify`  — mentor's soft confirmation of attendance, and document verification
 *   `unlock`  — faculty reopening a final assessment or granting early access
 *   `approve` — faculty approving or rejecting a registration
 */
export type AccessLevel = 'read' | 'write' | 'verify' | 'unlock' | 'approve';

/**
 * The authorization matrix, transcribed from 05_API_Spec "Authorization Matrix"
 * and 07_Security_and_Privacy §2.
 *
 * Read as: for this resource and this action, which relations are permitted.
 */
const ACCESS_MATRIX: Record<ResourceKind, Partial<Record<AccessLevel, readonly Relation[]>>> = {
  // "R own | R assigned | RW scoped | RW"
  internship: {
    read: ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'],
    // A student edits their own registration only while it is still pending; the
    // route enforces that status rule on top of this relation check.
    write: ['owner', 'scoped_faculty', 'admin'],
    approve: ['scoped_faculty', 'admin'],
  },

  // "RW own | R/Verify assigned | RW scoped | RW"
  attendance: {
    read: ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'],
    write: ['owner', 'scoped_faculty', 'admin'],
    verify: ['assigned_mentor', 'scoped_faculty', 'admin'],
  },

  // "RW own | R assigned | RW scoped | RW"
  work_log: {
    read: ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'],
    write: ['owner', 'scoped_faculty', 'admin'],
  },

  weekly_report: {
    read: ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'],
    write: ['owner', 'scoped_faculty', 'admin'],
  },

  // "RW own | — | R/Unlock | RW" — note the mentor has no access at all.
  final_assessment: {
    read: ['owner', 'scoped_faculty', 'admin'],
    write: ['owner', 'admin'],
    unlock: ['scoped_faculty', 'admin'],
  },

  // "R own | RW assigned | R scoped | RW" — faculty may read but not author.
  mentor_evaluation: {
    read: ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'],
    write: ['assigned_mentor', 'admin'],
    // Reopening a confirmed evaluation (02_SRS §2.6).
    unlock: ['scoped_faculty', 'admin'],
  },

  // "RW own | R assigned | RW scoped | RW"
  document: {
    read: ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'],
    write: ['owner', 'scoped_faculty', 'admin'],
    verify: ['scoped_faculty', 'admin'],
  },
};

/** The internship fields needed to decide a relation. */
export interface InternshipScope {
  id: string;
  studentId: string;
  mentorId: string | null;
  facultyCoordinatorId: string | null;
  student: { departmentId: string | null };
}

/**
 * Works out how the caller relates to an internship.
 *
 * Faculty scope is the union of two things: being the named coordinator for that
 * internship, or belonging to the student's department. 02_SRS §1.1 describes
 * faculty access as scoped "to department/administrative assignment", which is
 * both of those.
 */
export function resolveRelation(auth: AuthContext, internship: InternshipScope): Relation {
  if (isAdmin(auth)) return 'admin';

  if (isStudent(auth)) {
    return auth.studentId && internship.studentId === auth.studentId ? 'owner' : 'none';
  }

  if (isMentor(auth)) {
    return auth.mentorId && internship.mentorId === auth.mentorId ? 'assigned_mentor' : 'none';
  }

  if (isFaculty(auth)) {
    if (internship.facultyCoordinatorId === auth.userId) return 'scoped_faculty';
    if (
      auth.departmentId !== null &&
      internship.student.departmentId !== null &&
      internship.student.departmentId === auth.departmentId
    ) {
      return 'scoped_faculty';
    }
    return 'none';
  }

  return 'none';
}

export function canAccess(
  relation: Relation,
  resource: ResourceKind,
  level: AccessLevel,
): boolean {
  if (relation === 'none') return false;
  return ACCESS_MATRIX[resource][level]?.includes(relation) ?? false;
}

/**
 * Loads an internship and asserts the caller may perform `level` on `resource`
 * within it. Returns the scope so callers do not query twice.
 *
 * This is the single choke point for internship-scoped authorization — attendance,
 * work logs, weekly reports, assessments and documents all route through it.
 */
export async function assertInternshipAccess(
  auth: AuthContext,
  internshipId: string,
  resource: ResourceKind,
  level: AccessLevel,
): Promise<InternshipScope> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: {
      id: true,
      studentId: true,
      mentorId: true,
      facultyCoordinatorId: true,
      student: { select: { departmentId: true } },
    },
  });

  if (!internship) {
    throw notFound('Internship not found.');
  }

  const relation = resolveRelation(auth, internship);
  if (!canAccess(relation, resource, level)) {
    throw forbidden('You do not have permission to do that.');
  }

  return internship;
}

/**
 * Asserts the caller may read or write a student's profile.
 *
 * 07_Security_and_Privacy §2 "Own profile" row: student RW, faculty R, admin RW,
 * mentor none. Faculty reads are department-scoped.
 */
export async function assertStudentAccess(
  auth: AuthContext,
  studentId: string,
  level: 'read' | 'write',
): Promise<{ id: string; departmentId: string | null }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, departmentId: true },
  });

  if (!student) {
    throw notFound('Student not found.');
  }

  if (isAdmin(auth)) return student;

  if (isStudent(auth)) {
    if (auth.studentId !== student.id) {
      throw forbidden('You do not have permission to do that.');
    }
    return student;
  }

  if (isFaculty(auth) && level === 'read') {
    // Department match, or the faculty member coordinates one of this student's
    // internships.
    if (auth.departmentId && student.departmentId === auth.departmentId) {
      return student;
    }
    const coordinated = await prisma.internship.count({
      where: { studentId: student.id, facultyCoordinatorId: auth.userId },
    });
    if (coordinated > 0) return student;
  }

  throw forbidden('You do not have permission to do that.');
}

// ---------------------------------------------------------------------------
// Scoping filters for list endpoints
// ---------------------------------------------------------------------------

/**
 * Prisma `where` fragment restricting internships to what the caller may see.
 *
 * Applied to every list and dashboard query. Returning an impossible predicate
 * for an unrecognised role means a new role added later shows nothing until it is
 * explicitly handled, rather than seeing everything.
 */
export function internshipScopeFilter(auth: AuthContext): Record<string, unknown> {
  if (isAdmin(auth)) return {};

  if (isStudent(auth)) {
    return { studentId: auth.studentId ?? '__none__' };
  }

  if (isMentor(auth)) {
    return { mentorId: auth.mentorId ?? '__none__' };
  }

  if (isFaculty(auth)) {
    const clauses: Record<string, unknown>[] = [{ facultyCoordinatorId: auth.userId }];
    if (auth.departmentId) {
      clauses.push({ student: { departmentId: auth.departmentId } });
    }
    return { OR: clauses };
  }

  return { id: '__none__' };
}

/** The same idea for student lists (the faculty student directory). */
export function studentScopeFilter(auth: AuthContext): Record<string, unknown> {
  if (isAdmin(auth)) return {};

  if (isStudent(auth)) {
    return { id: auth.studentId ?? '__none__' };
  }

  if (isMentor(auth)) {
    return { internships: { some: { mentorId: auth.mentorId ?? '__none__' } } };
  }

  if (isFaculty(auth)) {
    const clauses: Record<string, unknown>[] = [
      { internships: { some: { facultyCoordinatorId: auth.userId } } },
    ];
    if (auth.departmentId) {
      clauses.push({ departmentId: auth.departmentId });
    }
    return { OR: clauses };
  }

  return { id: '__none__' };
}

/**
 * Whether the caller may see a student's personal contact details.
 *
 * 07_Security_and_Privacy §8: "Faculty sees student name/register number — not
 * mobile number unless needed." Owners and admins see everything; faculty and
 * mentors get the mobile number redacted.
 */
export function canSeeContactDetails(auth: AuthContext, studentId: string): boolean {
  if (isAdmin(auth)) return true;
  return isStudent(auth) && auth.studentId === studentId;
}
