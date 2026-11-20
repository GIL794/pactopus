/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const { createReceiptClaimer, createMemoryClaimStore } = require('../lib/receipt-claims.ts');
const H = '0x' + 'AB'.repeat(32);
test('first claim wins, replay (any hash casing) is refused', async () => {
  const c = createReceiptClaimer(createMemoryClaimStore());
  assert.equal(await c.claim(H, 'x'), true);
  assert.equal(await c.claim(H, 'x'), false);
  assert.equal(await c.claim(H.toLowerCase(), 'x'), false);
});
test('concurrent claims: exactly one succeeds', async () => {
  const c = createReceiptClaimer(createMemoryClaimStore());
  const r = await Promise.all(Array.from({ length: 10 }, () => c.claim(H, 'x')));
  assert.equal(r.filter(Boolean).length, 1);
});
test('release lets the payer retry after a failed creation', async () => {
  const c = createReceiptClaimer(createMemoryClaimStore());
  await c.claim(H, 'x'); await c.release(H);
  assert.equal(await c.claim(H, 'x'), true);
});
