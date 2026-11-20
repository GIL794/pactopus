import { prisma, isCloudDbEnabled } from '@/lib/db';
import { createMemoryClaimStore, createReceiptClaimer, type ClaimStore } from '@/lib/receipt-claims';

const dbStore: ClaimStore = {
  async insert(txHash, purpose) {
    try {
      await prisma!.consumedReceipt.create({ data: { txHash, purpose } });
      return true;
    } catch (err) {
      if (typeof err === 'object' && err && (err as { code?: string }).code === 'P2002') return false;
      throw err;
    }
  },
  async remove(txHash) {
    await prisma!.consumedReceipt.deleteMany({ where: { txHash } });
  },
};

export const receiptClaims = createReceiptClaimer(isCloudDbEnabled && prisma ? dbStore : createMemoryClaimStore());
