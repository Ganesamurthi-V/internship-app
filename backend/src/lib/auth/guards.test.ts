/**
 * Authorization matrix tests — 09_Test_Plan §3.
 *
 * These assert the matrix in 05_API_Spec directly, case by case, because an
 * authorization regression is the failure mode with the worst consequences and the
 * one least likely to be noticed by hand. 09_Test_Plan §9 makes it an MVP gate:
 * "No Authorization Test fails".
 *
 * `resolveRelation` and `canAccess` are pure, so the whole matrix can be checked
 * without a database.
 */

import { describe, expect, it } from 'vitest';
import type { UserRole } from '@ims/shared-types';
import type { AuthContext } from './context';
import {
  canAccess,
  canSeeContactDetails,
  internshipScopeFilter,
  resolveRelation,
  studentScopeFilter,
  type InternshipScope,
  type Relation,
  type ResourceKind,
} from './guards';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CSE_DEPARTMENT = 'dept-cse';
const MECH_DEPARTMENT = 'dept-mech';

function auth(overrides: Partial<AuthContext> & { role: UserRole }): AuthContext {
  return {
    userId: 'user-generic',
    email: 'user@smvec.ac.in',
    name: 'Test User',
    sessionId: 'session-1',
    studentId: null,
    mentorId: null,
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

const studentA = auth({
  role: 'student',
  userId: 'user-student-a',
  studentId: 'student-a',
  departmentId: CSE_DEPARTMENT,
});

const studentB = auth({
  role: 'student',
  userId: 'user-student-b',
  studentId: 'student-b',
  departmentId: CSE_DEPARTMENT,
});

const assignedMentor = auth({
  role: 'mentor',
  userId: 'user-mentor-1',
  mentorId: 'mentor-1',
});

const otherMentor = auth({
  role: 'mentor',
  userId: 'user-mentor-2',
  mentorId: 'mentor-2',
});

/** Named coordinator on the internship. */
const coordinatingFaculty = auth({
  role: 'faculty',
  userId: 'user-faculty-1',
  departmentId: MECH_DEPARTMENT,
});

/** Same department as the student, but not the named coordinator. */
const departmentFaculty = auth({
  role: 'faculty',
  userId: 'user-faculty-2',
  departmentId: CSE_DEPARTMENT,
});

/** Different department, not the coordinator. */
const outsideFaculty = auth({
  role: 'faculty',
  userId: 'user-faculty-3',
  departmentId: MECH_DEPARTMENT,
});

/** Faculty with no department assigned at all. */
const unscopedFaculty = auth({
  role: 'faculty',
  userId: 'user-faculty-4',
  departmentId: null,
});

const admin = auth({ role: 'admin', userId: 'user-admin' });

const internship: InternshipScope = {
  id: 'internship-a',
  studentId: 'student-a',
  mentorId: 'mentor-1',
  facultyCoordinatorId: 'user-faculty-1',
  student: { departmentId: CSE_DEPARTMENT },
};

// ---------------------------------------------------------------------------
// resolveRelation
// ---------------------------------------------------------------------------

describe('resolveRelation', () => {
  it('identifies the owning student', () => {
    expect(resolveRelation(studentA, internship)).toBe('owner');
  });

  it('gives another student no relation', () => {
    expect(resolveRelation(studentB, internship)).toBe('none');
  });

  it('identifies the assigned mentor', () => {
    expect(resolveRelation(assignedMentor, internship)).toBe('assigned_mentor');
  });

  it('gives an unassigned mentor no relation', () => {
    expect(resolveRelation(otherMentor, internship)).toBe('none');
  });

  it('scopes faculty in by coordinator assignment', () => {
    expect(resolveRelation(coordinatingFaculty, internship)).toBe('scoped_faculty');
  });

  it('scopes faculty in by department match', () => {
    expect(resolveRelation(departmentFaculty, internship)).toBe('scoped_faculty');
  });

  it('keeps faculty from another department out', () => {
    expect(resolveRelation(outsideFaculty, internship)).toBe('none');
  });

  it('fails closed for faculty with no department and no assignment', () => {
    expect(resolveRelation(unscopedFaculty, internship)).toBe('none');
  });

  it('treats admin as unrestricted', () => {
    expect(resolveRelation(admin, internship)).toBe('admin');
  });

  it('does not match a null department against a null student department', () => {
    // Both null must not be treated as "same department", or every unassigned
    // faculty member would see every unassigned student.
    const orphanInternship: InternshipScope = {
      ...internship,
      facultyCoordinatorId: null,
      student: { departmentId: null },
    };
    expect(resolveRelation(unscopedFaculty, orphanInternship)).toBe('none');
  });

  it('does not treat a student with a null studentId as an owner', () => {
    const brokenStudent = auth({ role: 'student', studentId: null });
    const orphanInternship: InternshipScope = { ...internship, studentId: null as never };
    expect(resolveRelation(brokenStudent, orphanInternship)).toBe('none');
  });

  it('does not treat a mentor with a null mentorId as assigned', () => {
    const brokenMentor = auth({ role: 'mentor', mentorId: null });
    const unassigned: InternshipScope = { ...internship, mentorId: null };
    expect(resolveRelation(brokenMentor, unassigned)).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// canAccess — the matrix itself
// ---------------------------------------------------------------------------

describe('canAccess', () => {
  it('denies everything to an unrelated caller', () => {
    const resources: ResourceKind[] = [
      'internship',
      'attendance',
      'work_log',
      'weekly_report',
      'final_assessment',
      'mentor_evaluation',
      'document',
    ];
    for (const resource of resources) {
      expect(canAccess('none', resource, 'read')).toBe(false);
      expect(canAccess('none', resource, 'write')).toBe(false);
    }
  });

  it('lets the owner read and write their daily records', () => {
    expect(canAccess('owner', 'attendance', 'read')).toBe(true);
    expect(canAccess('owner', 'attendance', 'write')).toBe(true);
    expect(canAccess('owner', 'work_log', 'read')).toBe(true);
    expect(canAccess('owner', 'work_log', 'write')).toBe(true);
    expect(canAccess('owner', 'weekly_report', 'write')).toBe(true);
  });

  it('does not let a student verify their own attendance', () => {
    // "R/Verify assigned" belongs to the mentor; the student column is plain RW.
    expect(canAccess('owner', 'attendance', 'verify')).toBe(false);
  });

  it('lets the assigned mentor read but not write attendance', () => {
    expect(canAccess('assigned_mentor', 'attendance', 'read')).toBe(true);
    expect(canAccess('assigned_mentor', 'attendance', 'write')).toBe(false);
    expect(canAccess('assigned_mentor', 'attendance', 'verify')).toBe(true);
  });

  it('lets the assigned mentor read work logs but never edit them', () => {
    expect(canAccess('assigned_mentor', 'work_log', 'read')).toBe(true);
    expect(canAccess('assigned_mentor', 'work_log', 'write')).toBe(false);
  });

  it('gives the mentor no access at all to the final assessment', () => {
    // 05_API_Spec marks this cell "—" for mentors.
    expect(canAccess('assigned_mentor', 'final_assessment', 'read')).toBe(false);
    expect(canAccess('assigned_mentor', 'final_assessment', 'write')).toBe(false);
    expect(canAccess('assigned_mentor', 'final_assessment', 'unlock')).toBe(false);
  });

  it('does not let a mentor approve an internship', () => {
    expect(canAccess('assigned_mentor', 'internship', 'approve')).toBe(false);
  });

  it('lets only the mentor and admin author a mentor evaluation', () => {
    expect(canAccess('assigned_mentor', 'mentor_evaluation', 'write')).toBe(true);
    expect(canAccess('admin', 'mentor_evaluation', 'write')).toBe(true);
    // Faculty may read but not author — "R scoped" in the matrix.
    expect(canAccess('scoped_faculty', 'mentor_evaluation', 'read')).toBe(true);
    expect(canAccess('scoped_faculty', 'mentor_evaluation', 'write')).toBe(false);
    // The student sees their own ratings but cannot change them.
    expect(canAccess('owner', 'mentor_evaluation', 'read')).toBe(true);
    expect(canAccess('owner', 'mentor_evaluation', 'write')).toBe(false);
  });

  it('lets faculty unlock but not author a final assessment', () => {
    expect(canAccess('scoped_faculty', 'final_assessment', 'read')).toBe(true);
    expect(canAccess('scoped_faculty', 'final_assessment', 'unlock')).toBe(true);
    expect(canAccess('scoped_faculty', 'final_assessment', 'write')).toBe(false);
  });

  it('does not let a student unlock their own final assessment', () => {
    expect(canAccess('owner', 'final_assessment', 'unlock')).toBe(false);
  });

  it('lets faculty approve internships', () => {
    expect(canAccess('scoped_faculty', 'internship', 'approve')).toBe(true);
    expect(canAccess('admin', 'internship', 'approve')).toBe(true);
    expect(canAccess('owner', 'internship', 'approve')).toBe(false);
  });

  it('does not let a document owner verify their own document', () => {
    expect(canAccess('owner', 'document', 'write')).toBe(true);
    expect(canAccess('owner', 'document', 'verify')).toBe(false);
    expect(canAccess('scoped_faculty', 'document', 'verify')).toBe(true);
  });

  it('grants admin every defined level on every resource', () => {
    const cases: [ResourceKind, Parameters<typeof canAccess>[2]][] = [
      ['internship', 'read'],
      ['internship', 'write'],
      ['internship', 'approve'],
      ['attendance', 'read'],
      ['attendance', 'write'],
      ['attendance', 'verify'],
      ['work_log', 'read'],
      ['work_log', 'write'],
      ['weekly_report', 'read'],
      ['weekly_report', 'write'],
      ['final_assessment', 'read'],
      ['final_assessment', 'write'],
      ['final_assessment', 'unlock'],
      ['mentor_evaluation', 'read'],
      ['mentor_evaluation', 'write'],
      ['document', 'read'],
      ['document', 'write'],
      ['document', 'verify'],
    ];
    for (const [resource, level] of cases) {
      expect(canAccess('admin', resource, level), `admin ${resource}.${level}`).toBe(true);
    }
  });

  it('returns false for a level that is not defined on a resource', () => {
    // `approve` only exists on internship; asking elsewhere must not accidentally allow.
    const relations: Relation[] = ['owner', 'assigned_mentor', 'scoped_faculty', 'admin'];
    for (const relation of relations) {
      expect(canAccess(relation, 'attendance', 'approve')).toBe(false);
      expect(canAccess(relation, 'work_log', 'verify')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Scope filters
// ---------------------------------------------------------------------------

describe('internshipScopeFilter', () => {
  it('is unrestricted for admin', () => {
    expect(internshipScopeFilter(admin)).toEqual({});
  });

  it('restricts a student to their own id', () => {
    expect(internshipScopeFilter(studentA)).toEqual({ studentId: 'student-a' });
  });

  it('restricts a mentor to their own assignments', () => {
    expect(internshipScopeFilter(assignedMentor)).toEqual({ mentorId: 'mentor-1' });
  });

  it('gives faculty coordinator plus department clauses', () => {
    expect(internshipScopeFilter(departmentFaculty)).toEqual({
      OR: [
        { facultyCoordinatorId: 'user-faculty-2' },
        { student: { departmentId: CSE_DEPARTMENT } },
      ],
    });
  });

  it('omits the department clause when faculty has no department', () => {
    expect(internshipScopeFilter(unscopedFaculty)).toEqual({
      OR: [{ facultyCoordinatorId: 'user-faculty-4' }],
    });
  });

  it('produces an unmatchable filter for a student with no profile', () => {
    // Fails closed: a sentinel id rather than an empty filter, which would expose
    // every internship.
    const broken = auth({ role: 'student', studentId: null });
    expect(internshipScopeFilter(broken)).toEqual({ studentId: '__none__' });
  });

  it('produces an unmatchable filter for a mentor with no profile', () => {
    const broken = auth({ role: 'mentor', mentorId: null });
    expect(internshipScopeFilter(broken)).toEqual({ mentorId: '__none__' });
  });
});

describe('studentScopeFilter', () => {
  it('is unrestricted for admin', () => {
    expect(studentScopeFilter(admin)).toEqual({});
  });

  it('restricts a student to themselves', () => {
    expect(studentScopeFilter(studentA)).toEqual({ id: 'student-a' });
  });

  it('restricts a mentor to students they supervise', () => {
    expect(studentScopeFilter(assignedMentor)).toEqual({
      internships: { some: { mentorId: 'mentor-1' } },
    });
  });

  it('scopes faculty by coordination or department', () => {
    expect(studentScopeFilter(departmentFaculty)).toEqual({
      OR: [
        { internships: { some: { facultyCoordinatorId: 'user-faculty-2' } } },
        { departmentId: CSE_DEPARTMENT },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Contact detail redaction — 07_Security_and_Privacy §8
// ---------------------------------------------------------------------------

describe('canSeeContactDetails', () => {
  it('lets a student see their own contact details', () => {
    expect(canSeeContactDetails(studentA, 'student-a')).toBe(true);
  });

  it('does not let a student see another student\u2019s details', () => {
    expect(canSeeContactDetails(studentA, 'student-b')).toBe(false);
  });

  it('hides the mobile number from faculty', () => {
    // "Faculty sees student name/register number — not mobile number unless needed."
    expect(canSeeContactDetails(departmentFaculty, 'student-a')).toBe(false);
    expect(canSeeContactDetails(coordinatingFaculty, 'student-a')).toBe(false);
  });

  it('hides the mobile number from mentors', () => {
    expect(canSeeContactDetails(assignedMentor, 'student-a')).toBe(false);
  });

  it('allows admin', () => {
    expect(canSeeContactDetails(admin, 'student-a')).toBe(true);
  });
});
