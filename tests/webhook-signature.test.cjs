/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const { computeHmacHex, verifyHmacSignature, authorizeWebhook, isMockApprovalAllowed } = require('../lib/webhook-signature.ts');
const { parseSettlementWebhook } = require('../lib/circle-checkout.ts');
const body = '{"a":1}';
const sig = computeHmacHex('s3cret', body);
test('valid signature passes, with or without sha256= prefix', () => {
  assert.equal(verifyHmacSignature('s3cret', body, sig), true);
  assert.equal(verifyHmacSignature('s3cret', body, 'sha256=' + sig), true);
});
test('missing header, wrong secret, tampered body, malformed value all fail', () => {
  assert.equal(verifyHmacSignature('s3cret', body, null), false);
  assert.equal(verifyHmacSignature('other', body, sig), false);
  assert.equal(verifyHmacSignature('s3cret', body + ' ', sig), false);
  assert.equal(verifyHmacSignature('s3cret', body, 'zz'), false);
  assert.equal(verifyHmacSignature('', body, sig), false);
});
test('secret set + header omitted is rejected (no fail-open)', () => {
  const d = authorizeWebhook({ secret: 's3cret', header: null, rawBody: body, nodeEnv: 'production' });
  assert.deepEqual(d, { ok: false, status: 401, error: 'Invalid or missing webhook signature.' });
});
test('no secret: production rejected, development allowed', () => {
  assert.equal(authorizeWebhook({ secret: undefined, header: null, rawBody: body, nodeEnv: 'production' }).ok, false);
  assert.equal(authorizeWebhook({ secret: undefined, header: null, rawBody: body, nodeEnv: 'development' }).ok, true);
});
test('mock approval is never allowed in production', () => {
  process.env.PACTOPUS_FORCE_CIRCLE_MOCK = '1';
  assert.equal(isMockApprovalAllowed('production'), false);
  assert.equal(isMockApprovalAllowed('development'), true);
});
test('webhook payload with unknown tier or no amount is rejected', () => {
  const w = '0x' + 'a'.repeat(40);
  assert.equal(parseSettlementWebhook({ type: 'checkout.session.completed', data: { id: 's' }, metadata: { wallet: w, tier: 'enterprise' } }), null);
  const ok = parseSettlementWebhook({ type: 'checkout.session.completed', data: { id: 's', amount: { amount: '15' } }, metadata: { wallet: w, tier: 'pro' } });
  assert.equal(ok.tier, 'pro'); assert.equal(ok.amountUsd, 15);
  const none = parseSettlementWebhook({ type: 'checkout.session.completed', data: { id: 's' }, metadata: { wallet: w, tier: 'pro' } });
  assert.notEqual(none.amountUsd, 15);
});
