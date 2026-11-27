/* eslint-disable @typescript-eslint/no-require-imports */
// Characterisation test, not a fix. It records CURRENT behaviour so a later change is deliberate.
// verifySeekerEligibilityServer only receives addresses (and a User-Agent). It has no signature
// input, so whoever calls it can name a holder's public address and be reported as eligible.
// The routes /api/solana-pay/[id], /api/actions/pay/[id] and /api/pay pass the request's payer address in.
// When the eligibility rule is settled (for example, discount fixed at invoice creation by a signed wallet),
// update this test to assert the new behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
require('./helpers/ts-loader.cjs');
const { verifySeekerEligibilityServer } = require('../lib/seeker.ts');

test('CURRENT: eligibility depends only on the address given; control of that address is proven by the caller (route), not here', async () => {
  const GROUP = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const rpc = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      if (rpc.method === 'getTokenAccountsByOwner') {
        return res.end(JSON.stringify({ result: { value: [{ account: { data: { parsed: { info: { mint: 'MintAaaa', tokenAmount: { amount: '1', decimals: 0 } } } } } }] } }));
      }
      res.end(JSON.stringify({ result: { value: { data: { parsed: { info: { extensions: [{ extension: 'tokenGroupMember', state: { group: GROUP } }] } } } } } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const result = await verifySeekerEligibilityServer({
      walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // a public address, no signature in this function
      userAgent: 'curl/8.0',
      rpcUrl: `http://127.0.0.1:${server.address().port}`,
    });
    assert.equal(result.verified, true);
  } finally {
    server.close();
  }
});
