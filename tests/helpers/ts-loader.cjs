/* eslint-disable @typescript-eslint/no-require-imports */
// Lets node:test files require() TypeScript modules from lib/ without a build step.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const rootDir = path.resolve(__dirname, '../..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const candidate = path.join(rootDir, request.slice(2));
    if (fs.existsSync(candidate + '.ts')) return candidate + '.ts';
    if (fs.existsSync(candidate + '.tsx')) return candidate + '.tsx';
    return candidate;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    module._compile(code, filename);
  };
}
