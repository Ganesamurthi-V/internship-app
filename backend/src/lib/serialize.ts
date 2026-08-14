/**
 * Prisma row → API DTO conversion.
 *
 * Three jobs, all of which must happen in exactly one place:
 *
 *   1. Strip server-only fields. `storage_key`, `password_hash`, `refresh_token`
 *      and `invite_token` must never appear in a response
 *      (07_Security_and_Privacy §6). Because these functions build the response
 *      objects field by field rather than spreading the row, a newly added
 *      sensitive column cannot leak by accident.
 *   2. Convert Prisma types JSON cannot express: `Decimal` → number,
 *      `Date` → ISO string, `@db.Date` → `YYYY-MM-DD`.
 *   3. Redact per-role. Student mobile numbers are hidden from faculty and mentors
 *      (07_Security_and_Privacy §8).
 */

import type { Decimal } from '@prisma/client/runtime/library';
import { formatDateOnly } from '@ims/shared-validation';
import type {
  Attendance,
  AuditLogEntry,
  DailyWorkLog,
  Department,
  DocumentMeta,
  FinalAssessment,
  Internship,
  Mentor,
  MentorEvaluation,
  NotificationLog,
  Organisation,
  Rating,
  SkillRating,
  Student,
  WeeklyReport,
} from '@ims/shared-types';

// ---------------------------------------------------------------------------
// Primitive converters
// ---------------------------------------------------------------------------

