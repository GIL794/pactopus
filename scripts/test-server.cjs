/* eslint-disable @typescript-eslint/no-require-imports */
// Start a fresh isolated dev server, never loading project .env files or secrets.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (fs.existsSync(path.join(root, name))) throw new Error(`Remove/rename ${name} before isolated tests. No credentials may be loaded.`);
}
const env = {};
for (const key of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(__dirname, 'test-fonts.cjs'),
  NEXT_PUBLIC_ARC_RPC_URL: 'http://127.0.0.1:9',
  NEXT_PUBLIC_USDC_ADDRESS: '0x0000000000000000000000000000000000000001',
  NEXT_PUBLIC_PLATFORM_WALLET: '0x0000000000000000000000000000000000000002',
  NODE_OPTIONS: `--require=${JSON.stringify(path.join(__dirname, 'test-network-guard.cjs'))}`,
});
const child = spawn(process.execPath, [path.join(__dirname, 'test-next.cjs')], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { console.error(`Isolated server exited: code=${code}, signal=${signal}`); process.exit(code ?? 1); });
