-- CreateEnum
CREATE TYPE "TrainingAudienceMode" AS ENUM ('ALL', 'SELECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrainingContentType" ADD VALUE 'AUDIO';
ALTER TYPE "TrainingContentType" ADD VALUE 'EMBED';
ALTER TYPE "TrainingContentType" ADD VALUE 'ASSESSMENT';

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "academic_period_id" TEXT;

-- AlterTable
ALTER TABLE "training_contents" ADD COLUMN     "assessment_id" TEXT;

-- AlterTable
ALTER TABLE "training_modules" ADD COLUMN     "academic_period_id" TEXT,
ADD COLUMN     "audience_mode" "TrainingAudienceMode" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "created_by_id" TEXT;

-- CreateTable
CREATE TABLE "assessment_subjects" (
    "assessment_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_subjects_pkey" PRIMARY KEY ("assessment_id","subject_id")
);

-- CreateTable
CREATE TABLE "training_audience" (
    "module_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_audience_pkey" PRIMARY KEY ("module_id","user_id")
);

-- CreateIndex
CREATE INDEX "assessment_subjects_subject_id_idx" ON "assessment_subjects"("subject_id");

-- CreateIndex
CREATE INDEX "training_audience_user_id_idx" ON "training_audience"("user_id");

-- CreateIndex
CREATE INDEX "assessments_academic_period_id_idx" ON "assessments"("academic_period_id");

-- CreateIndex
CREATE INDEX "training_modules_created_by_id_idx" ON "training_modules"("created_by_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_subjects" ADD CONSTRAINT "assessment_subjects_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_subjects" ADD CONSTRAINT "assessment_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_audience" ADD CONSTRAINT "training_audience_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_audience" ADD CONSTRAINT "training_audience_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_contents" ADD CONSTRAINT "training_contents_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El conjunto de materias incluye a la principal: sin esto, toda evaluacion
-- anterior aparecería sin materias en la pantalla nueva aunque tuviera una.
INSERT INTO "assessment_subjects" ("assessment_id", "subject_id")
SELECT "id", "subject_id" FROM "assessments" WHERE "subject_id" IS NOT NULL
ON CONFLICT DO NOTHING;
