/**
 * One-off backfill: attach documents referenced by `file_upload` answers.
 *
 * A file answer stores its document id in `answerText`, but earlier submissions
 * never linked that document to the submission (`documents.submission_id` stayed
 * null). The reviewer's submission detail lists files via that relation, so those
 * uploads were invisible to faculty and the answer displayed as a bare UUID.
 *
 * Safe to re-run: it only writes when the link is missing or wrong, and it verifies
 * the document belongs to the student who made the submission before touching it.
 *
 *   npx tsx --env-file=.env prisma/backfill-file-answer-documents.ts
 *   npx tsx --env-file=.env prisma/backfill-file-answer-documents.ts --apply
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const answers = await prisma.answer.findMany({
    where: { question: { type: 'file_upload' } },
    select: {
      id: true,
      answerText: true,
      submissionId: true,
      submission: {
        select: {
          submissionDate: true,
          student: { select: { userId: true, name: true, registerNumber: true } },
        },
      },
    },
  });

  console.log(`file_upload answers found: ${answers.length}\n`);

  if (answers.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let linked = 0;
  let alreadyOk = 0;
  const problems: string[] = [];

  for (const answer of answers) {
    const docId = answer.answerText.trim();
    const student = answer.submission.student;
    const day = answer.submission.submissionDate.toISOString().slice(0, 10);
    const who = `${student.registerNumber} ${student.name} (${day})`;

    if (!UUID.test(docId)) {
      problems.push(`${who}: answer is not a document id ("${docId.slice(0, 40)}")`);
      continue;
    }

    const document = await prisma.document.findFirst({
      where: { id: docId, deletedAt: null },
      select: { id: true, ownerUserId: true, submissionId: true, originalFilename: true },
    });

    if (!document) {
      problems.push(`${who}: document ${docId} no longer exists`);
      continue;
    }

    if (document.ownerUserId !== student.userId) {
      problems.push(`${who}: document ${docId} is owned by a different user — skipped`);
      continue;
    }

    if (document.submissionId === answer.submissionId) {
      alreadyOk += 1;
      continue;
    }

    if (apply) {
      await prisma.document.update({
        where: { id: document.id },
        data: { submissionId: answer.submissionId },
      });
    }

    console.log(`  ${apply ? 'linked ' : 'would link'}  ${who}  ->  ${document.originalFilename}`);
    linked += 1;
  }

  console.log(`\nalready linked : ${alreadyOk}`);
  console.log(`${apply ? 'linked' : 'to link'}        : ${linked}`);

  if (problems.length > 0) {
    console.log(`\nNeeds attention (${problems.length}):`);
    for (const p of problems) console.log(`  ${p}`);
  }

  if (!apply && linked > 0) {
    console.log('\nRe-run with --apply to write these changes.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
