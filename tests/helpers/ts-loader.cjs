/* eslint-disable @typescript-eslint/no-require-imports */
// Lets node:test files require() TypeScript modules from lib/ without a build step.
const ts = require('typescript');
const fs = require('node:fs');
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    module._compile(code, filename);
  };
}
