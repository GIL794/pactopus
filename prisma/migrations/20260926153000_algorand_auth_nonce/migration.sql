CREATE TABLE "AuthNonce" ("nonce" TEXT NOT NULL, "wallet" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("nonce"));
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");
