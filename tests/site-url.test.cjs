/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./helpers/ts-loader.cjs');
const { resolveSiteUrl, DEFAULT_SITE_URL } = require('../lib/site.ts');
test('defaults to the Vercel app and accepts an https override', () => {
  assert.equal(DEFAULT_SITE_URL, 'https://pactopus-app.vercel.app');
  assert.equal(resolveSiteUrl(undefined), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl('https://example.org/'), 'https://example.org');
  assert.equal(resolveSiteUrl('http://example.org'), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl('javascript:alert(1)'), DEFAULT_SITE_URL);
});
test('no source file points metadata at pactopus.com or carries invented ratings', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['app/layout.tsx', 'app/sitemap.ts', 'app/robots.ts', 'app/opengraph-image.tsx', 'components/PactopusCopilot.tsx']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(src, /pactopus\.com/, f);
    assert.doesNotMatch(src, /aggregateRating|ratingCount/, f);
  }
});
