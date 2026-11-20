/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');
const next = require('next');
const app = next({ dev: true, webpack: true, hostname: '127.0.0.1', port: 4317, conf: { webpack(config) { config.devtool = false; config.parallelism = 1; return config; } } });
app.prepare().then(() => {
  const server = http.createServer(app.getRequestHandler());
  server.listen(4317, '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}).catch(error => { console.error(error); process.exit(1); });
