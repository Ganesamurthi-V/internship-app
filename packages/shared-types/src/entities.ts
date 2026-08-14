/**
 * Entity shapes as they cross the wire.
 *
 * These mirror the PostgreSQL tables in docs/04_Database_Design.md §2, converted
 * to camelCase. Two deliberate differences from the database:
 *
 *  - Fields the API must never return are omitted entirely, not made optional:
 *    `password_hash`, `storage_key`, `refresh_token`, `invite_token`
 *    (07_Security_and_Privacy §6: "Sensitive fields never returned").
 *  - Timestamps and dates are ISO 8601 strings, since JSON has no date type.
 *    `DateOnly` marks YYYY-MM-DD values; `Timestamp` marks full instants.
 */

import type {
  AttendanceMode,
  AttendanceStatus,
  ClientPlatform,
  CompletionStatus,
  DeliverableType,
  DocumentType,
  InternshipDomain,
  InternshipMode,
  InternshipStatus,
  NotificationType,
  ObjectivesStatus,
  Rating,
  SkillType,
  UserRole,
  UserStatus,
  VerificationStatus,
} from './enums';

/** ISO 8601 calendar date, `YYYY-MM-DD`. */
export type DateOnly = string;

/** ISO 8601 instant, e.g. `2026-08-14T09:00:00.000Z`. */
export type Timestamp = string;

/** `HH:MM` in 24-hour form. */
export type TimeOnly = string;

export type Uuid = string;

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------

