/**
 * Prisma row → API DTO conversion.
 *
 * Three jobs, all of which must happen in exactly one place:
 *
 *   1. Strip server-only fields. `storage_key` must never appear in a response.
 *      Because these functions build the response object field by field rather
 *      than spreading the row, a sensitive column added later cannot leak by
 *      accident — it simply will not be included until someone adds it.
 *   2. Convert what JSON cannot express: `Date` → ISO string, `@db.Date` →
 *      `YYYY-MM-DD`, `Decimal` → number.
 *   3. Redact per role. A student's mobile number is withheld from faculty, who do
 *      not need it to review a submission.
 */

import type { Decimal } from '@prisma/client/runtime/library';
import type {
  Answer,
  AuditLogEntry,
  ClientPlatform,
  DailySubmission,
  DailySubmissionDetail,
  Department,
  DocumentMeta,
  Question,
  QuestionType,
  Student,
  SubmissionStatus,
  SubmissionStudentSummary,
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
 * Prisma hands back a `Date` at UTC midnight for a DATE column, so the UTC slice
 * is the correct read. Using local getters here is how a date silently becomes the
 * previous day for anyone west of UTC.
 */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toNullableDateOnly(value: Date | null | undefined): string | null {
  return value ? toDateOnly(value) : null;
}

/**
 * Narrows Prisma's `JsonValue` to a string array for the question `options`
 * column. Anything that is not an array of strings reads as null rather than
 * throwing, because a malformed row should degrade the form, not break the list.
 */
function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : null;
}

/** Narrows Prisma's `JsonValue` to a plain object for audit metadata. */
function toMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Department
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

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

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
  mobile: string;
  organisationName?: string | null;
  organisationLocation?: string | null;
  internshipDomain?: string | null;
  internshipMode?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  durationDays?: number | null;
  workingHoursPerDay?: number | null;
  mentorName?: string | null;
  mentorDesignation?: string | null;
  mentorContact?: string | null;
  facultyCoordinator?: string | null;
  createdAt: Date;
  updatedAt: Date;
  department?: DepartmentRow | null;
};

