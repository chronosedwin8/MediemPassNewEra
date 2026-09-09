-- CreateEnum
CREATE TYPE "StoredFileKind" AS ENUM ('QUESTION_MEDIA', 'EVIDENCE');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "allows_evidence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_evidence_files" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "requires_evidence" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "kind" "StoredFileKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "academic_year_id" TEXT,
    "assessment_id" TEXT,
    "question_id" TEXT,
    "attempt_id" TEXT,
    "answer_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "stored_files_kind_idx" ON "stored_files"("kind");

-- CreateIndex
CREATE INDEX "stored_files_assessment_id_idx" ON "stored_files"("assessment_id");

-- CreateIndex
CREATE INDEX "stored_files_academic_year_id_idx" ON "stored_files"("academic_year_id");

-- CreateIndex
CREATE INDEX "stored_files_attempt_id_idx" ON "stored_files"("attempt_id");

-- CreateIndex
CREATE INDEX "stored_files_answer_id_idx" ON "stored_files"("answer_id");

-- CreateIndex
CREATE INDEX "stored_files_question_id_idx" ON "stored_files"("question_id");

-- CreateIndex
CREATE INDEX "stored_files_uploaded_by_id_idx" ON "stored_files"("uploaded_by_id");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
