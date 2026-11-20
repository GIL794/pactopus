import { z } from 'zod';
import { ethers } from 'ethers';
import { CONTRACTS, PLATFORM_WALLET, parseTokenAmount, PLATFORM_FEE_BPS } from './arc';
import { createCircleSigner, sendERC20Transfer, signMessageWithCircleSigner } from '@/lib/circle-wallet-kit';
import { createSponsoredERC20Transfer } from '@/lib/paymaster-kit';
import { buildSignedHeaders } from '@/lib/auth';

interface CreateInvoiceArgs {
  amount: string;
  currency: 'USDC' | 'EURC';
  description: string;
  recipientAddress: string;
  recipientName?: string;
  agentPrivateKey: string;
  apiBaseUrl?: string;
}

interface PayInvoiceArgs {
  invoiceId: string;
  agentPrivateKey: string;
  apiBaseUrl?: string;
}

export const pactopusAgentTools = {
  createInvoiceTool: {
    description: 'Creates a stablecoin invoice request on Pactopus, paying the HTTP 402 fee autonomously on Arc L1.',
    parameters: z.object({
      amount: z.string().describe('The invoice amount (e.g. "250.00")'),
      currency: z.enum(['USDC', 'EURC']).describe('Token currency type'),
      description: z.string().describe('Description of the work done'),
      recipientAddress: z.string().describe('Wallet address to receive funds'),
      recipientName: z.string().optional().describe('Payee name'),
      agentPrivateKey: z.string().describe('Private key of the agent wallet to sign nanopayments'),
      apiBaseUrl: z.string().optional().default('http://localhost:3000').describe('Pactopus API base URL'),
    }),
    execute: async ({ amount, currency, description, recipientAddress, recipientName, agentPrivateKey, apiBaseUrl = 'http://localhost:3000' }: CreateInvoiceArgs) => {
      try {
        const payload = { amount, currency, description, recipientAddress, recipientName };

        const res = await fetch(`${apiBaseUrl}/api/agent/invoice-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 402) {
          const payDetails = await res.json();
          const target = payDetails.paymentTarget || PLATFORM_WALLET;
          const assetAddress = payDetails.paymentAsset || CONTRACTS.USDC;
          const payAmount = payDetails.paymentAmount || '0.05';

          console.log(`[Pactopus Agent] HTTP 402 Received. Paying ${payAmount} USDC nanopayment on Arc to ${target}...`);

          const signer = await createCircleSigner({ privateKey: agentPrivateKey, blockchain: 'ARC-TESTNET' });
          const rawAmount = parseTokenAmount(payAmount, 6);

          console.log(`[Pactopus Agent] Recording paymaster sponsorship for nanopayment...`);
          // Omit senderPrivateKey here so createSponsoredERC20Transfer only records sponsorship
          // while sendERC20Transfer executes the single on-chain transfer (preventing double transfer).
          const sponsoredOp = await createSponsoredERC20Transfer({
            from: signer.address,
            tokenAddress: assetAddress,
            to: target,
            amountRaw: rawAmount,
          });
          console.log(`[Pactopus Agent] Paymaster sponsorship recorded. Sponsor hash: ${sponsoredOp.sponsorship?.sponsorshipHash || 'recorded'}`);

          console.log(`[Pactopus Agent] Executing ERC-20 nanopayment transfer via Circle wallet kit...`);
          const tx = await sendERC20Transfer(signer, assetAddress, target, rawAmount);
          console.log(`[Pactopus Agent] Nanopayment transaction submitted: ${tx.hash}`);

          await tx.wait();
          console.log(`[Pactopus Agent] Nanopayment transaction confirmed.`);

          const retryRes = await fetch(`${apiBaseUrl}/api/agent/invoice-create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              txHash: tx.hash,
            }),
          });

          if (!retryRes.ok) {
            const errorData = await retryRes.json();
            throw new Error(errorData.message || 'Nanopayment retry verification failed');
          }

          const retryData = await retryRes.json();
          return {
            status: 'success',
            invoice: retryData.invoice,
            txHash: tx.hash,
            message: 'Invoice created successfully after verifying Arc L1 nanopayment.',
          };
        }

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to create invoice');
        }

        const data = await res.json();
        return {
          status: 'success',
          invoice: data.invoice,
          message: 'Invoice created successfully without required payment.',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          status: 'failed',
          error: errorMsg || 'Invoice creation failed',
        };
      }
    },
  },

  payInvoiceTool: {
    description: 'Pays a Pactopus invoice autonomously, routing both recipient payout and platform fee on-chain.',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to pay'),
      agentPrivateKey: z.string().describe('Private key of the payer agent wallet'),
      apiBaseUrl: z.string().optional().default('http://localhost:3000').describe('Pactopus API base URL'),
    }),
    execute: async ({ invoiceId, agentPrivateKey, apiBaseUrl = 'http://localhost:3000' }: PayInvoiceArgs) => {
      try {
        const invoiceRes = await fetch(`${apiBaseUrl}/api/invoices/${invoiceId}`);
        if (!invoiceRes.ok) throw new Error('Invoice not found');
        const { invoice, feeBps } = await invoiceRes.json();

        if (invoice.status === 'paid') {
          return { status: 'success', message: 'Invoice was already paid.' };
        }

        const signer = await createCircleSigner({ privateKey: agentPrivateKey, blockchain: 'ARC-TESTNET' });
        const assetAddress = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;

        const effectiveBps = typeof feeBps === 'number' ? feeBps : PLATFORM_FEE_BPS;
        const rawAmount = parseTokenAmount(invoice.amount, 6);
        const feeRaw = (rawAmount * BigInt(effectiveBps)) / BigInt(10000);
        const netRaw = rawAmount - feeRaw;

        console.log(`[Pactopus Agent] Transferring net amount ${ethers.formatUnits(netRaw, 6)} ${invoice.currency} to payee...`);

        const sponsoredPayoutOp = await createSponsoredERC20Transfer({
          from: signer.address,
          tokenAddress: assetAddress,
          to: invoice.recipientAddress,
          amountRaw: netRaw,
        });
        console.log(`[Pactopus Agent] Payee payout paymaster sponsorship recorded: ${sponsoredPayoutOp.sponsorship?.sponsorshipHash}`);

        const payoutTx = await sendERC20Transfer(signer, assetAddress, invoice.recipientAddress, netRaw);
        console.log(`[Pactopus Agent] Payout Tx Hash: ${payoutTx.hash}`);

        console.log(`[Pactopus Agent] Transferring fee amount ${ethers.formatUnits(feeRaw, 6)} ${invoice.currency} to platform...`);

        const sponsoredFeeOp = await createSponsoredERC20Transfer({
          from: signer.address,
          tokenAddress: assetAddress,
          to: PLATFORM_WALLET,
          amountRaw: feeRaw,
        });
        console.log(`[Pactopus Agent] Platform fee paymaster sponsorship recorded: ${sponsoredFeeOp.sponsorship?.sponsorshipHash}`);

        const feeTx = await sendERC20Transfer(signer, assetAddress, PLATFORM_WALLET, feeRaw);
        console.log(`[Pactopus Agent] Fee Tx Hash: ${feeTx.hash}`);

        await payoutTx.wait();
        await feeTx.wait();

        const payBody = {
          invoiceId,
          txHash: payoutTx.hash,
          feeTxHash: feeTx.hash,
          payerAddress: signer.address,
        };
        const signedHeaders = await buildSignedHeaders({
          wallet: signer.address,
          signMessage: (msg: string) => signMessageWithCircleSigner(signer, msg, agentPrivateKey),
          method: 'POST',
          pathname: '/api/pay',
          body: payBody,
        });

        const confirmRes = await fetch(`${apiBaseUrl}/api/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...signedHeaders,
          },
          body: JSON.stringify(payBody),
        });

        if (!confirmRes.ok) {
          const confirmErr = await confirmRes.json();
          throw new Error(confirmErr.error || 'Server validation of invoice payment failed');
        }

        const confirmData = await confirmRes.json();
        return {
          status: 'success',
          txHash: payoutTx.hash,
          feeTxHash: feeTx.hash,
          invoice: confirmData.invoice,
          message: `Successfully paid invoice ${invoiceId} and distributed fee on-chain.`,
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          status: 'failed',
          error: errorMsg || 'Payment execution failed',
        };
      }
    },
  },
};
