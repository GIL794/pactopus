-- Adds Subscription.sessionId (declared in schema.prisma but never migrated).
-- Idempotent: safe if the column/index were already added by hand on an existing database.
ALTER TABLE "public"."Subscription" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscription_session_id_unique" ON "public"."Subscription"("sessionId");
