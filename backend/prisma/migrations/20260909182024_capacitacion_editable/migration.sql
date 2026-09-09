-- CreateEnum
CREATE TYPE "TrainingModuleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "StoredFileKind" ADD VALUE 'TRAINING_MEDIA';

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "trainingProgressId" TEXT,
ADD COLUMN     "training_content_id" TEXT;

-- AlterTable
ALTER TABLE "training_modules" ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "status" "TrainingModuleStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "stored_files_training_content_id_idx" ON "stored_files"("training_content_id");

-- CreateIndex
CREATE INDEX "training_modules_status_idx" ON "training_modules"("status");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_training_content_id_fkey" FOREIGN KEY ("training_content_id") REFERENCES "training_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_trainingProgressId_fkey" FOREIGN KEY ("trainingProgressId") REFERENCES "training_progress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los módulos que ya existían estaban visibles para el profesorado, así que
-- pasan a PUBLISHED. Si quedaran en DRAFT, la migración los haría desaparecer
-- de la vista de quien está a mitad de su formación.
UPDATE "training_modules" SET "status" = 'PUBLISHED', "published_at" = "created_at" WHERE "active" = true;
