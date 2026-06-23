-- CreateEnum
CREATE TYPE "EstadoPorra" AS ENUM ('ABIERTA', 'CERRADA', 'FINALIZADA');

-- CreateTable
CREATE TABLE "Porra" (
    "id" TEXT NOT NULL,
    "equipoLocal" TEXT NOT NULL,
    "equipoVisitante" TEXT NOT NULL,
    "fechaPartido" TIMESTAMP(3) NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoPorra" NOT NULL DEFAULT 'ABIERTA',
    "resultadoLocal" INTEGER,
    "resultadoVisitante" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Porra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apuesta" (
    "id" TEXT NOT NULL,
    "porraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "golesLocal" INTEGER NOT NULL,
    "golesVisitante" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Apuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Apuesta_porraId_idx" ON "Apuesta"("porraId");

-- AddForeignKey
ALTER TABLE "Apuesta" ADD CONSTRAINT "Apuesta_porraId_fkey" FOREIGN KEY ("porraId") REFERENCES "Porra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
