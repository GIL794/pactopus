/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
test('.env.example documents the variables the app requires', () => {
  for (const name of ['NEXT_PUBLIC_USDC_ADDRESS', 'NEXT_PUBLIC_PLATFORM_WALLET', 'DATABASE_URL', 'DIRECT_DATABASE_URL', 'CIRCLE_WEBHOOK_SIGNING_SECRET', 'NEXT_PUBLIC_ALGO_PLATFORM_WALLET']) {
    assert.match(example, new RegExp('^' + name + '=', 'm'), name);
  }
});
test('.env.example contains no real-looking secrets', () => {
  assert.doesNotMatch(example, /0x[0-9a-fA-F]{64}/);
  assert.doesNotMatch(example, /postgres(ql)?:\/\/\S+@/);
});
test('README does not point at docs that are not in the repo', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const m of readme.matchAll(/`((?:docs|design-system)\/[^`]+)`/g)) assert.ok(fs.existsSync(path.join(root, m[1])), m[1]);
});