export interface User {
  id: Uuid;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The identity blob returned by login and `GET /api/auth/me`.
 * `name` is resolved from the student/mentor profile, or falls back to the email
 * local-part for faculty/admin accounts that have no profile row.
 */
export interface AuthenticatedUser {
  id: Uuid;
  email: string;
  role: UserRole;
  name: string;
  /** Present only for role === 'student'. */
  studentId?: Uuid;
  /** Present only for role === 'mentor'. */
  mentorId?: Uuid;
  /** Present only for role === 'student' when an internship exists. */
  activeInternshipId?: Uuid | null;
}

// ---------------------------------------------------------------------------
// Organisation structures
// ---------------------------------------------------------------------------

export interface Department {
  id: Uuid;
  name: string;
  institution: string;
  createdAt: Timestamp;
}

export interface Organisation {
  id: Uuid;
  name: string;
  location: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Student {
  id: Uuid;
  userId: Uuid;
  registerNumber: string;
  name: string;
  programme: string;
  departmentId: Uuid | null;
  department?: Department | null;
  year: number | null;
  section: string | null;
  studentEmail: string;
  /**
   * 07_Security_and_Privacy §8: faculty see name and register number, not the
   * mobile number. The API nulls this field for non-owner, non-admin readers.
   */
  mobile: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Mentor {
  id: Uuid;
  /** Null until the mentor creates an account from the invite link. */
  userId: Uuid | null;
  name: string;
  designation: string | null;
  email: string | null;
  contact: string | null;
  organisationId: Uuid | null;
  organisation?: Organisation | null;
  /** Whether an unexpired invite token currently exists. The token is never returned. */
  hasPendingInvite: boolean;
  inviteExpires: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Internship
// ---------------------------------------------------------------------------

export interface Internship {
  id: Uuid;
  studentId: Uuid;
  student?: Student;
  organisationId: Uuid | null;
  organisation?: Organisation | null;
  mentorId: Uuid | null;
  mentor?: Mentor | null;
  facultyCoordinatorId: Uuid | null;
  domain: InternshipDomain;
  mode: InternshipMode;
  startDate: DateOnly;
  endDate: DateOnly;
  /**
   * Read-only. PostgreSQL generated column `end_date - start_date`, so this is
   * a *calendar-day span*, not an inclusive count and not working days.
   * Use `InternshipDuration` for the values shown to users (02_SRS §2.1).
   */
  durationDays: number;
  workingHoursPerDay: number;
  status: InternshipStatus;
  approvedBy: Uuid | null;
  approvedAt: Timestamp | null;
  rejectionReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * 02_SRS §2.1 — "display as working days and calendar days".
 * Computed server-side; never stored.
 */
export interface InternshipDuration {
  /** Inclusive count of every date from start to end. */
  calendarDays: number;
  /** Calendar days excluding Saturdays and Sundays. */
  workingDays: number;
  /** Whole weeks spanned, used to bound weekly report numbering. */
  totalWeeks: number;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface Attendance {
  id: Uuid;
  internshipId: Uuid;
  studentId: Uuid;
  /** Wire name for the `attendance_date` column. */
  date: DateOnly;
  status: AttendanceStatus;
  reportingTime: TimeOnly | null;
  leavingTime: TimeOnly | null;
  /** Read-only. Generated column: (leaving_time - reporting_time) in hours. */
  totalHours: number | null;
  mode: AttendanceMode | null;
  proofDocumentId: Uuid | null;
  proofDocument?: DocumentMeta | null;
  leaveReason: string | null;
  /** 02_SRS §2.2 — a soft confirmation, never a gate on submission. */
  mentorVerified: boolean;
  mentorVerifiedAt: Timestamp | null;
  /** Device-generated idempotency key for offline sync. */
  clientId: Uuid | null;
  syncedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Response shape of `GET /api/attendance/summary` (05_API_Spec). */
export interface AttendanceSummary {
  /**
   * Elapsed dates in the internship that are neither `holiday` nor `weekly_off`.
   * 02_SRS §2.2: holidays and weekly offs are excluded from the denominator.
   */
  totalWorkingDays: number;
  daysAttended: number;
  daysAbsent: number;
  daysLeave: number;
  holidays: number;
  /** Rounded to one decimal place. */
  attendancePercentage: number;
  totalHours: number;
}

// ---------------------------------------------------------------------------
// Daily work log
// ---------------------------------------------------------------------------

export interface DailyWorkLog {
  id: Uuid;
  internshipId: Uuid;
  studentId: Uuid;
  workDate: DateOnly;
  activities: string;
  technologies: string[];
  taskAssigned: string | null;
  completionStatus: CompletionStatus | null;
  learning: string | null;
  challenge: string | null;
  solution: string | null;
  deliverableType: DeliverableType | null;
  evidenceDocumentId: Uuid | null;
  evidenceDocument?: DocumentMeta | null;
  mentorInteraction: boolean;
  mentorFeedback: string | null;
  clientId: Uuid | null;
  syncedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Weekly report
// ---------------------------------------------------------------------------

export interface WeeklyReport {
  id: Uuid;
  internshipId: Uuid;
  studentId: Uuid;
  weekNumber: number;
  weekStartDate: DateOnly;
  weekEndDate: DateOnly;
  /** Auto-aggregated from attendance. Student cannot override (02_SRS §2.4). */
  daysAttended: number | null;
  totalHours: number | null;
  majorActivities: string | null;
  technologiesLearned: string[];
  skillsDeveloped: string[];
  majorAssignment: string | null;
  problems: string | null;
  solutions: string | null;
  learningOutcomes: string | null;
  mentorFeedback: string | null;
  studentSelfAssessment: string | null;
  reportDocumentId: Uuid | null;
  reportDocument?: DocumentMeta | null;
  /** Null while the report is still a draft. */
  submittedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Response shape of `GET /api/weekly-reports/current`. */
export interface CurrentWeekSummary {
  weekNumber: number;
  weekStartDate: DateOnly;
  weekEndDate: DateOnly;
  daysAttended: number;
  totalHours: number;
  reportExists: boolean;
  /** Present when `reportExists` is true, so the client can deep-link to edit. */
  reportId?: Uuid;
  submitted?: boolean;
}

// ---------------------------------------------------------------------------
// Final assessment
// ---------------------------------------------------------------------------

export interface SkillRating {
  id: Uuid;
  finalAssessmentId: Uuid;
  skillType: SkillType;
  rating: Rating;
}

export interface FinalAssessment {
  id: Uuid;
  internshipId: Uuid;
  studentId: Uuid;
  completedSuccessfully: boolean | null;
  /** Auto-filled from attendance aggregation. */
  totalDaysAttended: number | null;
  totalHours: number | null;
  majorProject: string | null;
  technologiesMastered: string[];
  skillsDeveloped: string[];
  objectivesStatus: ObjectivesStatus | null;
  usefulnessRating: Rating | null;
  technicalImprovement: string | null;
  employabilityImprovement: string | null;
  curriculumRelation: string | null;
  realWorldExposure: string | null;
  recommendOrganisation: boolean | null;
  suggestions: string | null;
  /** Non-null means locked; only faculty/admin can reopen (02_SRS §2.5). */
  submittedAt: Timestamp | null;
  skillRatings: SkillRating[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Whether the student may open the final assessment yet.
 * 02_SRS §2.5: unlocked at the internship end date, or by faculty override.
 */
export interface FinalAssessmentAccess {
  unlocked: boolean;
  /** True when unlocked because the end date has passed. */
  endDateReached: boolean;
  /** True when a faculty member granted early access. */
  facultyUnlocked: boolean;
  /** Non-null means already submitted and therefore read-only. */
  submittedAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Mentor evaluation
// ---------------------------------------------------------------------------

export interface MentorEvaluation {
  id: Uuid;
  internshipId: Uuid;
  mentorId: Uuid;
  technicalKnowledge: Rating | null;
  problemSolving: Rating | null;
  communication: Rating | null;
  teamwork: Rating | null;
  professionalBehaviour: Rating | null;
  punctualityAttendance: Rating | null;
  abilityToLearn: Rating | null;
  initiative: Rating | null;
  qualityOfWork: Rating | null;
  overallPerformance: Rating | null;
  strengths: string | null;
  improvementAreas: string | null;
  remarks: string | null;
  employmentRecommendation: boolean | null;
  /** 02_SRS §2.6 — immutable once true, unless faculty/admin reopens. */
  digitalConfirmation: boolean;
  submittedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Result of `GET /api/mentor/invite/:token` — public, so it leaks nothing extra. */
export interface MentorInviteContext {
  valid: boolean;
  mentorName: string;
  organisationName: string | null;
  studentName: string;
  studentRegisterNumber: string;
  internshipId: Uuid;
  expiresAt: Timestamp;
  /** True when an evaluation has already been digitally confirmed. */
  alreadySubmitted: boolean;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Document metadata. `storageKey` is intentionally absent — it is a server-only
 * secret (07_Security_and_Privacy §6). Clients fetch bytes via
 * `GET /api/documents/:id`, which issues a short-lived presigned URL.
 */
export interface DocumentMeta {
  id: Uuid;
  ownerUserId: Uuid;
  documentType: DocumentType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  uploadedAt: Timestamp;
  verifiedAt: Timestamp | null;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
}

/** One row of the upload checklist rendered on the documents screens. */
export interface DocumentChecklistItem {
  documentType: DocumentType;
  label: string;
  required: boolean;
  uploaded: boolean;
  verificationStatus: VerificationStatus | null;
  document: DocumentMeta | null;
}

// ---------------------------------------------------------------------------
// Notifications & audit
// ---------------------------------------------------------------------------

export interface NotificationLog {
  id: Uuid;
  userId: Uuid;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface AuditLogEntry {
  id: Uuid;
  actorUserId: Uuid | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId: Uuid | null;
  clientPlatform: ClientPlatform | null;
  clientVersion: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
}
