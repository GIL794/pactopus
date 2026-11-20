import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { validateCriticalEnvs } from '@/lib/envguard';
import { safeLogger } from '@/lib/log-redact';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  try {
    validateCriticalEnvs();
    const adapter = new PrismaPg({ connectionString: url });
    // PERF5: SQL query logging is opt-in via PACTOPUS_LOG_SQL to avoid
    // flooding stdout/request traces on every request. When unset,
    // development still logs warn/error; production logs errors only.
    const enableQueryLog = Boolean(process.env.PACTOPUS_LOG_SQL);
    const devLogs: Prisma.LogLevel[] = enableQueryLog ? ['query', 'error', 'warn'] : ['error', 'warn'];
    const prodLogs: Prisma.LogLevel[] = ['error'];
    return (
      globalForPrisma.prisma ??
      new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? devLogs : prodLogs,
      })
    );
  } catch (err) {
    safeLogger.warn('[Prisma] Database connection initialization failed, falling back to local storage:', err);
    return null;
  }
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma;
}

export const isCloudDbEnabled = Boolean(process.env.DATABASE_URL && prisma);
