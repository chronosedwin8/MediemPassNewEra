-- Objetivos SMART evaluados con rúbrica.
--
-- SMART no es un criterio de evaluación sino un marco para formular objetivos,
-- así que se implementa como lo que sí se puede puntuar: cinco dimensiones con
-- un indicador observable cada una y niveles de 0 a 4.
--
-- El desglose se guarda aparte de los puntos porque responde a otra pregunta.
-- Los puntos dicen cuánto valió la respuesta; el desglose dice en qué falló, y
-- es lo que permite que la estadística diga «lo que falta casi siempre es el
-- plazo» en lugar de «los objetivos SMART se dan regular».

ALTER TYPE "QuestionType" ADD VALUE 'SMART_GOAL';

ALTER TABLE "attempt_answers" ADD COLUMN "rubric_scores" JSONB;
