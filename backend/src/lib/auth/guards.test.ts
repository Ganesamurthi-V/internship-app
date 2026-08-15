/**
 * Authorization matrix tests.
 *
 * These cover `resolveRelation` and `canAccess`, the two pure functions every
 * authorization decision funnels through. Testing them directly rather than
 * through routes means the matrix is verified exhaustively without a database.
 *
 * The cases that matter most are the negative ones: a student reaching another
 * student's submission, a faculty member reaching outside their department, and a
 * reviewer trying to edit answers rather than review them.
 */

import { describe, expect, it } from 'vitest';
import {
  canAccess,
  canSeeContactDetails,
  isAdmin,
  isFaculty,
  isReviewer,
  isStudent,
  questionScopeFilter,
  resolveRelation,
  studentScopeFilter,
  submissionScopeFilter,
  type AccessLevel,
  type Relation,
  type ResourceKind,
} from './guards';
import type { AuthContext } from './context';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEPT_CSE = 'dept-cse';
const DEPT_ECE = 'dept-ece';

function context(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'user-1',
    authId: 'auth-1',
    email: 'someone@smvec.ac.in',
    role: 'student',
    name: 'Someone',
    studentId: null,
    departmentId: null,
    request: {
      requestId: 'req-1',
      ipAddress: null,
      clientPlatform: undefined,
      clientVersion: undefined,
    },
    ...overrides,
  };
}

const studentA = context({
  role: 'student',
  userId: 'user-student-a',
  studentId: 'student-a',
  departmentId: DEPT_CSE,
});

const studentB = context({
  role: 'student',
  userId: 'user-student-b',
  studentId: 'student-b',
  departmentId: DEPT_ECE,
});

const facultyCse = context({
  role: 'faculty',
  userId: 'user-faculty-cse',
  departmentId: DEPT_CSE,
});

const facultyNoDept = context({
  role: 'faculty',
  userId: 'user-faculty-none',
  departmentId: null,
});

const admin = context({ role: 'admin', userId: 'user-admin', departmentId: null });

const recordOfStudentA = { id: 'student-a', departmentId: DEPT_CSE };
const recordOfStudentB = { id: 'student-b', departmentId: DEPT_ECE };
const recordNoDept = { id: 'student-c', departmentId: null };

// ---------------------------------------------------------------------------
// Role predicates
// ---------------------------------------------------------------------------

