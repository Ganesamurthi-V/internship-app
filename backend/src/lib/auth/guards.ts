/**
 * Role and ownership enforcement.
 *
 * The authorization rules are encoded as data (`ACCESS_MATRIX`) rather than
 * scattered through route handlers, so they can be read in one place and tested
 * exhaustively.
 *
 * Two conventions worth stating:
 *
 *   - Everything fails closed. An unrecognised combination denies access, and a
 *     faculty member with no department sees nothing rather than everything.
 *   - A record that exists but is not yours returns 403, not 404. That reveals an
 *     id exists, which is the trade made deliberately: a student who mistypes a
 *     URL gets a clear "not yours" instead of a misleading "does not exist".
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
export const isAdmin = (auth: AuthContext): boolean => auth.role === 'admin';

/**
 * Faculty and admin share every capability; only their data scope differs. Any
 * check that means "can review" or "can manage questions" should use this rather
 * than listing both roles.
 */
export const isReviewer = (auth: AuthContext): boolean => isFaculty(auth) || isAdmin(auth);

export function requireRole(auth: AuthContext, ...allowed: UserRole[]): void {
  if (!allowed.includes(auth.role)) {
    throw forbidden('You do not have permission to do that.');
  }
}

/** Asserts the caller is a reviewer. */
export function requireReviewer(auth: AuthContext): void {
  if (!isReviewer(auth)) {
    throw forbidden('Only faculty can do that.');
  }
}

/**
 * Returns the caller's own student id, or fails.
 *
 * Every student-scoped endpoint keys off this rather than trusting a studentId in
 * the request, which is what makes "answer as someone else" impossible.
 */
export function requireStudentId(auth: AuthContext): string {
  if (!isStudent(auth) || !auth.studentId) {
    throw forbidden('Only students can do that.');
  }
  return auth.studentId;
}

// ---------------------------------------------------------------------------
// Access matrix
// ---------------------------------------------------------------------------

/** How the caller relates to the record in question. */
export type Relation = 'owner' | 'scoped_faculty' | 'admin' | 'none';

export type ResourceKind = 'submission' | 'question' | 'student' | 'document' | 'retake';

/**
 * Actions the matrix distinguishes:
 *   `read`   — view it
 *   `write`  — create or change it
 *   `review` — approve or decline a submission
 *   `delete` — remove it
 */
export type AccessLevel = 'read' | 'write' | 'review' | 'delete';

/**
 * Read as: for this resource and this action, which relations are permitted.
 *
 * The important asymmetries:
 *   - Only a student writes their own submission. Faculty review it; they never
 *     author or edit answers, because an answer edited by a reviewer is no longer
 *     evidence of anything.
 *   - Only reviewers write questions, and every authenticated user reads them —
 *     a student has to see the form to fill it in.
 */
const ACCESS_MATRIX: Record<ResourceKind, Partial<Record<AccessLevel, readonly Relation[]>>> = {
  submission: {
    read: ['owner', 'scoped_faculty', 'admin'],
    // Deliberately owner-only. Faculty cannot rewrite a student's answers.
    write: ['owner'],
    review: ['scoped_faculty', 'admin'],
    delete: ['admin'],
  },

  question: {
    // Any authenticated user, since a student must see the form.
    read: ['owner', 'scoped_faculty', 'admin'],
    write: ['scoped_faculty', 'admin'],
    delete: ['admin'],
  },

  student: {
    read: ['owner', 'scoped_faculty', 'admin'],
    write: ['owner', 'admin'],
    delete: ['admin'],
  },

  document: {
    read: ['owner', 'scoped_faculty', 'admin'],
    write: ['owner'],
    delete: ['owner', 'admin'],
  },

  /**
   * A retake is its own resource rather than a wider `submission.write`, because the
   * two say different things. Faculty decide *whether a closed day reopens*; the
   * student still authors the answers. Folding this into submission write would have
   * let a reviewer write answers, which is exactly what that entry forbids.
   *
   * The student reads their own grants — they have to see one to use it — and can
   * never create or remove one.
   */
  retake: {
    read: ['owner', 'scoped_faculty', 'admin'],
    write: ['scoped_faculty', 'admin'],
    delete: ['scoped_faculty', 'admin'],
  },
};

export function canAccess(relation: Relation, resource: ResourceKind, level: AccessLevel): boolean {
  if (relation === 'none') return false;
  return ACCESS_MATRIX[resource][level]?.includes(relation) ?? false;
}

// ---------------------------------------------------------------------------
// Relation resolution
// ---------------------------------------------------------------------------

/** The student fields needed to decide a relation. */
export interface StudentScope {
  id: string;
  departmentId: string | null;
}

/**
 * Works out how the caller relates to a record belonging to `student`.
 *
 * Faculty scope is departmental. A faculty member with no department set resolves
 * to `none` rather than to everything, which is the fail-closed choice: an
 * unconfigured account should be useless, not omnipotent.
 */
