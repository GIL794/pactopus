import { z } from 'zod';

const USDC_DECIMALS = 6;
const EURC_DECIMALS = 6;

export const CurrencyZ = z.enum(['USDC', 'EURC']);
export const NetworkIdZ = z.enum(['arc', 'algorand']);
export const InvoiceStatusZ = z.enum(['pending', 'paid', 'expired']);
export const SubscriptionTierZ = z.enum(['free', 'pro', 'business']);

export const EvmAddressZ = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM/Arc address must be 0x + 40 hex chars');

export const AlgorandAddressZ = z
  .string()
  .regex(/^[A-Z2-7]{58}$/, 'Invalid Algorand 58-char base32 address');

export const AnyOnChainAddressZ = z.union([EvmAddressZ, AlgorandAddressZ]);

const TxHashHexZ = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid 0x-prefixed 32-byte transaction hash');

const PositiveDecimalAmountZ = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'Amount must be a decimal string with up to 18 fractional digits');

const RecipientNameZ = z.string().max(80).trim().optional().or(z.literal(''));
const DescriptionZ = z.string().max(500).trim().optional().or(z.literal(''));

export const CreateInvoiceRequestZ = z
  .object({
    amount: PositiveDecimalAmountZ,
    currency: CurrencyZ,
    description: DescriptionZ,
    recipientAddress: AnyOnChainAddressZ,
    recipientName: RecipientNameZ,
    network: NetworkIdZ.optional().default('arc'),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    txHash: TxHashHexZ.optional(),
  })
  .strict();

export const AgentInvoiceCreateWithPaymentZ = z
  .object({
    amount: PositiveDecimalAmountZ,
    currency: CurrencyZ,
    description: DescriptionZ,
    recipientAddress: AnyOnChainAddressZ,
    recipientName: RecipientNameZ,
    txHash: TxHashHexZ.optional(),
  })
  .strict();

export const AgentPaymasterSponsorZ = z
  .object({
    sender: EvmAddressZ,
    nonce: z.coerce.bigint(),
    callData: z.string().regex(/^0x[a-fA-F0-9]*$/),
    callGasLimit: z.coerce.bigint().min(BigInt('21000')),
    description: z.string().max(200).trim().optional(),
  })
  .strict();

export const GetDashboardStatsParamsZ = z
  .object({
    network: NetworkIdZ.optional(),
    ownerAddress: z.string().trim().min(1),
  });

export const MarkInvoicePaidParamsZ = z.object({
  id: z.string().min(1),
  txHash: TxHashHexZ,
  paidBy: AnyOnChainAddressZ,
  fee: PositiveDecimalAmountZ,
  feeTxHash: TxHashHexZ.optional(),
});

export const IsTxHashUsedParamsZ = z.object({
  txHash: TxHashHexZ,
  excludeInvoiceId: z.string().min(1).optional(),
});

export const UpgradeRequestZ = z
  .object({
    tier: z.enum(['pro', 'business']),
    successUrl: z.string().url().max(500),
    cancelUrl: z.string().url().max(500),
  })
  .strict();

export function safeParse<T>(schema: z.ZodType<T>, input: unknown): {
  success: true; data: T;
} | {
  success: false;
  issues: Array<{ path: string; message: string }>;
} {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    issues: result.error.issues.map((iss) => ({
      path: iss.path.join('.') || '(root)',
      message: iss.message,
    })),
  };
}

export { USDC_DECIMALS, EURC_DECIMALS };
