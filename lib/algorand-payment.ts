import algosdk from 'algosdk';
import { ACTIVE_ALGO_NETWORK, ALGO_PLATFORM_WALLET } from './algo';

export function algoAmountUnits(amount: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount)) throw new Error('Invalid asset amount');
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, '0'));
}

export interface IndexedAlgoTransfer {
  id: string;
  sender: string;
  confirmedRound?: bigint | number;
  group?: Uint8Array;
  assetTransferTransaction?: {
    assetId: bigint | number;
    receiver: string;
    amount: bigint | number;
    sender?: string;
    closeTo?: string;
    closeAmount?: bigint | number;
  };
}

export function verifyAlgoGroup(
  payout: IndexedAlgoTransfer,
  group: IndexedAlgoTransfer[],
  feeTxId: string,
  expected: { payer: string; recipient: string; assetId: number; amount: string }
): boolean {
  if (!payout.group || payout.group.length !== 32 || !payout.confirmedRound || BigInt(payout.confirmedRound) <= BigInt(0)) return false;
  if (!algosdk.isValidAddress(expected.payer) || !algosdk.isValidAddress(expected.recipient) || !algosdk.isValidAddress(ALGO_PLATFORM_WALLET)) return false;
  const amount = algoAmountUnits(expected.amount);
  if (amount <= BigInt(0)) return false;
  const fee = amount * BigInt(50) / BigInt(10000);
  if (fee <= BigInt(0) || group.length !== 2 || payout.id === feeTxId) return false;
  const sameGroup = group.every(tx =>
    tx.group && Buffer.from(tx.group).equals(Buffer.from(payout.group!)) &&
    tx.confirmedRound && BigInt(tx.confirmedRound) === BigInt(payout.confirmedRound!) &&
    tx.sender === expected.payer && !tx.assetTransferTransaction?.sender && !tx.assetTransferTransaction?.closeTo && !tx.assetTransferTransaction?.closeAmount
  );
  if (!sameGroup || new Set(group.map(tx => tx.id)).size !== 2) return false;
  const feeTx = group.find(tx => tx.id === feeTxId);
  if (!feeTx || !group.some(tx => tx.id === payout.id)) return false;
  const matches = (tx: IndexedAlgoTransfer, receiver: string, raw: bigint) =>
    tx.assetTransferTransaction &&
    BigInt(tx.assetTransferTransaction.assetId) === BigInt(expected.assetId) &&
    tx.assetTransferTransaction.receiver === receiver &&
    BigInt(tx.assetTransferTransaction.amount) === raw;
  return Boolean(matches(payout, expected.recipient, amount - fee) && matches(feeTx, ALGO_PLATFORM_WALLET, fee));
}

export async function verifyAlgorandPaymentGroup(
  payoutId: string, feeId: string, expected: { payer: string; recipient: string; assetId: number; amount: string }
): Promise<boolean> {
  const indexer = new algosdk.Indexer('', ACTIVE_ALGO_NETWORK.indexerUrl, '');
  // Indexers can trail algod confirmation by seconds. Retry only reads; never
  // resend a transaction in order to work around an indexing delay.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { transaction } = await indexer.lookupTransactionByID(payoutId).do();
      if (!transaction?.group || !transaction.confirmedRound) return false;
      const { transactions } = await indexer.searchForTransactions().groupid(transaction.group).round(transaction.confirmedRound).limit(3).do();
      if (transaction.id && transactions?.every(tx => tx.id) && transactions.length === 2) {
        return verifyAlgoGroup(transaction as IndexedAlgoTransfer, transactions as IndexedAlgoTransfer[], feeId, expected);
      }
    } catch { /* wait for indexer to observe the confirmed group */ }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return false;
}
