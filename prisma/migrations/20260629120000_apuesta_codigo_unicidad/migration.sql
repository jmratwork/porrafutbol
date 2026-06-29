-- Añade el nombre normalizado (para unicidad por porra) y el hash del código
-- secreto que permite a cada dueño editar o borrar su propia apuesta.

-- 1. Nuevas columnas (primero anulables para poder rellenar datos existentes).
ALTER TABLE "Apuesta" ADD COLUMN "nombreNormalizado" TEXT;
ALTER TABLE "Apuesta" ADD COLUMN "codigoHash" TEXT;

-- 2. Backfill de filas existentes.
--    El código en claro no es recuperable: las apuestas previas quedan con hash
--    vacío (no editables por código; el admin puede borrarlas como rescate).
UPDATE "Apuesta" SET "nombreNormalizado" = lower(btrim("nombre")) WHERE "nombreNormalizado" IS NULL;
UPDATE "Apuesta" SET "codigoHash" = '' WHERE "codigoHash" IS NULL;

-- 3. Ahora ya pueden ser obligatorias.
ALTER TABLE "Apuesta" ALTER COLUMN "nombreNormalizado" SET NOT NULL;
ALTER TABLE "Apuesta" ALTER COLUMN "codigoHash" SET NOT NULL;

-- 4. Unicidad de nombre dentro de una misma porra.
CREATE UNIQUE INDEX "Apuesta_porraId_nombreNormalizado_key" ON "Apuesta"("porraId", "nombreNormalizado");
