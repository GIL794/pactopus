/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('./helpers/ts-loader.cjs');
const { ethers } = require('ethers');
const { sha256Hex } = require('../lib/sha256.ts');
const { consumeNonce, createMemoryNonceStore, NONCE_FORMAT } = require('../lib/evm-nonce.ts');
const { AUTH_HEADERS, stableHash, buildSigningText, buildSignedHeaders, verifyOwnerSignature } = require('../lib/auth.ts');

test('sha256 matches node:crypto on edge-length inputs and unicode', () => {
  for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), '{"amount":"1.00","note":"café €"}']) {
    assert.equal(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), s.slice(0, 10));
  }
});
test('body hash is a 64-char SHA-256, not a 32-bit checksum', () => assert.match(stableHash('x'), /^[0-9a-f]{64}$/));
test('nonce format and one-time consumption', async () => {
  const n = `${Date.now()}:${crypto.randomUUID()}`;
  assert.match(n, NONCE_FORMAT);
  assert.doesNotMatch(String(Date.now()), NONCE_FORMAT);
  const store = createMemoryNonceStore();
  assert.equal(await consumeNonce(store, '0xABC', n, 300000), true);
  assert.equal(await consumeNonce(store, '0xabc', n, 300000), false);
});

const wallet = ethers.Wallet.createRandom();
const body = { amount: '2.00' };
async function req(over = {}, b = body, pathname = '/api/invoices') {
  const headers = await buildSignedHeaders({ wallet: wallet.address.toLowerCase(), signMessage: (m) => wallet.signMessage(m), method: 'POST', pathname, body: b });
  const values = { ...headers, ...over };
  return { headers: { get: (k) => values[k] ?? null }, method: 'POST', nextUrl: { pathname } };
}
test('genuine signed EVM request verifies', async () => {
  const r = await verifyOwnerSignature(await req(), body);
  assert.equal(r.success, true);
  assert.equal(r.wallet, wallet.address.toLowerCase());
});
test('legacy timestamp-only nonce is rejected', async () => {
  const r = await verifyOwnerSignature(await req({ [AUTH_HEADERS.NONCE]: String(Date.now()) }), body);
  assert.equal(r.success, false);
});
test('tampered body, wrong path, missing body hash all fail', async () => {
  assert.equal((await verifyOwnerSignature(await req(), { amount: '3.00' })).success, false);
  const wrongPath = await req(); wrongPath.nextUrl.pathname = '/api/pay';
  assert.equal((await verifyOwnerSignature(wrongPath, body)).success, false);
  assert.equal((await verifyOwnerSignature(await req({ [AUTH_HEADERS.BODY_HASH]: undefined }), body)).success, false);
});
test('signing text includes full SHA-256', () => {
  assert.match(buildSigningText({ wallet: '0x1', nonce: `1:${crypto.randomUUID()}`, method: 'POST', pathname: '/x', bodyHash: stableHash('{}') }), /Body SHA: [0-9a-f]{64}/);
});