/** Prisma `Decimal` → number. Null-safe. */
export function toNumber(value: Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

export function toRequiredNumber(value: Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

/** Timestamptz → ISO 8601 string. */
export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toRequiredIso(value: Date): string {
  return value.toISOString();
}

/**
 * `@db.Date` → `YYYY-MM-DD`.
 *
 * Prisma hands back a Date at UTC midnight for a DATE column, and
 * `formatDateOnly` reads it in UTC. Using local-time getters here would shift the
 * date by a day for anyone west of UTC and silently corrupt attendance records.
 */
export function toDateOnly(value: Date): string {
  return formatDateOnly(value);
}

/** Narrows a stored 1–5 integer to the Rating union. Null-safe. */
export function toRating(value: number | null | undefined): Rating | null {
  if (value === null || value === undefined) return null;
  return value as Rating;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

type DepartmentRow = {
  id: string;
  name: string;
  institution: string;
  createdAt: Date;
};

export function serializeDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    createdAt: toRequiredIso(row.createdAt),
  };
}

type OrganisationRow = {
  id: string;
  name: string;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeOrganisation(row: OrganisationRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type StudentRow = {
  id: string;
  userId: string;
  registerNumber: string;
  name: string;
  programme: string;
  departmentId: string | null;
  year: number | null;
  section: string | null;
  studentEmail: string;
  mobile: string | null;
  createdAt: Date;
  updatedAt: Date;
  department?: DepartmentRow | null;
};

/**
 * `includeContactDetails` defaults to false so that forgetting to pass it hides
 * the mobile number rather than exposing it.
 */
export function serializeStudent(
  row: StudentRow,
  options?: { includeContactDetails?: boolean },
): Student {
  const includeContact = options?.includeContactDetails ?? false;

  return {
    id: row.id,
    userId: row.userId,
    registerNumber: row.registerNumber,
    name: row.name,
    programme: row.programme,
    departmentId: row.departmentId,
    department: row.department ? serializeDepartment(row.department) : null,
    year: row.year,
    section: row.section,
    studentEmail: row.studentEmail,
    mobile: includeContact ? row.mobile : null,
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type MentorRow = {
  id: string;
  userId: string | null;
  name: string;
  designation: string | null;
  email: string | null;
  contact: string | null;
  organisationId: string | null;
  inviteToken: string | null;
  inviteExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organisation?: OrganisationRow | null;
};

/**
 * Note what is absent: `inviteToken`. Only its existence and expiry are reported,
 * as `hasPendingInvite`, so a faculty member can see whether to resend an invite
 * without the token itself becoming readable from the API.
 */
export function serializeMentor(row: MentorRow): Mentor {
  const invitePending =
    row.inviteToken !== null &&
    row.inviteExpires !== null &&
    row.inviteExpires.getTime() > Date.now();

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    designation: row.designation,
    email: row.email,
    contact: row.contact,
    organisationId: row.organisationId,
    organisation: row.organisation ? serializeOrganisation(row.organisation) : null,
    hasPendingInvite: invitePending,
    inviteExpires: toIso(row.inviteExpires),
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type InternshipRow = {
  id: string;
  studentId: string;
  organisationId: string | null;
  mentorId: string | null;
  facultyCoordinatorId: string | null;
  domain: string;
  mode: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  workingHoursPerDay: Decimal;
  status: string;
  approvedById: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  organisation?: OrganisationRow | null;
  mentor?: MentorRow | null;
  student?: StudentRow;
};

export function serializeInternship(
  row: InternshipRow,
  options?: { includeContactDetails?: boolean },
): Internship {
  return {
    id: row.id,
    studentId: row.studentId,
    student: row.student
      ? serializeStudent(row.student, { includeContactDetails: options?.includeContactDetails })
      : undefined,
    organisationId: row.organisationId,
    organisation: row.organisation ? serializeOrganisation(row.organisation) : null,
    mentorId: row.mentorId,
    mentor: row.mentor ? serializeMentor(row.mentor) : null,
    facultyCoordinatorId: row.facultyCoordinatorId,
    domain: row.domain as Internship['domain'],
    mode: row.mode as Internship['mode'],
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    durationDays: row.durationDays,
    workingHoursPerDay: toRequiredNumber(row.workingHoursPerDay),
    status: row.status as Internship['status'],
    approvedBy: row.approvedById,
    approvedAt: toIso(row.approvedAt),
    rejectionReason: row.rejectionReason,
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type DocumentRow = {
  id: string;
  ownerUserId: string;
  documentType: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  uploadedAt: Date;
  verifiedAt: Date | null;
  verificationStatus: string;
  rejectionReason: string | null;
};

/** `storageKey` is not a parameter of this function, so it cannot be emitted. */
export function serializeDocument(row: DocumentRow): DocumentMeta {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    documentType: row.documentType as DocumentMeta['documentType'],
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    uploadedAt: toRequiredIso(row.uploadedAt),
    verifiedAt: toIso(row.verifiedAt),
    verificationStatus: row.verificationStatus as DocumentMeta['verificationStatus'],
    rejectionReason: row.rejectionReason,
  };
}

type AttendanceRow = {
  id: string;
  internshipId: string;
  studentId: string;
  attendanceDate: Date;
  status: string;
  reportingTime: string | null;
  leavingTime: string | null;
  totalHours: Decimal | null;
  mode: string | null;
  proofDocumentId: string | null;
  leaveReason: string | null;
  mentorVerified: boolean;
  mentorVerifiedAt: Date | null;
  clientId: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  proofDocument?: DocumentRow | null;
};

export function serializeAttendance(row: AttendanceRow): Attendance {
  return {
    id: row.id,
    internshipId: row.internshipId,
    studentId: row.studentId,
    date: toDateOnly(row.attendanceDate),
    status: row.status as Attendance['status'],
    reportingTime: row.reportingTime,
    leavingTime: row.leavingTime,
    totalHours: toNumber(row.totalHours),
    mode: row.mode as Attendance['mode'],
    proofDocumentId: row.proofDocumentId,
    proofDocument: row.proofDocument ? serializeDocument(row.proofDocument) : null,
    leaveReason: row.leaveReason,
    mentorVerified: row.mentorVerified,
    mentorVerifiedAt: toIso(row.mentorVerifiedAt),
    clientId: row.clientId,
    syncedAt: toIso(row.syncedAt),
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type WorkLogRow = {
  id: string;
  internshipId: string;
  studentId: string;
  workDate: Date;
  activities: string;
  technologies: string[];
  taskAssigned: string | null;
  completionStatus: string | null;
  learning: string | null;
  challenge: string | null;
  solution: string | null;
  deliverableType: string | null;
  evidenceDocumentId: string | null;
  mentorInteraction: boolean;
  mentorFeedback: string | null;
  clientId: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  evidenceDocument?: DocumentRow | null;
};

export function serializeWorkLog(row: WorkLogRow): DailyWorkLog {
  return {
    id: row.id,
    internshipId: row.internshipId,
    studentId: row.studentId,
    workDate: toDateOnly(row.workDate),
    activities: row.activities,
    technologies: row.technologies,
    taskAssigned: row.taskAssigned,
    completionStatus: row.completionStatus as DailyWorkLog['completionStatus'],
    learning: row.learning,
    challenge: row.challenge,
    solution: row.solution,
    deliverableType: row.deliverableType as DailyWorkLog['deliverableType'],
    evidenceDocumentId: row.evidenceDocumentId,
    evidenceDocument: row.evidenceDocument ? serializeDocument(row.evidenceDocument) : null,
    mentorInteraction: row.mentorInteraction,
    mentorFeedback: row.mentorFeedback,
    clientId: row.clientId,
    syncedAt: toIso(row.syncedAt),
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type WeeklyReportRow = {
  id: string;
  internshipId: string;
  studentId: string;
  weekNumber: number;
  weekStartDate: Date;
  weekEndDate: Date;
  daysAttended: number | null;
  totalHours: Decimal | null;
  majorActivities: string | null;
  technologiesLearned: string[];
  skillsDeveloped: string[];
  majorAssignment: string | null;
  problems: string | null;
  solutions: string | null;
  learningOutcomes: string | null;
  mentorFeedback: string | null;
  studentSelfAssessment: string | null;
  reportDocumentId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reportDocument?: DocumentRow | null;
};

export function serializeWeeklyReport(row: WeeklyReportRow): WeeklyReport {
  return {
    id: row.id,
    internshipId: row.internshipId,
    studentId: row.studentId,
    weekNumber: row.weekNumber,
    weekStartDate: toDateOnly(row.weekStartDate),
    weekEndDate: toDateOnly(row.weekEndDate),
    daysAttended: row.daysAttended,
    totalHours: toNumber(row.totalHours),
    majorActivities: row.majorActivities,
    technologiesLearned: row.technologiesLearned,
    skillsDeveloped: row.skillsDeveloped,
    majorAssignment: row.majorAssignment,
    problems: row.problems,
    solutions: row.solutions,
    learningOutcomes: row.learningOutcomes,
    mentorFeedback: row.mentorFeedback,
    studentSelfAssessment: row.studentSelfAssessment,
    reportDocumentId: row.reportDocumentId,
    reportDocument: row.reportDocument ? serializeDocument(row.reportDocument) : null,
    submittedAt: toIso(row.submittedAt),
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type SkillRatingRow = {
  id: string;
  finalAssessmentId: string;
  skillType: string;
  rating: number;
};

export function serializeSkillRating(row: SkillRatingRow): SkillRating {
  return {
    id: row.id,
    finalAssessmentId: row.finalAssessmentId,
    skillType: row.skillType as SkillRating['skillType'],
    rating: row.rating as Rating,
  };
}

type FinalAssessmentRow = {
  id: string;
  internshipId: string;
  studentId: string;
  completedSuccessfully: boolean | null;
  totalDaysAttended: number | null;
  totalHours: Decimal | null;
  majorProject: string | null;
  technologiesMastered: string[];
  skillsDeveloped: string[];
  objectivesStatus: string | null;
  usefulnessRating: number | null;
  technicalImprovement: string | null;
  employabilityImprovement: string | null;
  curriculumRelation: string | null;
  realWorldExposure: string | null;
  recommendOrganisation: boolean | null;
  suggestions: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  skillRatings?: SkillRatingRow[];
};

export function serializeFinalAssessment(row: FinalAssessmentRow): FinalAssessment {
  return {
    id: row.id,
    internshipId: row.internshipId,
    studentId: row.studentId,
    completedSuccessfully: row.completedSuccessfully,
    totalDaysAttended: row.totalDaysAttended,
    totalHours: toNumber(row.totalHours),
    majorProject: row.majorProject,
    technologiesMastered: row.technologiesMastered,
    skillsDeveloped: row.skillsDeveloped,
    objectivesStatus: row.objectivesStatus as FinalAssessment['objectivesStatus'],
    usefulnessRating: toRating(row.usefulnessRating),
    technicalImprovement: row.technicalImprovement,
    employabilityImprovement: row.employabilityImprovement,
    curriculumRelation: row.curriculumRelation,
    realWorldExposure: row.realWorldExposure,
    recommendOrganisation: row.recommendOrganisation,
    suggestions: row.suggestions,
    submittedAt: toIso(row.submittedAt),
    skillRatings: (row.skillRatings ?? []).map(serializeSkillRating),
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type MentorEvaluationRow = {
  id: string;
  internshipId: string;
  mentorId: string;
  technicalKnowledge: number | null;
  problemSolving: number | null;
  communication: number | null;
  teamwork: number | null;
  professionalBehaviour: number | null;
  punctualityAttendance: number | null;
  abilityToLearn: number | null;
  initiative: number | null;
  qualityOfWork: number | null;
  overallPerformance: number | null;
  strengths: string | null;
  improvementAreas: string | null;
  remarks: string | null;
  employmentRecommendation: boolean | null;
  digitalConfirmation: boolean;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeMentorEvaluation(row: MentorEvaluationRow): MentorEvaluation {
  return {
    id: row.id,
    internshipId: row.internshipId,
    mentorId: row.mentorId,
    technicalKnowledge: toRating(row.technicalKnowledge),
    problemSolving: toRating(row.problemSolving),
    communication: toRating(row.communication),
    teamwork: toRating(row.teamwork),
    professionalBehaviour: toRating(row.professionalBehaviour),
    punctualityAttendance: toRating(row.punctualityAttendance),
    abilityToLearn: toRating(row.abilityToLearn),
    initiative: toRating(row.initiative),
    qualityOfWork: toRating(row.qualityOfWork),
    overallPerformance: toRating(row.overallPerformance),
    strengths: row.strengths,
    improvementAreas: row.improvementAreas,
    remarks: row.remarks,
    employmentRecommendation: row.employmentRecommendation,
    digitalConfirmation: row.digitalConfirmation,
    submittedAt: toIso(row.submittedAt),
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type NotificationRow = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

export function serializeNotification(row: NotificationRow): NotificationLog {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as NotificationLog['type'],
    title: row.title,
    body: row.body,
    deliveredAt: toIso(row.deliveredAt),
    readAt: toIso(row.readAt),
    createdAt: toRequiredIso(row.createdAt),
  };
}

type AuditLogRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  clientPlatform: string | null;
  clientVersion: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: Date;
  actorUser?: { email: string } | null;
};

export function serializeAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorEmail: row.actorUser?.email ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    clientPlatform: row.clientPlatform as AuditLogEntry['clientPlatform'],
    clientVersion: row.clientVersion,
    ipAddress: row.ipAddress,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: toRequiredIso(row.createdAt),
  };
}
