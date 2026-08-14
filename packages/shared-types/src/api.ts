/**
 * API request/response contracts.
 *
 * Envelope shapes are fixed by docs/05_API_Spec.md "Standard Response Shapes":
 * every success returns `{ data }`, lists add `{ pagination }`, and every failure
 * returns `{ error: { code, message, fields? } }`. Nothing else is emitted, so
 * the mobile client can unwrap responses in one place.
 */

import type {
  ApiErrorCode,
  AttendanceMode,
  AttendanceStatus,
  ClientPlatform,
  CompletionStatus,
  DeliverableType,
  DocumentType,
  InternshipDomain,
  InternshipMode,
  ObjectivesStatus,
  Rating,
  SkillType,
  SyncResultStatus,
  UserRole,
} from './enums';
import type {
  Attendance,
  AttendanceSummary,
  AuthenticatedUser,
  DailyWorkLog,
  DateOnly,
  DocumentChecklistItem,
  DocumentMeta,
  FinalAssessment,
  FinalAssessmentAccess,
  Internship,
  InternshipDuration,
  MentorEvaluation,
  Student,
  TimeOnly,
  Timestamp,
  Uuid,
  WeeklyReport,
} from './entities';

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiList<T> {
  data: T[];
  pagination: Pagination;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** Field-level messages, keyed by the request body path that failed. */
  fields?: Record<string, string>;
}

