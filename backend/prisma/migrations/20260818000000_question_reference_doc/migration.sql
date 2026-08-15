-- Add an optional reference document to a question.
-- Faculty can attach a PDF/image that students should read as part of the question.

ALTER TABLE "questions"
  ADD COLUMN "reference_doc_id" UUID;

-- Unique because a document is referenced by at most one question (1:1).
CREATE UNIQUE INDEX "questions_reference_doc_id_key" ON "questions"("reference_doc_id");

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_reference_doc_id_fkey"
  FOREIGN KEY ("reference_doc_id")
  REFERENCES "documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
