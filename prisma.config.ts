import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma v7 removed datasource.directUrl/schema.prisma url fields.
// All Prisma CLI operations (migrate dev, migrate diff, migrate resolve, db validate, generate)
// use `datasource.url` here as their connection. We MUST pass the Neon DIRECT endpoint here
// because PgBouncer (pooler endpoint) fails migrations with `prepared statement "s0" already exists`.
// PrismaClient itself continues to use DATABASE_URL (pooler) at runtime via lib/db.ts; the
// prisma.config.ts datasource.url is only for CLI commands.
const cliConnection = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: cliConnection,
  },
});