export function resolveRelation(auth: AuthContext, student: StudentScope): Relation {
  if (isAdmin(auth)) return 'admin';

  if (isStudent(auth)) {
    return auth.studentId && student.id === auth.studentId ? 'owner' : 'none';
  }

  if (isFaculty(auth)) {
    if (
      auth.departmentId !== null &&
      student.departmentId !== null &&
      student.departmentId === auth.departmentId
    ) {
      return 'scoped_faculty';
    }
    return 'none';
  }

  return 'none';
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * Loads a submission and asserts the caller may perform `level` on it.
 *
 * Returns the loaded row so callers do not query twice. This is the single choke
 * point for submission authorization.
 */
export async function assertSubmissionAccess(
  auth: AuthContext,
  submissionId: string,
  level: AccessLevel,
): Promise<{ id: string; studentId: string; status: string; submissionDate: Date }> {
  const submission = await prisma.dailySubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      studentId: true,
      status: true,
      submissionDate: true,
      student: { select: { id: true, departmentId: true } },
    },
  });

  if (!submission) {
    throw notFound('Submission not found.');
  }

  const relation = resolveRelation(auth, submission.student);
  if (!canAccess(relation, 'submission', level)) {
    throw forbidden('You do not have permission to do that.');
  }

  return {
    id: submission.id,
    studentId: submission.studentId,
    status: submission.status,
    submissionDate: submission.submissionDate,
  };
}

/** Asserts the caller may read or write a student's profile. */
export async function assertStudentAccess(
  auth: AuthContext,
  studentId: string,
  level: AccessLevel,
): Promise<StudentScope> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, departmentId: true },
  });

  if (!student) {
    throw notFound('Student not found.');
  }

  const relation = resolveRelation(auth, student);
  if (!canAccess(relation, 'student', level)) {
    throw forbidden('You do not have permission to do that.');
  }

  return student;
}

/**
 * Asserts the caller may act on a document.
 *
 * Ownership is by `ownerUserId` rather than through the submission, because an
 * upload URL is issued before the document is attached to anything.
 */
export async function assertDocumentAccess(
  auth: AuthContext,
  documentId: string,
  level: AccessLevel,
): Promise<{ id: string; ownerUserId: string; submissionId: string | null; storageKey: string }> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: {
      id: true,
      ownerUserId: true,
      submissionId: true,
      storageKey: true,
      submission: { select: { student: { select: { id: true, departmentId: true } } } },
    },
  });

  if (!document) {
    throw notFound('Document not found.');
  }

  // The uploader always owns their file, attached or not.
  if (document.ownerUserId === auth.userId) {
    if (!canAccess('owner', 'document', level)) {
      throw forbidden('You do not have permission to do that.');
    }
    return document;
  }

  if (isAdmin(auth)) return document;

  // Otherwise the only route in is through the submission it belongs to,
  // OR through the student who owns the document (e.g. registration uploads
  // like offer/joining letters that are never attached to a submission).
  let student = document.submission?.student ?? null;

  // Fallback: check if the owner is a student in the faculty's scope.
  if (!student) {
    const ownerStudent = await prisma.student.findFirst({
      where: { userId: document.ownerUserId },
      select: { id: true, departmentId: true },
    });
    if (ownerStudent) student = ownerStudent;
  }

  if (!student) {
    throw forbidden('You do not have permission to do that.');
  }

  const relation = resolveRelation(auth, student);
  if (!canAccess(relation, 'document', level)) {
    throw forbidden('You do not have permission to do that.');
  }

  return document;
}

// ---------------------------------------------------------------------------
// Scoping filters for list endpoints
// ---------------------------------------------------------------------------

/**
 * Prisma `where` fragment restricting students to what the caller may see.
 *
 * An unrecognised role gets an impossible predicate, so a role added later shows
 * nothing until it is handled explicitly rather than seeing every student.
 */
export function studentScopeFilter(auth: AuthContext): Record<string, unknown> {
  if (isAdmin(auth)) return {};

  if (isStudent(auth)) {
    return { id: auth.studentId ?? '__none__' };
  }

  if (isFaculty(auth)) {
    // No department means no students, not all students.
    return { departmentId: auth.departmentId ?? '__none__' };
  }

  return { id: '__none__' };
}

/** The same idea for submission lists. */
export function submissionScopeFilter(auth: AuthContext): Record<string, unknown> {
  if (isAdmin(auth)) return {};

  if (isStudent(auth)) {
    return { studentId: auth.studentId ?? '__none__' };
  }

  if (isFaculty(auth)) {
    return { student: { departmentId: auth.departmentId ?? '__none__' } };
  }

  return { id: '__none__' };
}

/**
 * Which questions apply to the caller.
 *
 * A question with a null `departmentId` applies to everyone; one with a department
 * applies only there. A student sees the union of global questions and their own
 * department's.
 */
export function questionScopeFilter(auth: AuthContext): Record<string, unknown> {
  if (isAdmin(auth)) return {};

  // `departmentId` on the context already resolves a student's department from
  // their student record, so this works for both roles.
  return {
    OR: [{ departmentId: null }, ...(auth.departmentId ? [{ departmentId: auth.departmentId }] : [])],
  };
}

/**
 * Whether the caller may see a student's personal contact details.
 *
 * Faculty see name and register number, which is what reviewing requires; the
 * mobile number is not needed to do that job, so it is withheld.
 */
export function canSeeContactDetails(auth: AuthContext, studentId: string): boolean {
  if (isAdmin(auth)) return true;
  return isStudent(auth) && auth.studentId === studentId;
}
