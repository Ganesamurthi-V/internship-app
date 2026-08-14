/**
 * Domain enumerations.
 *
 * Every value here mirrors a PostgreSQL CHECK constraint in
 * docs/04_Database_Design.md. Keep the string literals byte-identical to the
 * database, the Zod schemas, and the Prisma enums — they are the wire format.
 *
 * `*_LABELS` maps carry the human-readable text shown in the mobile UI so that
 * a label change never requires touching a screen.
 */

// ---------------------------------------------------------------------------
// Users & access control
// ---------------------------------------------------------------------------

export const USER_ROLES = ['student', 'faculty', 'mentor', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  faculty: 'Faculty Coordinator',
  mentor: 'Industry Mentor',
  admin: 'Department Admin',
};

export const USER_STATUSES = ['active', 'suspended', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CLIENT_PLATFORMS = ['ios', 'android', 'web'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

// ---------------------------------------------------------------------------
// Internship
// ---------------------------------------------------------------------------

export const INTERNSHIP_DOMAINS = [
  'software_development',
  'data_science_ai_ml',
  'cyber_security',
  'cloud_computing',
  'networking',
  'web_development',
  'business_management',
  'other',
] as const;
export type InternshipDomain = (typeof INTERNSHIP_DOMAINS)[number];

export const INTERNSHIP_DOMAIN_LABELS: Record<InternshipDomain, string> = {
  software_development: 'Software Development',
  data_science_ai_ml: 'Data Science / AI / ML',
  cyber_security: 'Cyber Security',
  cloud_computing: 'Cloud Computing',
  networking: 'Networking',
  web_development: 'Web Development',
  business_management: 'Business / Management',
  other: 'Other',
};

export const INTERNSHIP_MODES = ['offline', 'online', 'hybrid'] as const;
export type InternshipMode = (typeof INTERNSHIP_MODES)[number];

export const INTERNSHIP_MODE_LABELS: Record<InternshipMode, string> = {
  offline: 'Offline',
  online: 'Online',
  hybrid: 'Hybrid',
};

export const INTERNSHIP_STATUSES = [
  'pending',
  'approved',
  'active',
  'completed',
  'rejected',
] as const;
export type InternshipStatus = (typeof INTERNSHIP_STATUSES)[number];

export const INTERNSHIP_STATUS_LABELS: Record<InternshipStatus, string> = {
  pending: 'Pending Approval',
  approved: 'Approved',
  active: 'Active',
  completed: 'Completed',
  rejected: 'Rejected',
};

/** Statuses in which a student may still submit daily/weekly records. */
export const SUBMITTABLE_INTERNSHIP_STATUSES: readonly InternshipStatus[] = [
  'approved',
  'active',
] as const;

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'permission_leave',
  'holiday',
  'weekly_off',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  permission_leave: 'Permission / Leave',
  holiday: 'Holiday',
  weekly_off: 'Weekly Off',
};

/**
 * Statuses that require a written reason (02_SRS §2.2).
 */
export const ATTENDANCE_STATUSES_REQUIRING_REASON: readonly AttendanceStatus[] = [
  'absent',
  'permission_leave',
] as const;

/**
 * Statuses excluded from the working-day denominator when computing
 * attendance percentage (02_SRS §2.2: holidays and weekly offs do not count).
 */
export const NON_WORKING_ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'holiday',
  'weekly_off',
] as const;

export const ATTENDANCE_MODES = ['office', 'online', 'hybrid'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const ATTENDANCE_MODE_LABELS: Record<AttendanceMode, string> = {
  office: 'Office',
  online: 'Online',
  hybrid: 'Hybrid',
};

// ---------------------------------------------------------------------------
// Daily work log
// ---------------------------------------------------------------------------

export const COMPLETION_STATUSES = ['yes', 'partially', 'no'] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  yes: 'Yes',
  partially: 'Partially',
  no: 'No',
};

export const DELIVERABLE_TYPES = [
  'code',
  'documentation',
  'design',
  'analysis',
  'testing',
  'presentation',
  'other',
] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  code: 'Code',
  documentation: 'Documentation',
  design: 'Design',
  analysis: 'Analysis',
  testing: 'Testing',
  presentation: 'Presentation',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export const OBJECTIVES_STATUSES = ['fully', 'partially', 'no'] as const;
export type ObjectivesStatus = (typeof OBJECTIVES_STATUSES)[number];

export const OBJECTIVES_STATUS_LABELS: Record<ObjectivesStatus, string> = {
  fully: 'Fully Achieved',
  partially: 'Partially Achieved',
  no: 'Not Achieved',
};

/** The eight self-assessment axes from 01_PRD §4.6. */
export const SKILL_TYPES = [
  'technical_knowledge',
  'problem_solving',
  'communication',
  'teamwork',
  'time_management',
  'professional_discipline',
  'adaptability',
  'industry_awareness',
] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_TYPE_LABELS: Record<SkillType, string> = {
  technical_knowledge: 'Technical Knowledge',
  problem_solving: 'Problem Solving',
  communication: 'Communication',
  teamwork: 'Teamwork',
  time_management: 'Time Management',
  professional_discipline: 'Professional Discipline',
  adaptability: 'Adaptability',
  industry_awareness: 'Industry Awareness',
};

