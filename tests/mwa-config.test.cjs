/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// lib/mwa-config.ts is TypeScript; check the behaviour by reading the source rules it must keep.
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mwa-config.ts'), 'utf8');

test('mainnet app registers only the mainnet chain, everything else only devnet', () => {
  assert.match(src, /cluster === 'mainnet-beta' \? \['solana:mainnet'\] : \['solana:devnet'\]/);
});

test('layout mounts the registration component and it is client only', () => {
  const layout = fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf8');
  assert.match(layout, /<MwaRegister \/>/);
  const comp = fs.readFileSync(path.join(__dirname, '..', 'components', 'MwaRegister.tsx'), 'utf8');
  assert.match(comp, /^'use client';/);
  assert.match(comp, /registerMwa\(/);
});