export interface ApiFailure {
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiFailure<T>(response: ApiResponse<T>): response is ApiFailure {
  return typeof response === 'object' && response !== null && 'error' in response;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

/** Context the mobile app sends on every request so audit logs can record it. */
export interface ClientContext {
  clientPlatform?: ClientPlatform;
  clientVersion?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds (900). */
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

/**
 * Refresh rotates the refresh token (07_Security_and_Privacy §5), so a new one is
 * always returned. 05_API_Spec shows only `accessToken` and `expiresIn`; the
 * rotated token is an additive field the client must persist.
 */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export interface UpdateStudentProfileRequest {
  name?: string;
  programme?: string;
  departmentId?: Uuid | null;
  year?: number | null;
  section?: string | null;
  studentEmail?: string;
  mobile?: string | null;
}

export interface StudentListQuery extends PaginationQuery {
  search?: string;
  departmentId?: Uuid;
  status?: string;
  /** Restrict to students with no work log for the given date. */
  missingLogOn?: DateOnly;
}

/** Row shape for the faculty student list (12_Mobile_App_Spec §2). */
export interface StudentListItem {
  student: Student;
  internship: Internship | null;
  attendancePercentage: number | null;
  lastSubmissionAt: Timestamp | null;
  missingTodayLog: boolean;
  pendingDocumentCount: number;
}

// ---------------------------------------------------------------------------
// Internships
// ---------------------------------------------------------------------------

/**
 * Registration accepts either an existing `organisationId` or a free-text
 * `organisationName`, which the server upserts. Same for the mentor: the student
 * types mentor details and the server creates the `mentors` row.
 */
export interface CreateInternshipRequest {
  organisationId?: Uuid | null;
  organisationName?: string;
  organisationLocation?: string;
  mentorName?: string;
  mentorDesignation?: string;
  mentorEmail?: string;
  mentorContact?: string;
  domain: InternshipDomain;
  mode: InternshipMode;
  startDate: DateOnly;
  endDate: DateOnly;
  workingHoursPerDay: number;
  facultyCoordinatorId?: Uuid | null;
}

export type UpdateInternshipRequest = Partial<CreateInternshipRequest>;

export interface RejectInternshipRequest {
  /** Required — the student is shown this text. */
  rejectionReason: string;
}

/** `GET /api/internships/me` enriches the record with derived values. */
export interface InternshipDetail {
  internship: Internship;
  duration: InternshipDuration;
  attendanceSummary: AttendanceSummary | null;
  documents: DocumentChecklistItem[];
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface CreateAttendanceRequest {
  internshipId: Uuid;
  date: DateOnly;
  status: AttendanceStatus;
  reportingTime?: TimeOnly | null;
  leavingTime?: TimeOnly | null;
  mode?: AttendanceMode | null;
  leaveReason?: string | null;
  proofDocumentId?: Uuid | null;
  /** Idempotency key generated on the device for offline dedup. */
  clientId?: Uuid | null;
}

export type UpdateAttendanceRequest = Partial<Omit<CreateAttendanceRequest, 'internshipId'>>;

export interface AttendanceListQuery {
  internshipId: Uuid;
  from?: DateOnly;
  to?: DateOnly;
}

export interface VerifyAttendanceRequest {
  /** Defaults to true. Passing false clears a previous verification. */
  verified?: boolean;
}

// ---------------------------------------------------------------------------
// Work logs
// ---------------------------------------------------------------------------

export interface CreateWorkLogRequest {
  internshipId: Uuid;
  workDate: DateOnly;
  activities: string;
  technologies?: string[];
  taskAssigned?: string | null;
  completionStatus?: CompletionStatus | null;
  learning?: string | null;
  challenge?: string | null;
  solution?: string | null;
  deliverableType?: DeliverableType | null;
  evidenceDocumentId?: Uuid | null;
  mentorInteraction?: boolean;
  mentorFeedback?: string | null;
  clientId?: Uuid | null;
}

export type UpdateWorkLogRequest = Partial<Omit<CreateWorkLogRequest, 'internshipId'>>;

export interface WorkLogListQuery {
  internshipId: Uuid;
  from?: DateOnly;
  to?: DateOnly;
  /** Free-text search across activities, learning, and technologies. */
  search?: string;
}

// ---------------------------------------------------------------------------
// Batch sync (03_TechSpec §5, 05_API_Spec "Batch Sync")
// ---------------------------------------------------------------------------

export interface SyncRequest {
  attendance?: CreateAttendanceRequest[];
  workLogs?: CreateWorkLogRequest[];
}

export interface SyncResult {
  clientId: Uuid;
  /** Null when the record was rejected or already existed. */
  serverId: Uuid | null;
  status: SyncResultStatus;
  /** Set when `status === 'duplicate'` — the id of the record already on file. */
  existingId?: Uuid;
  /** Set when `status === 'error'`. */
  message?: string;
  fields?: Record<string, string>;
}

export interface SyncResponse {
  attendance: SyncResult[];
  workLogs: SyncResult[];
}

// ---------------------------------------------------------------------------
// Weekly reports
// ---------------------------------------------------------------------------

/**
 * `daysAttended` and `totalHours` are deliberately absent: 02_SRS §2.4 requires
 * the server to aggregate them from attendance rather than trust the client.
 */
export interface CreateWeeklyReportRequest {
  internshipId: Uuid;
  weekNumber: number;
  majorActivities?: string | null;
  technologiesLearned?: string[];
  skillsDeveloped?: string[];
  majorAssignment?: string | null;
  problems?: string | null;
  solutions?: string | null;
  learningOutcomes?: string | null;
  mentorFeedback?: string | null;
  studentSelfAssessment?: string | null;
  reportDocumentId?: Uuid | null;
}

export type UpdateWeeklyReportRequest = Partial<
  Omit<CreateWeeklyReportRequest, 'internshipId' | 'weekNumber'>
>;

// ---------------------------------------------------------------------------
// Final assessment
// ---------------------------------------------------------------------------

export interface SkillRatingInput {
  skillType: SkillType;
  rating: Rating;
}

export interface UpsertFinalAssessmentRequest {
  internshipId: Uuid;
  completedSuccessfully?: boolean | null;
  majorProject?: string | null;
  technologiesMastered?: string[];
  skillsDeveloped?: string[];
  objectivesStatus?: ObjectivesStatus | null;
  usefulnessRating?: Rating | null;
  technicalImprovement?: string | null;
  employabilityImprovement?: string | null;
  curriculumRelation?: string | null;
  realWorldExposure?: string | null;
  recommendOrganisation?: boolean | null;
  suggestions?: string | null;
  /** All eight skills must be present at submit time. */
  skillRatings?: SkillRatingInput[];
}

export interface FinalAssessmentDetail {
  assessment: FinalAssessment | null;
  access: FinalAssessmentAccess;
  /** Server-computed totals the form pre-fills as read-only. */
  totalDaysAttended: number;
  totalHours: number;
  documents: DocumentChecklistItem[];
}

export interface UnlockFinalAssessmentRequest {
  /** Recorded in the audit log; reopening a submitted assessment is High sensitivity. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Mentor evaluation
// ---------------------------------------------------------------------------

export interface UpsertMentorEvaluationRequest {
  internshipId: Uuid;
  technicalKnowledge?: Rating | null;
  problemSolving?: Rating | null;
  communication?: Rating | null;
  teamwork?: Rating | null;
  professionalBehaviour?: Rating | null;
  punctualityAttendance?: Rating | null;
  abilityToLearn?: Rating | null;
  initiative?: Rating | null;
  qualityOfWork?: Rating | null;
  overallPerformance?: Rating | null;
  strengths?: string | null;
  improvementAreas?: string | null;
  remarks?: string | null;
  employmentRecommendation?: boolean | null;
}

export interface SubmitMentorEvaluationRequest {
  /** Must be true — this is the digital confirmation that locks the record. */
  digitalConfirmation: true;
}

/** Row shape for `GET /api/mentor/students`. */
export interface MentorStudentItem {
  internshipId: Uuid;
  studentName: string;
  registerNumber: string;
  programme: string;
  startDate: DateOnly;
  endDate: DateOnly;
  attendancePercentage: number | null;
  unverifiedAttendanceCount: number;
  evaluation: MentorEvaluation | null;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface UploadUrlRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
  /** Seconds until the presigned PUT URL expires (300). */
  expiresIn: number;
}

export interface CompleteUploadRequest {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
  /** Optional SHA-256 for integrity verification. */
  checksum?: string;
  /** Links the document to an internship-scoped record when relevant. */
  internshipId?: Uuid | null;
}

export interface DocumentDownloadResponse {
  downloadUrl: string;
  /** Seconds until the presigned GET URL expires (900). */
  expiresIn: number;
  document: DocumentMeta;
}

export interface RejectDocumentRequest {
  rejectionReason: string;
}

export interface DocumentListQuery {
  internshipId?: Uuid;
  type?: DocumentType;
  studentId?: Uuid;
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

/** Drives the student dashboard checklist (06_App_Flow §4). */
export interface StudentDashboard {
  student: Student;
  internship: Internship | null;
  duration: InternshipDuration | null;
  attendanceSummary: AttendanceSummary | null;
  today: {
    date: DateOnly;
    attendanceSubmitted: boolean;
    workLogSubmitted: boolean;
  };
  currentWeek: {
    weekNumber: number;
    weekEndDate: DateOnly;
    reportSubmitted: boolean;
    dueSoon: boolean;
  } | null;
  finalAssessment: {
    unlocked: boolean;
    submitted: boolean;
    dueInDays: number | null;
  } | null;
  pendingDocumentCount: number;
  unreadNotificationCount: number;
}

/** Faculty dashboard summary cards (06_App_Flow §7). */
export interface FacultyDashboard {
  activeInternships: number;
  missingTodaysLog: number;
  pendingDocumentReview: number;
  pendingApproval: number;
  evaluationsOutstanding: number;
  completedInternships: number;
  /** Cohort-wide attendance mean, rounded to one decimal. */
  averageAttendancePercentage: number | null;
}

export interface MentorDashboard {
  assignedStudents: number;
  unverifiedAttendanceCount: number;
  pendingEvaluations: number;
}

// ---------------------------------------------------------------------------
// Reports & export
// ---------------------------------------------------------------------------

/** Full student evidence summary — sections 1–7 of 06_App_Flow §8. */
export interface StudentEvidenceReport {
  student: Student;
  internship: Internship;
  duration: InternshipDuration;
  attendanceSummary: AttendanceSummary;
  attendance: Attendance[];
  workLogs: DailyWorkLog[];
  weeklyReports: WeeklyReport[];
  mentorEvaluation: MentorEvaluation | null;
  finalAssessment: FinalAssessment | null;
  documents: DocumentMeta[];
  /** Aggregated technology tags across all work logs, most frequent first. */
  technologyUsage: { technology: string; count: number }[];
}

export const EXPORT_FORMATS = ['pdf', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_SCOPES = ['student', 'internship_period', 'department', 'organisation'] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export interface CreateExportRequest {
  scope: ExportScope;
  format: ExportFormat;
  studentId?: Uuid;
  internshipId?: Uuid;
  departmentId?: Uuid;
  organisationId?: Uuid;
  from?: DateOnly;
  to?: DateOnly;
}

export const EXPORT_JOB_STATUSES = ['queued', 'running', 'ready', 'failed'] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export interface ExportJob {
  jobId: Uuid;
  status: ExportJobStatus;
  format: ExportFormat;
  scope: ExportScope;
  /** 0–100. */
  progress: number;
  /** Present when `status === 'ready'`; short-lived presigned URL. */
  downloadUrl?: string;
  expiresIn?: number;
  error?: string;
  createdAt: Timestamp;
  completedAt?: Timestamp | null;
}

/** Cohort aggregates backing the NBA package sections D and E (06_App_Flow §8). */
export interface CohortAnalytics {
  studentCount: number;
  averageAttendancePercentage: number | null;
  totalHours: number;
  completionBreakdown: Record<string, number>;
  documentCompletenessPercentage: number;
  averageSkillRatings: { skillType: SkillType; average: number }[];
  averageMentorRatings: { field: string; average: number }[];
  topTechnologies: { technology: string; count: number }[];
  organisationStats: { organisationName: string; studentCount: number }[];
  departmentStats: { departmentName: string; studentCount: number }[];
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export interface FacultyCoordinatorOption {
  id: Uuid;
  name: string;
  email: string;
  role: UserRole;
}
