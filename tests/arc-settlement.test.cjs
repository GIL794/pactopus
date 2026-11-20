/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const A = require('../lib/arc-settlement.ts');
const pad = (a) => '0x' + '0'.repeat(24) + a.slice(2).toLowerCase();
const hex = (n) => '0x' + n.toString(16).padStart(64, '0');
const asset = '0x' + '11'.repeat(20), payer = '0x' + 'aa'.repeat(20), other = '0x' + 'bb'.repeat(20);
const recipient = '0x' + 'cc'.repeat(20), platform = '0x' + 'dd'.repeat(20);
const h1 = '0x' + '1'.repeat(64), h2 = '0x' + '2'.repeat(64);
const rcpt = (from, to, v, status = 1) => ({ status, logs: [{ address: asset, topics: [A.TRANSFER_TOPIC, pad(from), pad(to)], data: hex(v) }] });
const base = (o = {}) => ({ payout: rcpt(payer, recipient, 995000n), fee: rcpt(payer, platform, 5000n), payoutTxHash: h1, feeTxHash: h2, asset, recipient, platform, payer, net: 995000n, feeUnits: 5000n, ...o });
test('split matches client integer math and handles $1', () => {
  assert.deepEqual(A.splitAmount('1'), { total: 1000000n, fee: 5000n, net: 995000n });
  assert.deepEqual(A.splitAmount('0.002'), { total: 2000n, fee: 10n, net: 1990n });
  assert.deepEqual(A.splitAmount('100.00'), { total: 100000000n, fee: 500000n, net: 99500000n });
  assert.throws(() => A.splitAmount('1.1234567'));
  assert.throws(() => A.splitAmount('abc'));
  assert.throws(() => A.splitAmount('0'));
});
test('valid two-leg payment passes', () => assert.equal(A.verifyInvoiceSettlement(base()), true));
test('missing fee hash is rejected when a fee is due', () => assert.equal(A.verifyInvoiceSettlement(base({ feeTxHash: undefined })), false));
test('fee hash equal to payout hash is rejected', () => assert.equal(A.verifyInvoiceSettlement(base({ feeTxHash: h1 })), false));
test('transfer from someone other than the authenticated payer is rejected', () => {
  assert.equal(A.verifyInvoiceSettlement(base({ payout: rcpt(other, recipient, 995000n) })), false);
  assert.equal(A.verifyInvoiceSettlement(base({ fee: rcpt(other, platform, 5000n) })), false);
});
test('underpayment, wrong recipient, failed tx, wrong asset all rejected', () => {
  assert.equal(A.verifyInvoiceSettlement(base({ payout: rcpt(payer, recipient, 994999n) })), false);
  assert.equal(A.verifyInvoiceSettlement(base({ payout: rcpt(payer, other, 995000n) })), false);
  assert.equal(A.verifyInvoiceSettlement(base({ payout: rcpt(payer, recipient, 995000n, 0) })), false);
  assert.equal(A.verifyInvoiceSettlement(base({ asset: '0x' + '22'.repeat(20) })), false);
  assert.equal(A.verifyInvoiceSettlement(base({ payout: null })), false);
});
test('malformed tx hash rejected', () => assert.equal(A.verifyInvoiceSettlement(base({ payoutTxHash: '0x12' })), false));
test('zero-fee amount needs no fee leg', () => assert.equal(A.verifyInvoiceSettlement(base({ feeUnits: 0n, feeTxHash: undefined, fee: null })), true));
