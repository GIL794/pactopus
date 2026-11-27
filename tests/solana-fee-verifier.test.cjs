/* eslint-disable @typescript-eslint/no-require-imports */
// Regression tests for the on-chain verifier fee check, using a local mock RPC (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
require('./helpers/ts-loader.cjs');
const { verifySolanaPaymentOnChain } = require('../lib/solana-payment.ts');
const { ACTIVE_SOLANA_CLUSTER, SOLANA_PLATFORM_WALLET } = require('../lib/solana.ts');

const MINT = ACTIVE_SOLANA_CLUSTER.tokens.USDC.mint;
const PAYER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const RECIPIENT = 'So11111111111111111111111111111111111111112';
const SIG = '5'.repeat(88);

function tx(netUnits, feeUnits) {
  const bal = (owner, amount) => ({ accountIndex: 1, mint: MINT, owner, uiTokenAmount: { amount: String(amount), decimals: 6 } });
  const total = 1000n * 1000000n;
  return {
    meta: {
      err: null,
      preTokenBalances: [bal(PAYER, total), bal(RECIPIENT, 0), bal(SOLANA_PLATFORM_WALLET, 0)],
      postTokenBalances: [bal(PAYER, total - netUnits - feeUnits), bal(RECIPIENT, netUnits), bal(SOLANA_PLATFORM_WALLET, feeUnits)],
    },
    transaction: { message: { accountKeys: [{ pubkey: PAYER, signer: true }, { pubkey: RECIPIENT }, { pubkey: SOLANA_PLATFORM_WALLET }], instructions: [] } },
  };
}

async function verify(paid, isSeekerVerified) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result: paid }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await verifySolanaPaymentOnChain({
      signature: SIG, invoiceId: 'inv-test', payer: PAYER, recipient: RECIPIENT,
      currency: 'USDC', amount: '1000', isSeekerVerified, rpcUrl: `http://127.0.0.1:${server.address().port}`,
    });
  } finally { server.close(); }
}

const M = 1000000n;
test('standard invoice, standard fee (5.00 of 1000): verified', async () => {
  assert.equal((await verify(tx(995n * M, 5n * M), false)).verified, true);
});
test('seeker invoice, seeker fee (2.50 of 1000): verified', async () => {
  assert.equal((await verify(tx(997500000n, 2500000n), true)).verified, true);
});
test('seeker invoice, standard fee paid (legit fallback when eligibility flipped): verified', async () => {
  assert.equal((await verify(tx(995n * M, 5n * M), true)).verified, true);
});
test('standard invoice, Seeker-rate fee paid: must NOT verify', async () => {
  const r = await verify(tx(997500000n, 2500000n), false);
  assert.equal(r.verified, false);
});
test('standard invoice, zero fee: must NOT verify', async () => {
  assert.equal((await verify(tx(1000n * M, 0n), false)).verified, false);
});

// ---- payer-additive-v2: receiver gets the full amount, payer pays amount + fee, quote must match exactly ----
async function verifyV2(paid, isSeekerVerified) {
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result: paid })); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await verifySolanaPaymentOnChain({
      signature: SIG, invoiceId: 'inv-test', payer: PAYER, recipient: RECIPIENT, currency: 'USDC', amount: '1000',
      isSeekerVerified, feeModel: 'payer-additive-v2', rpcUrl: `http://127.0.0.1:${server.address().port}`,
    });
  } finally { server.close(); }
}
test('v2 standard: recipient 1000.00, fee 5.00: verified', async () => {
  assert.equal((await verifyV2(tx(1000n * M, 5n * M), false)).verified, true);
});
test('v2 seeker payer proven: recipient 1000.00, fee 2.50: verified', async () => {
  assert.equal((await verifyV2(tx(1000n * M, 2500000n), true)).verified, true);
});
test('v2 seeker not proven: fee 2.50 is REJECTED', async () => {
  const r = await verifyV2(tx(1000n * M, 2500000n), false);
  assert.equal(r.verified, false);
});
test('v2 old-style deduction (recipient 995, fee 5) is REJECTED', async () => {
  assert.equal((await verifyV2(tx(995n * M, 5n * M), false)).verified, false);
});
test('v2 overpaid fee (6.00) is a discrepancy, not accounted', async () => {
  const r = await verifyV2(tx(1000n * M, 6n * M), false);
  assert.equal(r.verified, false);
  assert.equal(r.state, 'discrepancy');
});
test('v2 overpaid recipient (1001.00) is a discrepancy', async () => {
  assert.equal((await verifyV2(tx(1001n * M, 5n * M), false)).verified, false);
});
test('v2 seeker proven but standard fee paid: exact standard quote accepted', async () => {
  assert.equal((await verifyV2(tx(1000n * M, 5n * M), true)).verified, true);
});
