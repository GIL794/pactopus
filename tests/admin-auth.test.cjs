/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/ts-loader.cjs');
const { authorizeAdminRequest } = require('../lib/admin-auth.ts');
const T = 'a'.repeat(32);
test('disabled when token unset or too short', () => {
  assert.equal(authorizeAdminRequest('Bearer x', undefined).status, 503);
  assert.equal(authorizeAdminRequest('Bearer short', 'short').status, 503);
});
test('no header, wrong token, wrong scheme are 401', () => {
  assert.equal(authorizeAdminRequest(null, T).status, 401);
  assert.equal(authorizeAdminRequest('Bearer nope', T).status, 401);
  assert.equal(authorizeAdminRequest('Basic ' + T, T).status, 401);
});
test('correct bearer token passes', () => {
  assert.equal(authorizeAdminRequest('Bearer ' + T, T).ok, true);
});