describe('role predicates', () => {
  it('identifies each role', () => {
    expect(isStudent(studentA)).toBe(true);
    expect(isFaculty(facultyCse)).toBe(true);
    expect(isAdmin(admin)).toBe(true);
  });

  it('treats faculty and admin as reviewers, and students as not', () => {
    expect(isReviewer(facultyCse)).toBe(true);
    expect(isReviewer(admin)).toBe(true);
    expect(isReviewer(studentA)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveRelation
// ---------------------------------------------------------------------------

describe('resolveRelation', () => {
  it('makes a student the owner of their own record', () => {
    expect(resolveRelation(studentA, recordOfStudentA)).toBe('owner');
  });

  it('gives a student nothing on another student’s record', () => {
    expect(resolveRelation(studentA, recordOfStudentB)).toBe('none');
  });

  it('scopes faculty to their own department', () => {
    expect(resolveRelation(facultyCse, recordOfStudentA)).toBe('scoped_faculty');
    expect(resolveRelation(facultyCse, recordOfStudentB)).toBe('none');
  });

  it('gives faculty with no department nothing, rather than everything', () => {
    // Fail-closed: an unconfigured staff account must be useless, not omnipotent.
    expect(resolveRelation(facultyNoDept, recordOfStudentA)).toBe('none');
  });

  it('gives faculty nothing on a student with no department', () => {
    // Two nulls must not be treated as a match.
    expect(resolveRelation(facultyCse, recordNoDept)).toBe('none');
  });

  it('makes admin admin everywhere, including records with no department', () => {
    expect(resolveRelation(admin, recordOfStudentA)).toBe('admin');
    expect(resolveRelation(admin, recordOfStudentB)).toBe('admin');
    expect(resolveRelation(admin, recordNoDept)).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// canAccess — submissions
// ---------------------------------------------------------------------------

describe('canAccess: submission', () => {
  it('lets the owner read and write their own submission', () => {
    expect(canAccess('owner', 'submission', 'read')).toBe(true);
    expect(canAccess('owner', 'submission', 'write')).toBe(true);
  });

  it('does not let the owner review their own submission', () => {
    // Self-approval would make the whole review step meaningless.
    expect(canAccess('owner', 'submission', 'review')).toBe(false);
  });

  it('lets scoped faculty read and review but never write', () => {
    expect(canAccess('scoped_faculty', 'submission', 'read')).toBe(true);
    expect(canAccess('scoped_faculty', 'submission', 'review')).toBe(true);
    // An answer edited by a reviewer is no longer evidence of anything.
    expect(canAccess('scoped_faculty', 'submission', 'write')).toBe(false);
  });

  it('does not let even an admin rewrite a student’s answers', () => {
    expect(canAccess('admin', 'submission', 'write')).toBe(false);
  });

  it('lets admin review and delete', () => {
    expect(canAccess('admin', 'submission', 'review')).toBe(true);
    expect(canAccess('admin', 'submission', 'delete')).toBe(true);
  });

  it('denies deletion to faculty and students', () => {
    expect(canAccess('scoped_faculty', 'submission', 'delete')).toBe(false);
    expect(canAccess('owner', 'submission', 'delete')).toBe(false);
  });

  it('denies everything to an unrelated caller', () => {
    const levels: AccessLevel[] = ['read', 'write', 'review', 'delete'];
    for (const level of levels) {
      expect(canAccess('none', 'submission', level)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// canAccess — questions
// ---------------------------------------------------------------------------

describe('canAccess: question', () => {
  it('lets a student read questions so the form can render', () => {
    expect(canAccess('owner', 'question', 'read')).toBe(true);
  });

  it('does not let a student write questions', () => {
    expect(canAccess('owner', 'question', 'write')).toBe(false);
  });

  it('lets reviewers write questions', () => {
    expect(canAccess('scoped_faculty', 'question', 'write')).toBe(true);
    expect(canAccess('admin', 'question', 'write')).toBe(true);
  });

  it('restricts deletion to admin', () => {
    expect(canAccess('admin', 'question', 'delete')).toBe(true);
    expect(canAccess('scoped_faculty', 'question', 'delete')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAccess — students and documents
// ---------------------------------------------------------------------------

describe('canAccess: student', () => {
  it('lets a student read and update their own profile', () => {
    expect(canAccess('owner', 'student', 'read')).toBe(true);
    expect(canAccess('owner', 'student', 'write')).toBe(true);
  });

  it('lets scoped faculty read but not edit a student profile', () => {
    expect(canAccess('scoped_faculty', 'student', 'read')).toBe(true);
    expect(canAccess('scoped_faculty', 'student', 'write')).toBe(false);
  });
});

describe('canAccess: document', () => {
  it('lets the owner read, attach and remove their own file', () => {
    expect(canAccess('owner', 'document', 'read')).toBe(true);
    expect(canAccess('owner', 'document', 'write')).toBe(true);
    expect(canAccess('owner', 'document', 'delete')).toBe(true);
  });

  it('lets scoped faculty read a file but not upload or delete one', () => {
    expect(canAccess('scoped_faculty', 'document', 'read')).toBe(true);
    expect(canAccess('scoped_faculty', 'document', 'write')).toBe(false);
    expect(canAccess('scoped_faculty', 'document', 'delete')).toBe(false);
  });
});

describe('canAccess: exhaustive fail-closed check', () => {
  it('denies every action to relation "none" across every resource', () => {
    const resources: ResourceKind[] = ['submission', 'question', 'student', 'document'];
    const levels: AccessLevel[] = ['read', 'write', 'review', 'delete'];

    for (const resource of resources) {
      for (const level of levels) {
        expect(canAccess('none', resource, level)).toBe(false);
      }
    }
  });

  it('never silently allows an undefined action', () => {
    // `review` is meaningless for a question; absence must read as denial.
    const relations: Relation[] = ['owner', 'scoped_faculty', 'admin'];
    for (const relation of relations) {
      expect(canAccess(relation, 'question', 'review')).toBe(false);
      expect(canAccess(relation, 'student', 'review')).toBe(false);
      expect(canAccess(relation, 'document', 'review')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Scope filters
// ---------------------------------------------------------------------------

describe('studentScopeFilter', () => {
  it('gives admin an unrestricted filter', () => {
    expect(studentScopeFilter(admin)).toEqual({});
  });

  it('pins a student to their own record', () => {
    expect(studentScopeFilter(studentA)).toEqual({ id: 'student-a' });
  });

  it('scopes faculty to their department', () => {
    expect(studentScopeFilter(facultyCse)).toEqual({ departmentId: DEPT_CSE });
  });

  it('gives faculty with no department an impossible filter', () => {
    expect(studentScopeFilter(facultyNoDept)).toEqual({ departmentId: '__none__' });
  });

  it('gives a student with no studentId an impossible filter', () => {
    const broken = context({ role: 'student', studentId: null });
    expect(studentScopeFilter(broken)).toEqual({ id: '__none__' });
  });
});

describe('submissionScopeFilter', () => {
  it('gives admin an unrestricted filter', () => {
    expect(submissionScopeFilter(admin)).toEqual({});
  });

  it('pins a student to their own submissions', () => {
    expect(submissionScopeFilter(studentA)).toEqual({ studentId: 'student-a' });
  });

  it('scopes faculty through the student’s department', () => {
    expect(submissionScopeFilter(facultyCse)).toEqual({
      student: { departmentId: DEPT_CSE },
    });
  });

  it('gives faculty with no department an impossible filter', () => {
    expect(submissionScopeFilter(facultyNoDept)).toEqual({
      student: { departmentId: '__none__' },
    });
  });
});

describe('questionScopeFilter', () => {
  it('gives admin every question', () => {
    expect(questionScopeFilter(admin)).toEqual({});
  });

  it('gives a student global questions plus their department’s', () => {
    expect(questionScopeFilter(studentA)).toEqual({
      OR: [{ departmentId: null }, { departmentId: DEPT_CSE }],
    });
  });

  it('gives a caller with no department only the global questions', () => {
    // Still usable, unlike the student/submission filters: a global question set
    // is the sensible default rather than an empty form.
    expect(questionScopeFilter(facultyNoDept)).toEqual({ OR: [{ departmentId: null }] });
  });
});

// ---------------------------------------------------------------------------
// Contact detail redaction
// ---------------------------------------------------------------------------

describe('canSeeContactDetails', () => {
  it('lets a student see their own contact details', () => {
    expect(canSeeContactDetails(studentA, 'student-a')).toBe(true);
  });

  it('does not let a student see another student’s', () => {
    expect(canSeeContactDetails(studentA, 'student-b')).toBe(false);
  });

  it('withholds them from faculty, who do not need them to review', () => {
    expect(canSeeContactDetails(facultyCse, 'student-a')).toBe(false);
  });

  it('lets admin see them', () => {
    expect(canSeeContactDetails(admin, 'student-a')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant regression
// ---------------------------------------------------------------------------

describe('cross-boundary access is denied end to end', () => {
  it('blocks a student from another student’s submission at the relation step', () => {
    const relation = resolveRelation(studentB, recordOfStudentA);
    expect(relation).toBe('none');
    expect(canAccess(relation, 'submission', 'read')).toBe(false);
  });

  it('blocks faculty from another department’s submission', () => {
    const relation = resolveRelation(facultyCse, recordOfStudentB);
    expect(relation).toBe('none');
    expect(canAccess(relation, 'submission', 'review')).toBe(false);
  });

  it('allows the intended path: faculty reviewing their own department', () => {
    const relation = resolveRelation(facultyCse, recordOfStudentA);
    expect(relation).toBe('scoped_faculty');
    expect(canAccess(relation, 'submission', 'review')).toBe(true);
  });
});
