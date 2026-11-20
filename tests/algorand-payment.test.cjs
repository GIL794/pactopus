/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const Module = require('node:module');
const oldLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './algo' && parent?.filename.endsWith('algorand-payment.ts')) {
    return {ACTIVE_ALGO_NETWORK:{indexerUrl:'https://testnet-idx.algonode.cloud'}, ALGO_PLATFORM_WALLET:global.treasury};
  }
  return oldLoad.apply(this, arguments);
};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
  module._compile(code, filename);
};
const algo = require('algosdk');
const payer = algo.generateAccount().addr.toString();
const recipient = algo.generateAccount().addr.toString();
global.treasury = algo.generateAccount().addr.toString();
const { verifyAlgoGroup, algoAmountUnits } = require('../lib/algorand-payment.ts');
const groupId = new Uint8Array(32).fill(1);
const expected = {payer,recipient,assetId:10458941,amount:'100.00'};
function tx(id, receiver, amount) { return {id,sender:payer,confirmedRound:123n,group:groupId,assetTransferTransaction:{assetId:10458941,receiver,amount}}; }
const payout = tx('P',recipient,99500000n), fee = tx('F',global.treasury,500000n);
test('decimal conversion is exact', () => {
  assert.equal(algoAmountUnits('1.23'),1230000n);
  assert.throws(() => algoAmountUnits('1.0000001'));
});
test('atomic payout plus platform fee passes', () => assert.equal(verifyAlgoGroup(payout,[payout,fee],'F',expected),true));
for (const [name, change] of [
  ['missing fee',()=>[payout]],
  ['wrong fee amount',()=>[payout,{...fee,assetTransferTransaction:{...fee.assetTransferTransaction,amount:499999n}}]],
  ['wrong sender',()=>[payout,{...fee,sender:recipient}]],
  ['wrong group',()=>[payout,{...fee,group:new Uint8Array(32).fill(2)}]],
  ['unconfirmed',()=>[{...payout,confirmedRound:0n},fee]],
  ['clawback sender',()=>[payout,{...fee,assetTransferTransaction:{...fee.assetTransferTransaction,sender:recipient}}]],
  ['duplicate id',()=>[payout,{...fee,id:'P'}]],
  ['extra transfer',()=>[payout,fee,tx('X',recipient,1n)]],
]) test(name+' fails closed',()=>assert.equal(verifyAlgoGroup(payout,change(),'F',expected),false));
