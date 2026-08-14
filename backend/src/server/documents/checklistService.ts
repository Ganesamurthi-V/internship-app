/**
 * Document checklists.
 *
 * Two checklists exist in the documents:
 *   - Registration (01_PRD §4.1): offer letter + joining proof, both required
 *     before the registration can be submitted.
 *   - Final (01_PRD §4.8 / 06_App_Flow §6): the seven-item completion checklist,
 *     some entries marked "if applicable" and therefore optional.
 *
 * Both are rendered by the same UI component, so both are produced in the same
 * shape (`DocumentChecklistItem`), with `required` distinguishing them.
 */

import {
  DOCUMENT_TYPE_LABELS,
  FINAL_DOCUMENT_CHECKLIST,
  REGISTRATION_REQUIRED_DOCUMENTS,
  type DocumentChecklistItem,
  type DocumentType,
} from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { serializeDocument } from '@/lib/serialize';

const DOCUMENT_SELECT = {
  id: true,
  ownerUserId: true,
  documentType: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  uploadedAt: true,
  verifiedAt: true,
  verificationStatus: true,
  rejectionReason: true,
} as const;

/**
 * Builds a checklist for an internship.
 *
 * When several documents of the same type exist — a student re-uploading after a
 * rejection — the most recent one wins, since that is the one faculty should be
 * looking at.
 */
async function buildChecklist(
  internshipId: string,
  entries: readonly { type: DocumentType; required: boolean }[],
): Promise<DocumentChecklistItem[]> {
  const documents = await prisma.document.findMany({
    where: {
      internshipId,
      deletedAt: null,
      documentType: { in: entries.map((entry) => entry.type) },
    },
    orderBy: { uploadedAt: 'desc' },
    select: DOCUMENT_SELECT,
  });

  const latestByType = new Map<string, (typeof documents)[number]>();
  for (const document of documents) {
    if (!latestByType.has(document.documentType)) {
      latestByType.set(document.documentType, document);
    }
  }

  return entries.map((entry) => {
    const document = latestByType.get(entry.type) ?? null;
    return {
      documentType: entry.type,
      label: DOCUMENT_TYPE_LABELS[entry.type],
      required: entry.required,
      uploaded: document !== null,
      verificationStatus: document ? (document.verificationStatus as never) : null,
      document: document ? serializeDocument(document) : null,
    };
  });
}

/** The two documents required to submit a registration. */
export function getRegistrationChecklist(internshipId: string): Promise<DocumentChecklistItem[]> {
  return buildChecklist(
    internshipId,
    REGISTRATION_REQUIRED_DOCUMENTS.map((type) => ({ type, required: true })),
  );
}

/** The end-of-internship checklist, with "if applicable" items marked optional. */
export function getFinalChecklist(internshipId: string): Promise<DocumentChecklistItem[]> {
  return buildChecklist(
    internshipId,
    FINAL_DOCUMENT_CHECKLIST.map((entry) => ({ type: entry.type, required: !entry.optional })),
  );
}

/**
 * Document completeness as a percentage, for the faculty checklist column and the
 * cohort statistics in 02_SRS §7.
 *
 * Counts only required items and only those actually verified — an uploaded but
 * rejected document is not evidence.
 */
export async function getDocumentCompleteness(internshipId: string): Promise<number> {
  const checklist = await getFinalChecklist(internshipId);
  const required = checklist.filter((item) => item.required);
  if (required.length === 0) return 100;

  const verified = required.filter((item) => item.verificationStatus === 'verified').length;
  return Math.round((verified / required.length) * 100);
}
