-- Estudiante desnormalizado en las respuestas.
--
-- La tabla ya lleva copias de competencia, materia, grupo y periodo para que
-- la analítica sea un único GROUP BY sobre columnas indexadas. Faltaba el
-- estudiante, y sin él «el nivel de cada alumno del curso en cada competencia»
-- obligaba a recorrer intento → usuario → estudiante por cada fila.
--
-- Es nulo a propósito: el profesorado también responde las evaluaciones de su
-- capacitación, y esas respuestas no pertenecen a ningún estudiante.

ALTER TABLE "attempt_answers" ADD COLUMN "student_id" TEXT;

-- Se rellena lo ya existente. Sin esto, la estadística por estudiante
-- empezaría vacía y daría a entender que nadie ha respondido nunca nada.
UPDATE "attempt_answers" AS aa
SET "student_id" = s."id"
FROM "assessment_attempts" AS at
JOIN "students" AS s ON s."user_id" = at."user_id"
WHERE aa."attempt_id" = at."id";

ALTER TABLE "attempt_answers"
  ADD CONSTRAINT "attempt_answers_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "attempt_answers_student_id_kmk_competency_id_idx"
  ON "attempt_answers"("student_id", "kmk_competency_id");
