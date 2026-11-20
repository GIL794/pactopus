-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerAddress" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "InvoiceUsage" (
    "id" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL,
    "invoicesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceUsage_ownerAddress_network_idx" ON "InvoiceUsage"("ownerAddress", "network");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceUsage_ownerAddress_network_billingMonth_key" ON "InvoiceUsage"("ownerAddress", "network", "billingMonth");

-- CreateIndex
CREATE INDEX "Invoice_ownerAddress_network_status_idx" ON "Invoice"("ownerAddress", "network", "status");
