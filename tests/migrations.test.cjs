/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'prisma');
const schema = fs.readFileSync(path.join(root, 'schema.prisma'), 'utf8');
const sql = fs.readdirSync(path.join(root, 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => fs.readFileSync(path.join(root, 'migrations', d.name, 'migration.sql'), 'utf8')).join('\n');
test('Subscription.sessionId and its unique index are created by a migration', () => {
  assert.match(schema, /sessionId\s+String\?\s+@unique\(map: "idx_subscription_session_id_unique"\)/);
  assert.match(sql, /"Subscription" ADD COLUMN IF NOT EXISTS "sessionId"/);
  assert.match(sql, /idx_subscription_session_id_unique/);
});
