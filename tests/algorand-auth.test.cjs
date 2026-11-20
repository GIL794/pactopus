/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const Module = require('node:module');
const oldLoad = Module._load;
const used = new Set();
const algo = require('algosdk');
const account = algo.generateAccount();
const rekeySigner = algo.generateAccount();
let authAddress;
const mockAlgo = {...algo, Algodv2: class { accountInformation() { return { exclude() { return this; }, async do() { return { authAddr: authAddress && { toString: () => authAddress } }; } }; } }};
let storageReady = true;
Module._load = function(request,parent,isMain) {
  if (request === 'algosdk' && parent?.filename.endsWith('auth-algo-server.ts')) return mockAlgo;
  if (request === './algo' && parent?.filename.endsWith('auth-algo-server.ts')) return { ACTIVE_ALGO_NETWORK: { algodUrl: 'http://mock.local' }};
  if (request === './db' && parent?.filename.endsWith('auth-algo-server.ts')) return {
    get isCloudDbEnabled(){return storageReady},
    prisma:{authNonce:{create:async ({data})=>{if(used.has(data.nonce)) throw new Error('duplicate');used.add(data.nonce)}}}
  };
  if (request === './auth' && parent?.filename.endsWith('auth-algo-server.ts')) return require('../lib/auth.ts');
  if (request === './schemas' && parent?.filename.endsWith('auth.ts')) return {EvmAddressZ:{},safeParse:()=>({success:false})};
  if (request === './log-redact' && parent?.filename.endsWith('auth.ts')) return {safeLogger:{warn(){}}};
  return oldLoad.apply(this,arguments);
};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {AUTH_HEADERS,stableHash,buildSigningText} = require('../lib/auth.ts');
const {verifyAlgorandOwnerSignature}=require('../lib/auth-algo-server.ts');
const wallet=account.addr.toString();
const body={amount:'2.00',network:'algorand'};
function makeRequest(changes={}, signer=account){
  const nonce=`${Date.now()}:${crypto.randomUUID()}`;
  const bodyHash=stableHash(JSON.stringify(body));
  const pathname='/api/invoices',method='POST';
  const text=buildSigningText({wallet,nonce,method,pathname,bodyHash});
  const signature=Buffer.from(algo.signBytes(new TextEncoder().encode(text),signer.sk)).toString('base64');
  const values={[AUTH_HEADERS.WALLET]:wallet,[AUTH_HEADERS.SIGNATURE]:signature,[AUTH_HEADERS.NONCE]:nonce,[AUTH_HEADERS.BODY_HASH]:bodyHash,...changes};
  return {headers:{get:key=>values[key]},method,nextUrl:{pathname}};
}
test('genuine signed Algorand write succeeds once, replay fails', async()=>{
  const req=makeRequest();assert.equal((await verifyAlgorandOwnerSignature(req,body)).success,true);
  assert.equal((await verifyAlgorandOwnerSignature(req,body)).success,false);
});
test('body, path, missing signature, and storage failure fail closed',async()=>{
  assert.equal((await verifyAlgorandOwnerSignature(makeRequest(),{...body,amount:'3.00'})).success,false);
  const wrongPath=makeRequest();wrongPath.nextUrl.pathname='/api/pay';assert.equal((await verifyAlgorandOwnerSignature(wrongPath,body)).success,false);
  assert.equal((await verifyAlgorandOwnerSignature(makeRequest({[AUTH_HEADERS.SIGNATURE]:''}),body)).success,false);
  storageReady=false;assert.equal((await verifyAlgorandOwnerSignature(makeRequest(),body)).success,false);
});

test('rekeyed auth address signs for spending wallet; original key fails',async()=>{
  storageReady=true; authAddress=rekeySigner.addr.toString();
  assert.equal((await verifyAlgorandOwnerSignature(makeRequest({},rekeySigner),body)).success,true);
  assert.equal((await verifyAlgorandOwnerSignature(makeRequest({},account),body)).success,false);
  authAddress=undefined;
});
