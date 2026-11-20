/* eslint-disable @typescript-eslint/no-require-imports */
// Unit tests for Solana + Solana Seeker fee caps (0.5% max £50 vs 0.25% max £5),
// native Ed25519 signature verification, reference key derivation, and 6-state settlement verification.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');

const {
  encodeBase58,
  decodeBase58,
  isValidSolanaAddress,
  verifySolanaEd25519Signature,
  createSolanaTestKeypair,
  splitSolanaAmount,
  unitsToDecimalString,
  deriveInvoiceReferencePubkey,
  buildPactopusMemo,
  verifySolanaAtomicSettlement,
} = require('../lib/solana.ts');

const {
  computeCappedInvoiceFeeGbp,
  getFeeBpsForTier,
  getMaxCapGbpForTier,
  SUBSCRIPTION_LIMITS,
} = require('../lib/billing.ts');

describe('Solana Seeker & Web Fee-Cap Engine (0.25% Max £5 vs 0.50% Max £50)', () => {
  test('Unlimited £0/mo invoices across all tiers', () => {
    assert.equal(SUBSCRIPTION_LIMITS.free, 1_000_000);
    assert.equal(getFeeBpsForTier('free', false), 50);
    assert.equal(getFeeBpsForTier('free', true), 25);
    assert.equal(getMaxCapGbpForTier('free', false), 50);
    assert.equal(getMaxCapGbpForTier('free', true), 5);
  });

  test('Standard Web Mode (0.5% / 50 bps) applies 0.5% below cap and caps at £50 max', () => {
    // Small invoice: 1,000 USDC at 0.79 GBP/USD = £790 GBP -> 0.5% = 5.00 USDC (£3.95 GBP < £50 cap)
    const small = splitSolanaAmount('1000.00', {
      isSeekerVerified: false,
      currency: 'USDC',
      gbpRate: 0.79,
    });
    assert.equal(small.feeBps, 50);
    assert.equal(small.maxCapGbp, 50);
    assert.equal(small.capApplied, false);
    assert.equal(small.isCapped, false);
    assert.equal(unitsToDecimalString(small.fee), '5.00');
    assert.equal(unitsToDecimalString(small.net), '995.00');
    assert.equal(small.gbpFeeFormatted, '3.95');

    // Large invoice: 20,000 USDC at 0.80 GBP/USD = £16,000 GBP -> uncapped 0.5% would be £80 (100 USDC),
    // but hard cap is £50 GBP = 62.50 USDC
    const large = splitSolanaAmount('20000.00', {
      isSeekerVerified: false,
      currency: 'USDC',
      gbpRate: 0.80,
    });
    assert.equal(large.feeBps, 50);
    assert.equal(large.maxCapGbp, 50);
    assert.equal(large.capApplied, true);
    assert.equal(large.isCapped, true);
    assert.equal(unitsToDecimalString(large.fee), '62.50');
    assert.equal(unitsToDecimalString(large.net), '19937.50');
    assert.equal(large.gbpFeeFormatted, '50.00');
  });

  test('Verified Solana Seeker Mode (0.25% / 25 bps) applies 0.25% below cap and caps at £5 max', () => {
    // Small invoice: 1,000 USDC at 0.80 GBP/USD = £800 GBP -> 0.25% = 2.50 USDC (£2.00 GBP < £5 cap)
    const small = splitSolanaAmount('1000.00', {
      isSeekerVerified: true,
      currency: 'USDC',
      gbpRate: 0.80,
    });
    assert.equal(small.feeBps, 25);
    assert.equal(small.maxCapGbp, 5);
    assert.equal(small.capApplied, false);
    assert.equal(small.isCapped, false);
    assert.equal(unitsToDecimalString(small.fee), '2.50');
    assert.equal(unitsToDecimalString(small.net), '997.50');
    assert.equal(small.gbpFeeFormatted, '2.00');

    // Large invoice: 10,000 USDC at 0.80 GBP/USD = £8,000 GBP -> uncapped 0.25% would be £20 (25 USDC),
    // but Seeker hard cap is £5 GBP = 6.25 USDC
    const large = splitSolanaAmount('10000.00', {
      isSeekerVerified: true,
      currency: 'USDC',
      gbpRate: 0.80,
    });
    assert.equal(large.feeBps, 25);
    assert.equal(large.maxCapGbp, 5);
    assert.equal(large.capApplied, true);
    assert.equal(large.isCapped, true);
    assert.equal(unitsToDecimalString(large.fee), '6.25');
    assert.equal(unitsToDecimalString(large.net), '9993.75');
    assert.equal(large.gbpFeeFormatted, '5.00');
  });

  test('computeCappedInvoiceFeeGbp enforces £5 Seeker cap and £50 Web cap', () => {
    const seekerCap = computeCappedInvoiceFeeGbp(8000, true);
    assert.equal(seekerCap.feeGbp, 5.0);
    assert.equal(seekerCap.capApplied, true);
    assert.equal(seekerCap.feeBps, 25);

    const webCap = computeCappedInvoiceFeeGbp(15000, false);
    assert.equal(webCap.feeGbp, 50.0);
    assert.equal(webCap.capApplied, true);
    assert.equal(webCap.feeBps, 50);
  });
});

