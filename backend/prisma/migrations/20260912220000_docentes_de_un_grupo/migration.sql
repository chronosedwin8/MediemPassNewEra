-- Quién enseña a cada grupo.
--
-- Hasta ahora el único vínculo entre un docente y un grupo era ser su director
-- de curso, y solo cabía uno. Con eso, el alcance de un docente era «los
-- grupos de los que soy titular», de modo que quien da matemáticas en cinco
-- cursos y no es titular de ninguno no veía ni un grupo y no podía asignar
-- nada.
--
-- El problema se hace evidente al traer la matrícula de Phidias: sus secciones
-- son grupos de clase y llegan sin titular, así que después de sincronizar
-- ningún docente veía ningún grupo. La plataforma quedaba operable solo por
-- administración.
--
-- La materia va en la fila porque el mismo grupo lo comparten varios docentes
-- con asignaturas distintas, y saber cuál enseña cada uno es lo que permite
-- acotar después qué evaluaciones puede asignar. Es opcional: en primaria el
-- titular da casi todo y obligar a desglosarlo sería papeleo.

CREATE TABLE "group_teachers" (
    "group_id"   TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_teachers_pkey" PRIMARY KEY ("group_id", "teacher_id")
);

CREATE INDEX "group_teachers_teacher_id_idx" ON "group_teachers" ("teacher_id");
CREATE INDEX "group_teachers_subject_id_idx" ON "group_teachers" ("subject_id");

ALTER TABLE "group_teachers"
    ADD CONSTRAINT "group_teachers_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Al usuario y no a `teachers`: el alcance se resuelve contra el identificador
-- de quien ha iniciado sesión, y pasar por la ficha en cada consulta añadiría
-- una unión a la ruta más transitada de la aplicación.
ALTER TABLE "group_teachers"
    ADD CONSTRAINT "group_teachers_teacher_id_fkey"
    FOREIGN KEY ("teacher_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_teachers"
    ADD CONSTRAINT "group_teachers_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los titulares actuales pasan a ser también docentes del grupo. Sin esto, el
-- cambio de alcance les quitaría de golpe los grupos que ya veían.
INSERT INTO "group_teachers" ("group_id", "teacher_id")
SELECT "id", "homeroom_teacher_id"
FROM "groups"
WHERE "homeroom_teacher_id" IS NOT NULL
ON CONFLICT DO NOTHING;
