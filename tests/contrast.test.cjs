/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('contrast audit has no failures for the Arc and Algorand light themes', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'contrast-audit.mjs')], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.doesNotMatch(r.stdout, /FAIL /);
  assert.equal(r.status, 0);
});
