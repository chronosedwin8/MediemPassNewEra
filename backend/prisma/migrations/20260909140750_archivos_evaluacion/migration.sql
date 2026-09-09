-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
