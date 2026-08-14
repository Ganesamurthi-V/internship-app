/**
 * Evidence export jobs — 05_API_Spec "Reports", 08_Implementation_Plan Phase 6.
 *
 * The API is the async pair the spec describes: `POST /api/reports/export` returns a
 * job id, `GET /api/reports/export/:jobId` polls until a download URL appears.
 *
 * IMPLEMENTATION NOTE: the job is executed inline, in the same request that creates
 * it, before the 202 is returned. There is no queue.
 *
 * Why: 03_TechSpec §3.2 lists Redis for the notification queue but Phase 0 never
 * selects a job runner, and introducing one would be an infrastructure decision the
 * documents leave open. Rendering a single student's package takes well under the 10
 * seconds budgeted in 09_Test_Plan §7, so inline execution is acceptable at the
 * documented scale.
 *
 * The consequence, stated plainly: a very large aggregate export can exceed a
 * serverless function's execution limit. The job row and the polling endpoint exist
 * precisely so that moving execution to a worker later is a change to this one file
 * and not to the client. `processExportJob` is already written to be callable from a
 * worker.
 */

import type { CreateExportInput } from '@ims/shared-validation';
import type { ExportJob as ExportJobDto } from '@ims/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notFound } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { createSignedDownloadUrl, uploadServerObject } from '@/lib/storage';
import type { AuthContext } from '@/lib/auth/context';
import { internshipScopeFilter } from '@/lib/auth/guards';
import { buildCohortAnalytics, buildStudentEvidence } from './evidenceService';
import { renderCohortAnalyticsPdf, renderStudentEvidencePdf } from './pdfService';
import { toCsv } from './csvService';

/**
 * Creates the job row, runs it, and returns the final state.
 *
 * The row is created first so that a crash mid-render leaves a `running` job the user
 * can see and retry, rather than a silent failure.
 */
export async function createExport(
  auth: AuthContext,
  input: CreateExportInput,
): Promise<ExportJobDto> {
  const job = await prisma.exportJob.create({
    data: {
      requestedById: auth.userId,
      scope: input.scope,
      format: input.format,
      params: input as unknown as Prisma.InputJsonValue,
      status: 'queued',
      progress: 0,
    },
    select: { id: true, createdAt: true },
  });

  await recordAudit({
    action: 'report_exported',
    entityType: 'export_job',
    entityId: job.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { scope: input.scope, format: input.format },
  });

  await processExportJob(job.id, auth);

  return getExportJob(auth, job.id);
}

/**
 * Renders the export and stores it.
 *
 * Written to be callable from a background worker: it takes only the job id and an
 * auth context, and reads everything else from the persisted `params`.
 */
export async function processExportJob(jobId: string, auth: AuthContext): Promise<void> {
  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
    select: { id: true, scope: true, format: true, params: true, requestedById: true },
  });
  if (!job) return;

  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: 'running', progress: 10 },
  });

  try {
    const params = job.params as unknown as CreateExportInput;
    const { body, contentType, extension } = await renderExport(auth, params);

    // Exports live under an `exports/` prefix rather than a user prefix, so the
    // document upload-ownership rule (`storageKey` starts with the user id) cannot be
    // satisfied by an export key — a client can never claim one as its own upload.
    const storageKey = `exports/${job.requestedById}/${jobId}.${extension}`;

    await uploadServerObject({ storageKey, body, contentType });

    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'ready', progress: 100, storageKey, completedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ jobId, error: message }, 'Export job failed');

    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        // Stored for the user to see, so keep it a description rather than a stack.
        error: 'The export could not be generated. Try again.',
        completedAt: new Date(),
      },
    });
  }
}

interface RenderedExport {
  body: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Dispatches on scope and format.
 *
 * Authorization is applied by composing `internshipScopeFilter` into every query, so
 * a faculty member exporting "department" data cannot reach another department even by
 * passing its id.
 */
async function renderExport(
  auth: AuthContext,
  params: CreateExportInput,
): Promise<RenderedExport> {
  const scopeFilter = internshipScopeFilter(auth) as Prisma.InternshipWhereInput;

  if (params.scope === 'student') {
    const internship = await resolveStudentInternship(params, scopeFilter);

    if (params.format === 'csv') {
      const report = await buildStudentEvidence(internship.id);
      return {
        body: Buffer.from(toCsv.studentEvidence(report), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    }

    const report = await buildStudentEvidence(internship.id);
    return {
      body: await renderStudentEvidencePdf(report),
      contentType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // Aggregate scopes all reduce to a filtered cohort.
  const clauses: Prisma.InternshipWhereInput[] = [scopeFilter];

  if (params.scope === 'department' && params.departmentId) {
    clauses.push({ student: { departmentId: params.departmentId } });
  }
  if (params.scope === 'organisation' && params.organisationId) {
    clauses.push({ organisationId: params.organisationId });
  }
  if (params.from) clauses.push({ endDate: { gte: new Date(params.from) } });
  if (params.to) clauses.push({ startDate: { lte: new Date(params.to) } });

  const where: Prisma.InternshipWhereInput = { AND: clauses };
  const analytics = await buildCohortAnalytics(where);

  const title = describeScope(params);

  if (params.format === 'csv') {
    return {
      body: Buffer.from(toCsv.cohortAnalytics(analytics), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }

  return {
    body: await renderCohortAnalyticsPdf(analytics, title),
    contentType: 'application/pdf',
    extension: 'pdf',
  };
}

/**
 * Finds the internship to export for a student-scoped request, restricted to what the
 * caller may see.
 */
async function resolveStudentInternship(
  params: CreateExportInput,
  scopeFilter: Prisma.InternshipWhereInput,
): Promise<{ id: string }> {
  const internship = await prisma.internship.findFirst({
    where: {
      AND: [
        scopeFilter,
        params.internshipId ? { id: params.internshipId } : {},
        params.studentId ? { studentId: params.studentId } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!internship) {
    // Covers both "does not exist" and "outside your scope" without distinguishing
    // them, so the endpoint cannot be used to probe for ids.
    throw notFound('No internship found for that student.');
  }

  return internship;
}

function describeScope(params: CreateExportInput): string {
  const range = params.from || params.to ? ` (${params.from ?? '\u2026'} to ${params.to ?? '\u2026'})` : '';
  switch (params.scope) {
    case 'department':
      return `Department report${range}`;
    case 'organisation':
      return `Organisation report${range}`;
    case 'internship_period':
      return `Internship period report${range}`;
    default:
      return `Programme report${range}`;
  }
}

/**
 * Reads job state, minting a fresh download URL when ready.
 *
 * The URL is generated per poll rather than stored, so it always carries a full
 * 15-minute TTL from the moment the client receives it.
 */
export async function getExportJob(auth: AuthContext, jobId: string): Promise<ExportJobDto> {
  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      requestedById: true,
      scope: true,
      format: true,
      status: true,
      progress: true,
      storageKey: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  });

  // Scoped to the requester: an export contains personal data, so only the person who
  // asked for it may download it.
  if (!job || job.requestedById !== auth.userId) {
    throw notFound('Export job not found.');
  }

  const dto: ExportJobDto = {
    jobId: job.id,
    status: job.status,
    format: job.format as ExportJobDto['format'],
    scope: job.scope as ExportJobDto['scope'],
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };

  if (job.status === 'ready' && job.storageKey) {
    const signed = await createSignedDownloadUrl(job.storageKey);
    dto.downloadUrl = signed.downloadUrl;
    dto.expiresIn = signed.expiresIn;
  }

  if (job.error) dto.error = job.error;

  return dto;
}
