-- Add Solana Seeker & GBP Accounting fields to Invoice table
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentState" TEXT NOT NULL DEFAULT 'requested';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "seekerVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "referencePubkey" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "memo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gbpRate" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gbpAmount" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gbpFee" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gbpNetAmount" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_referencePubkey_idx" ON "Invoice"("referencePubkey");
