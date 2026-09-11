-- Diploma de competencias KMK.
--
-- Apagado por defecto y no heredado de nada: un diploma es una afirmación
-- sobre una persona —«logró estas competencias»— y quien la firma tiene que
-- haber decidido firmarla. Activarlo por omisión convertiría cualquier
-- cuestionario de repaso en una certificación.

ALTER TABLE "assessment_versions"
  ADD COLUMN "certificate_enabled" BOOLEAN NOT NULL DEFAULT false;
