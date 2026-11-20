-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ConsumedReceipt" (
    "txHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedReceipt_pkey" PRIMARY KEY ("txHash")
);
