/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const { normalizeInvoiceAmount: n } = require('../lib/amount.ts');
test('keeps Algorand six-decimal amounts', () => {
  assert.equal(n('0.002'), '0.002');
  assert.equal(n('0.000001'), '0.000001');
  assert.equal(n('12.345678'), '12.345678');
});
test('pads to two decimals and trims trailing zeros', () => {
  assert.equal(n('100'), '100.00');
  assert.equal(n('1.5'), '1.50');
  assert.equal(n('1.500000'), '1.50');
  assert.equal(n('007.5'), '7.50');
});
test('rejects zero, negative, junk and over-precision', () => {
  for (const bad of ['0', '0.00', '-1', 'abc', '1e3', '', '1.1234567', '1,5']) assert.throws(() => n(bad), bad);
});
