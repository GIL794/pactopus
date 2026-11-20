/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
async function main() {
  // Never attach to an already-running app that might carry real credentials.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('Port 4317 is occupied; stop that server first.')));
    probe.listen(4317, '127.0.0.1', () => probe.close(resolve));
  });
  const server = spawn(process.execPath, [path.join(__dirname, 'test-server.cjs')], { cwd: root, stdio: 'inherit' });
  const stop = () => server.kill('SIGTERM');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
  try {
    const deadline = Date.now() + 180_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error('Isolated server exited before readiness');
      try { const response = await fetch('http://127.0.0.1:4317/api/invoices', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)}); if (response.status === 401) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Isolated server timed out');
    const assert = require('node:assert/strict');
    for (const [route, body] of [
      ['/api/invoices', {amount:'1.00',currency:'USDC',description:'Synthetic unsigned test',recipientAddress:'0x0000000000000000000000000000000000000003',network:'arc'}],
      ['/api/pay', {invoiceId:'synthetic-does-not-exist',network:'arc',txHash:'synthetic-not-a-real-receipt'}],
    ]) {
      const response = await fetch(`http://127.0.0.1:4317${route}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      assert.equal(response.status, 401, `${route} rejects unsigned write`);
      const json = await response.json();
      assert.equal(json.authRequired, true);
      console.log(`PASS ${route}: 401 + authRequired`);
    }
  } finally { stop(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
