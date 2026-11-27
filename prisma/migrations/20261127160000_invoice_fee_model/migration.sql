-- Adds the fee model to each invoice. Existing rows keep the model they were created under ('deduct-v1').
-- New invoices are written as 'payer-additive-v2' by the application.
ALTER TABLE "Invoice" ADD COLUMN "feeModel" TEXT NOT NULL DEFAULT 'deduct-v1';
