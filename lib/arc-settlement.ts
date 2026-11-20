/**
 * Pure helpers for verifying Arc (EVM) ERC-20 settlement receipts.
 * No network access here: the route fetches receipts and passes plain objects in.
 */
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const PLATFORM_FEE_BPS_ARC = BigInt(50);

export interface ReceiptLog { address: string; topics: readonly string[]; data: string }
export interface ReceiptLike { status: number | null; logs: readonly ReceiptLog[] }

/** Strict decimal to 6-decimal base units. Same integer math the pay page uses. */
export function decimalToUnits(amount: string, decimals = 6): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)) throw new Error('Invalid amount');
  const [whole, frac = ''] = amount.split('.');
  if (frac.length > decimals) throw new Error('Too many decimal places');
  return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** Format 6-decimal base units into a clean decimal string (always at least 2 decimal places, up to 6 non-zero decimals). */
export function unitsToDecimalString(units: bigint, decimals = 6): string {
  const neg = units < BigInt(0);
  const abs = neg ? -units : units;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = abs / base;
  const rem = (abs % base).toString().padStart(decimals, '0');
  const trimmed = rem.replace(/0+$/, '').padEnd(2, '0');
  return `${neg ? '-' : ''}${whole.toString()}.${trimmed}`;
}

/** fee = floor(total * feeBps / 10000), net = total - fee. Matches the client exactly. */
export function splitAmount(amount: string, feeBps: number | bigint = PLATFORM_FEE_BPS_ARC): { total: bigint; fee: bigint; net: bigint } {
  const total = decimalToUnits(amount);
  if (total <= BigInt(0)) throw new Error('Amount must be positive');
  const bps = typeof feeBps === 'bigint' ? feeBps : BigInt(feeBps);
  const fee = (total * bps) / BigInt(10000);
  return { total, fee, net: total - fee };
}

export function isTxHash(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
}

function topicAddress(topic: string | undefined): string {
  return topic && topic.length === 66 ? '0x' + topic.slice(26).toLowerCase() : '';
}

/** True if the receipt succeeded and holds a Transfer(from -> to) of at least `min` on `asset`. */
export function receiptHasTransfer(r: ReceiptLike | null | undefined, asset: string, from: string, to: string, min: bigint): boolean {
  if (!r || r.status !== 1) return false;
  return r.logs.some((log) =>
    log.address.toLowerCase() === asset.toLowerCase() &&
    log.topics[0] === TRANSFER_TOPIC &&
    topicAddress(log.topics[1]) === from.toLowerCase() &&
    topicAddress(log.topics[2]) === to.toLowerCase() &&
    /^0x[0-9a-fA-F]+$/.test(log.data) && BigInt(log.data) >= min
  );
}

export interface InvoiceSettlementInput {
  payout: ReceiptLike | null | undefined;
  fee: ReceiptLike | null | undefined;
  payoutTxHash: string;
  feeTxHash: string | undefined;
  asset: string; recipient: string; platform: string; payer: string;
  net: bigint; feeUnits: bigint;
}

/**
 * Invoice settlement: payout leg paid BY the authenticated payer to the recipient, and
 * (when a fee is due) a separate fee leg from the same payer to the platform wallet.
 * A missing fee hash is never accepted when a fee is due; both hashes must differ.
 */
export function verifyInvoiceSettlement(i: InvoiceSettlementInput): boolean {
  if (!isTxHash(i.payoutTxHash)) return false;
  if (!receiptHasTransfer(i.payout, i.asset, i.payer, i.recipient, i.net)) return false;
  if (i.feeUnits === BigInt(0)) return true;
  if (!isTxHash(i.feeTxHash) || i.feeTxHash.toLowerCase() === i.payoutTxHash.toLowerCase()) return false;
  return receiptHasTransfer(i.fee, i.asset, i.payer, i.platform, i.feeUnits);
}