describe('Solana Base58, Native Ed25519 Verification & Reference Key Derivation', () => {
  test('Base58 roundtrip and Solana address validation', () => {
    const validAddr = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    assert.equal(isValidSolanaAddress(validAddr), true);
    const decoded = decodeBase58(validAddr);
    assert.equal(decoded.length, 32);
    assert.equal(encodeBase58(decoded), validAddr);
    assert.equal(isValidSolanaAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'), false);
  });

  test('verifySolanaEd25519Signature verifies genuine Ed25519 signature and rejects tampering', () => {
    const kp = createSolanaTestKeypair();
    const message = 'Pactopus Authentication\nWallet: ' + kp.publicKeyBase58 + '\nNonce: test-uuid-1234';
    const sigBase64 = kp.signMessageBase64(message);
    const sigBase58 = kp.signMessageBase58(message);

    assert.equal(verifySolanaEd25519Signature(kp.publicKeyBase58, message, sigBase64), true);
    assert.equal(verifySolanaEd25519Signature(kp.publicKeyBase58, message, sigBase58), true);
    assert.equal(verifySolanaEd25519Signature(kp.publicKeyBase58, message + 'x', sigBase64), false);
  });

  test('deriveInvoiceReferencePubkey is deterministic and valid 32-byte Base58 pubkey', () => {
    const ref1 = deriveInvoiceReferencePubkey('sol-seeker-001');
    const ref2 = deriveInvoiceReferencePubkey('sol-seeker-001');
    const ref3 = deriveInvoiceReferencePubkey('sol-seeker-002');
    assert.equal(ref1, ref2);
    assert.notEqual(ref1, ref3);
    assert.equal(isValidSolanaAddress(ref1), true);
  });
});

describe('6-State Solana Atomic SPL Settlement Verifier', () => {
  test('verifySolanaAtomicSettlement transitions to accounted when net, capped fee, memo, and reference match', () => {
    const payer = '5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8';
    const recipient = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    const platform = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
    const mint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    const reference = deriveInvoiceReferencePubkey('sol-seeker-test');
    const memo = buildPactopusMemo('sol-seeker-test', 'seeker');
    const kp = createSolanaTestKeypair();
    const validSignature = kp.signMessageBase58('sample-solana-transaction-payload');

    // 4,500 USDC on Seeker (0.25% capped at £5 @ 0.80 GBP/USD => fee = 6.25 USDC = 6250000 units, net = 4493750000 units)
    const split = splitSolanaAmount('4500.00', { isSeekerVerified: true, currency: 'USDC', gbpRate: 0.80 });

    const verification = verifySolanaAtomicSettlement({
      tx: {
        signature: validSignature,
        err: null,
        signers: [payer],
        accountKeys: [payer, recipient, platform, reference],
        preTokenBalances: [
          { owner: payer, mint, amountRaw: split.total + BigInt(10_000_000) },
          { owner: recipient, mint, amountRaw: BigInt(1_000_000) },
          { owner: platform, mint, amountRaw: BigInt(0) },
        ],
        postTokenBalances: [
          { owner: payer, mint, amountRaw: BigInt(10_000_000) },
          { owner: recipient, mint, amountRaw: BigInt(1_000_000) + split.net },
          { owner: platform, mint, amountRaw: split.fee },
        ],
        memo,
      },
      expectedMint: mint,
      payer,
      recipient,
      platform,
      expectedNet: split.net,
      expectedFee: split.fee,
      expectedMemo: memo,
      expectedReference: reference,
    });

    assert.equal(verification.ok, true);
    assert.equal(verification.lifecycleState, 'accounted');
  });
});
