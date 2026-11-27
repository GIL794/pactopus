/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const { computeProgress } = require('../lib/progress.ts');

test('empty account earns nothing and the next step is the first settled invoice', () => {
  const p = computeProgress({});
  assert.equal(p.earnedCount, 0);
  assert.deepEqual(p.next, { label: 'First invoice settled', remaining: 1 });
});
test('created but unpaid earns only the creation badge', () => {
  const p = computeProgress({ totalInvoices: 3, paidInvoices: 0 });
  assert.equal(p.earnedCount, 1);
});
test('5 paid earns first and five, next is 25 with 20 remaining', () => {
  const p = computeProgress({ totalInvoices: 9, paidInvoices: 5 });
  assert.equal(p.earnedCount, 3);
  assert.deepEqual(p.next, { label: '25 invoices settled', remaining: 20 });
});
test('garbage input is treated as zero; all earned has no next step', () => {
  assert.equal(computeProgress({ totalInvoices: NaN, paidInvoices: -4 }).earnedCount, 0);
  assert.equal(computeProgress({ totalInvoices: 30, paidInvoices: 26 }).next, null);
});
