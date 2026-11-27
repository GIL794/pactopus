/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const { splitSolanaAmount, normalizeFeeModel, DEFAULT_NEW_INVOICE_FEE_MODEL } = require('../lib/solana.ts');

const M = 1000000n;
test('missing or unknown model is deduct-v1; new invoices default to payer-additive-v2', () => {
  assert.equal(normalizeFeeModel(undefined), 'deduct-v1');
  assert.equal(normalizeFeeModel('anything'), 'deduct-v1');
  assert.equal(DEFAULT_NEW_INVOICE_FEE_MODEL, 'payer-additive-v2');
});
test('deduct-v1 unchanged: 1000 -> fee 5, net 995, payer pays 1000', () => {
  const s = splitSolanaAmount('1000', { feeModel: 'deduct-v1' });
  assert.equal(s.fee, 5n * M); assert.equal(s.net, 995n * M); assert.equal(s.payerTotal, 1000n * M);
});
test('v2 standard: 1000 -> recipient 1000, fee 5, payer pays 1005', () => {
  const s = splitSolanaAmount('1000', { feeModel: 'payer-additive-v2' });
  assert.equal(s.net, 1000n * M); assert.equal(s.fee, 5n * M); assert.equal(s.payerTotal, 1005n * M);
});
test('v2 seeker: 1000 -> fee 2.50, payer pays 1002.50', () => {
  const s = splitSolanaAmount('1000', { feeModel: 'payer-additive-v2', isSeekerVerified: true });
  assert.equal(s.fee, 2500000n); assert.equal(s.payerTotal, 1002500000n);
});
test('v2 caps: standard fee capped near GBP 50 and seeker near GBP 5 on large invoices', () => {
  const std = splitSolanaAmount('100000', { feeModel: 'payer-additive-v2' });
  const sk = splitSolanaAmount('100000', { feeModel: 'payer-additive-v2', isSeekerVerified: true });
  assert.equal(std.isCapped, true); assert.equal(sk.isCapped, true);
  assert.ok(std.fee > sk.fee);
  assert.equal(std.net, 100000n * M);
});