/** The ten mentor evaluation parameters from 01_PRD §4.7. */
export const MENTOR_RATING_FIELDS = [
  'technicalKnowledge',
  'problemSolving',
  'communication',
  'teamwork',
  'professionalBehaviour',
  'punctualityAttendance',
  'abilityToLearn',
  'initiative',
  'qualityOfWork',
  'overallPerformance',
] as const;
export type MentorRatingField = (typeof MENTOR_RATING_FIELDS)[number];

export const MENTOR_RATING_LABELS: Record<MentorRatingField, string> = {
  technicalKnowledge: 'Technical Knowledge',
  problemSolving: 'Problem Solving',
  communication: 'Communication',
  teamwork: 'Teamwork',
  professionalBehaviour: 'Professional Behaviour',
  punctualityAttendance: 'Punctuality / Attendance',
  abilityToLearn: 'Ability to Learn',
  initiative: 'Initiative',
  qualityOfWork: 'Quality of Work',
  overallPerformance: 'Overall Performance',
};

/**
 * The 1–5 rating scale used by self-assessment skills, mentor evaluation
 * parameters, and the usefulness rating. Enforced as `INTEGER BETWEEN 1 AND 5`
 * at both the database and Zod layers (04_Database_Design §5).
 */
export type Rating = 1 | 2 | 3 | 4 | 5;

export const RATING_VALUES: readonly Rating[] = [1, 2, 3, 4, 5] as const;

/** Shared 1–5 rating scale descriptors, used by RatingSlider accessibility. */
export const RATING_SCALE_LABELS: Record<Rating, string> = {
  1: 'Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

export const MIN_RATING = 1;
export const MAX_RATING = 5;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  'offer_letter',
  'joining_proof',
  'completion_certificate',
  'internship_report',
  'project_report',
  'attendance_statement',
  'mentor_evaluation_doc',
  'presentation',
  'work_evidence',
  'attendance_proof',
  'weekly_report_pdf',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  offer_letter: 'Offer / Confirmation Letter',
  joining_proof: 'Joining Proof',
  completion_certificate: 'Internship Completion Certificate',
  internship_report: 'Internship Report',
  project_report: 'Project Report',
  attendance_statement: 'Attendance Certificate / Statement',
  mentor_evaluation_doc: 'Mentor Evaluation Document',
  presentation: 'Final Presentation',
  work_evidence: 'Work Evidence',
  attendance_proof: 'Attendance Proof',
  weekly_report_pdf: 'Weekly Report PDF',
  other: 'Other',
};

export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending Review',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** Required before registration can be submitted (01_PRD §4.1). */
export const REGISTRATION_REQUIRED_DOCUMENTS: readonly DocumentType[] = [
  'offer_letter',
  'joining_proof',
] as const;

/** Final checklist from 01_PRD §4.8. `optional` items never block submission. */
export const FINAL_DOCUMENT_CHECKLIST: readonly {
  type: DocumentType;
  optional: boolean;
}[] = [
  { type: 'completion_certificate', optional: false },
  { type: 'internship_report', optional: false },
  { type: 'project_report', optional: true },
  { type: 'offer_letter', optional: false },
  { type: 'attendance_statement', optional: false },
  { type: 'mentor_evaluation_doc', optional: true },
  { type: 'presentation', optional: true },
  { type: 'work_evidence', optional: true },
] as const;

/**
 * 02_SRS §3 — accepted upload types are PDF, JPG, PNG, HEIC.
 *
 * `image/heif` is included because iOS reports HEIC captures under either MIME
 * string depending on the container. 03_TechSpec §6 requires the client to
 * convert HEIC to JPEG before upload, so these two are an accept-but-discourage
 * fallback for clients that skip conversion.
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** 02_SRS §3 — 10 MB per file. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Offline sync
// ---------------------------------------------------------------------------

export const SYNC_RESULT_STATUSES = ['created', 'updated', 'duplicate', 'error'] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

export const LOCAL_SYNC_STATUSES = ['pending', 'synced', 'error'] as const;
export type LocalSyncStatus = (typeof LOCAL_SYNC_STATUSES)[number];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'missing_daily_submission',
  'weekly_report_due',
  'final_assessment_due',
  'mentor_evaluation_request',
  'document_rejected',
  'document_verified',
  'internship_approved',
  'internship_rejected',
  'final_assessment_reopened',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'role_change',
  'user_created',
  'user_status_change',
  'internship_submitted',
  'internship_approved',
  'internship_rejected',
  'attendance_created',
  'attendance_edited',
  'attendance_verified',
  'work_log_created',
  'work_log_edited',
  'weekly_report_submitted',
  'final_assessment_submitted',
  'final_assessment_reopened',
  'mentor_evaluation_submitted',
  'mentor_evaluation_edited',
  'mentor_invite_created',
  'document_uploaded',
  'document_verified',
  'document_rejected',
  'document_deleted',
  'report_exported',
  'settings_changed',
  'refresh_token_reuse_detected',
  'sync_batch_processed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ---------------------------------------------------------------------------
// API error codes (05_API_Spec "Common error codes")
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'SERVER_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

// ---------------------------------------------------------------------------
// Field limits (02_SRS §3 validation rules)
// ---------------------------------------------------------------------------

export const MAX_ACTIVITIES_WORDS = 200;
export const MIN_ACTIVITIES_WORDS = 1;
export const MAX_LEARNING_WORDS = 100;

/** 01_PRD §4.3 guides students toward a 150–200 word daily activity entry. */
export const RECOMMENDED_ACTIVITIES_WORDS_MIN = 150;
