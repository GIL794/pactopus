/* eslint-disable @typescript-eslint/no-require-imports */
// Source-level regression guards (the modal needs a browser wallet to run end to end).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync(require.resolve('../components/SubscriptionModal.tsx'), 'utf8');
test('no placeholder treasury address or fabricated tx id', () => {
  assert.doesNotMatch(src, /P2R5H7P7/);
  assert.doesNotMatch(src, /algo-tx-/);
  assert.doesNotMatch(src, /Math\.random/);
});
test('/api/pay call carries signed auth headers', () => {
  assert.match(src, /sign\(\{ method: 'POST', pathname: '\/api\/pay', body \}\)/);
  assert.match(src, /\.\.\.authHeaders/);
});
test('Algorand upgrade is refused before any wallet prompt', () => {
  const start = src.indexOf("if (network === 'algorand') {");
  const algoBranch = src.slice(start, src.indexOf('if (isWrongNetwork)', start));
  assert.match(algoBranch, /throw new Error/);
  assert.doesNotMatch(algoBranch, /signTxns/);
});
