/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only server guard: fail closed on TCP egress outside IPv4/IPv6 loopback.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const [options] = net._normalizeArgs(args);
  const host = options.host || 'localhost';
  if (options.path || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Test server blocked non-loopback connection: ${host}`);
  }
  return original.apply(this, args);
};
