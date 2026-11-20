/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
require('../scripts/test-network-guard.cjs');
test('isolated test server refuses external TCP host', () => {
  const socket = new net.Socket();
  assert.throws(() => socket.connect({host:'example.com',port:443}), /blocked non-loopback/);
  socket.destroy();
});
test('isolated test server refuses external IP and Unix socket', () => {
  for (const options of [{host:'8.8.8.8',port:443}, {path:'/tmp/unsupported.sock'}]) {
    const socket = new net.Socket();
    assert.throws(() => socket.connect(options), /blocked non-loopback/);
    socket.destroy();
  }
});
test('isolated test server permits a loopback connection', async () => {
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    await new Promise((resolve,reject) => {
      const socket = net.connect({host:'127.0.0.1',port:server.address().port});
      socket.on('error',reject);
      socket.on('close',resolve);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