export function serializeStudent(
  row: StudentRow,
  options: { includeContactDetails: boolean },
): Student {
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
    mobile: options.includeContactDetails ? row.mobile : '***',
    organisationName: row.organisationName ?? null,
    organisationLocation: row.organisationLocation ?? null,
    internshipDomain: (row.internshipDomain as Student['internshipDomain']) ?? null,
    internshipMode: (row.internshipMode as Student['internshipMode']) ?? null,
    startDate: row.startDate ? toDateOnly(row.startDate) : null,
    endDate: row.endDate ? toDateOnly(row.endDate) : null,
    durationDays: row.durationDays ?? null,
    workingHoursPerDay: row.workingHoursPerDay ?? null,
    mentorName: row.mentorName ?? null,
    mentorDesignation: row.mentorDesignation ?? null,
    mentorContact: row.mentorContact ?? null,
    facultyCoordinator: row.facultyCoordinator ?? null,
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

/** The reduced student shape shown beside a submission in the review queue. */
type StudentSummaryRow = {
  id: string;
  registerNumber: string;
  name: string;
  programme: string;
  year: number | null;
  section: string | null;
  department?: { name: string } | null;
};

export function serializeStudentSummary(row: StudentSummaryRow): SubmissionStudentSummary {
  return {
    id: row.id,
    registerNumber: row.registerNumber,
    name: row.name,
    programme: row.programme,
    departmentName: row.department?.name ?? null,
    year: row.year,
    section: row.section,
  };
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

type QuestionRow = {
  id: string;
  prompt: string;
  helpText: string | null;
  type: string;
  sortOrder: number;
  isActive: boolean;
  required: boolean;
  options: unknown;
  minLength: number | null;
  maxLength: number | null;
  departmentId: string | null;
  referenceDocId: string | null;
  referenceDoc?: { id: string; originalFilename: string; mimeType: string; sizeBytes: number; uploadedAt: Date } | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    prompt: row.prompt,
    helpText: row.helpText,
    type: row.type as QuestionType,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    required: row.required,
    options: row.type === 'choice' ? toStringArray(row.options) : null,
    minLength: row.minLength,
    maxLength: row.maxLength,
    departmentId: row.departmentId,
    referenceDoc: row.referenceDoc
      ? {
          id: row.referenceDoc.id,
          originalFilename: row.referenceDoc.originalFilename,
          mimeType: row.referenceDoc.mimeType,
          sizeBytes: row.referenceDoc.sizeBytes,
        }
      : null,
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * Note what is missing: `storageKey`, `ownerUserId` and `checksum`. The key is a
 * capability — anyone holding it can mint a URL — so it stays server-side, and
 * downloads go through `GET /api/documents/:id` instead.
 */
type DocumentRow = {
  id: string;
  submissionId: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
};

export function serializeDocument(row: DocumentRow): DocumentMeta {
  return {
    id: row.id,
    submissionId: row.submissionId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedAt: toRequiredIso(row.uploadedAt),
  };
}

// ---------------------------------------------------------------------------
// Answer
// ---------------------------------------------------------------------------

type AnswerRow = {
  id: string;
  questionId: string;
  promptSnapshot: string;
  answerText: string;
  question?: { type: string } | null;
};

/**
 * `documentsById` resolves a `file_upload` answer to its file.
 *
 * A file answer stores the document id in `answerText`, which is meaningless to
 * display. Resolving it here means every screen showing an answer gets the file
 * without needing to know that encoding, or making a second request.
 *
 * A missing entry yields `document: null` rather than throwing: a deleted file
 * should degrade one row, not fail the whole submission.
 */
export function serializeAnswer(
  row: AnswerRow,
  documentsById?: ReadonlyMap<string, DocumentMeta>,
): Answer {
  const questionType = row.question?.type as QuestionType | undefined;

  return {
    id: row.id,
    questionId: row.questionId,
    promptSnapshot: row.promptSnapshot,
    answerText: row.answerText,
    ...(questionType ? { questionType } : {}),
    ...(questionType === 'file_upload'
      ? { document: documentsById?.get(row.answerText) ?? null }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

type SubmissionRow = {
  id: string;
  studentId: string;
  submissionDate: Date;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeSubmission(row: SubmissionRow): DailySubmission {
  return {
    id: row.id,
    studentId: row.studentId,
    submissionDate: toDateOnly(row.submissionDate),
    status: row.status as SubmissionStatus,
    submittedAt: toRequiredIso(row.submittedAt),
    reviewedAt: toIso(row.reviewedAt),
    reviewNote: row.reviewNote,
    createdAt: toRequiredIso(row.createdAt),
    updatedAt: toRequiredIso(row.updatedAt),
  };
}

type SubmissionDetailRow = SubmissionRow & {
  answers: AnswerRow[];
  documents: DocumentRow[];
  student?: StudentSummaryRow | null;
  reviewedBy?: { name: string | null; email: string } | null;
};

/**
 * The full submission a reviewer sees. `student` is included only when the caller
 * loaded it, so a student fetching their own submission does not carry a redundant
 * copy of their own summary.
 */
export function serializeSubmissionDetail(row: SubmissionDetailRow): DailySubmissionDetail {
  const documents = row.documents.map(serializeDocument);
  const documentsById = new Map(documents.map((document) => [document.id, document]));

  return {
    ...serializeSubmission(row),
    answers: row.answers.map((answer) => serializeAnswer(answer, documentsById)),
    documents,
    ...(row.student ? { student: serializeStudentSummary(row.student) } : {}),
    ...(row.reviewedBy
      ? { reviewedByName: row.reviewedBy.name ?? row.reviewedBy.email.split('@')[0]! }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

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
    clientPlatform: (row.clientPlatform as ClientPlatform | null) ?? null,
    clientVersion: row.clientVersion,
    ipAddress: row.ipAddress,
    metadata: toMetadata(row.metadata),
    createdAt: toRequiredIso(row.createdAt),
  };
}
