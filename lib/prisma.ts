import { PrismaClient } from "@prisma/client";

// Cliente único de Prisma reutilizado entre recargas en desarrollo
// (evita agotar el pool de conexiones con hot-reload de Next.js).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
