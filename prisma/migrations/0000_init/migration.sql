-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."AgentLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "feeTxHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "fee" TEXT,
    "network" TEXT NOT NULL DEFAULT 'arc',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_network_status_idx" ON "public"."Invoice"("network" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Invoice_recipientAddress_idx" ON "public"."Invoice"("recipientAddress" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_txHash_key" ON "public"."Invoice"("txHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_address_key" ON "public"."Subscription"("address" ASC);
