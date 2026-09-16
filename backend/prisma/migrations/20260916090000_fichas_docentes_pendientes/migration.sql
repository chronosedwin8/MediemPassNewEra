-- Fichas de docente que faltaban.
--
-- Hasta el 12 de septiembre, crear una cuenta con rol docente desde Usuarios
-- no creaba su fila en `teachers`. Esas cuentas entran, pero no aparecen en el
-- listado de docentes, no se les pueden asignar materias y no se las puede
-- elegir como profesor de un grupo: es exactamente el «no puedo asignar el
-- profesor» que llevó a esta migración.
--
-- El código ya crea la ficha al dar el rol; esto repara las que nacieron antes.
-- Incluye coordinación, que también da clase y también figura en los grupos.
--
-- El identificador lo genera Prisma en la aplicación, no la base, así que aquí
-- se pone uno explícito. Idempotente: solo toca a quien no tiene ficha.

INSERT INTO "teachers" ("id", "user_id", "active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, u."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
WHERE u."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "user_roles" ur
    JOIN "roles" r ON r."id" = ur."role_id"
    WHERE ur."user_id" = u."id"
      AND r."code" IN ('TEACHER', 'COORDINATOR')
  )
  AND NOT EXISTS (SELECT 1 FROM "teachers" t WHERE t."user_id" = u."id");
